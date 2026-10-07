/*
 * Port of `AppDelegate` (OutRun/Support Files/AppDelegate.swift).
 *
 *  - cold-start root: ProgressViewController while `DataManager.setup` runs (AppDelegate.swift:39-87);
 *    that page then replaces itself with the workout list or the start screen per
 *    `UserPreferences.isSetUp` (AppDelegate.swift:43-49).
 *  - `applicationWillEnterForeground` / `applicationDidEnterBackground` (AppDelegate.swift:95-103).
 *  - `HealthObserver.setupObservers()` behind the same isSetUp gate (AppDelegate.swift:54-55).
 *  - `want.parameters.targetPage` is the pipeline's deep-link channel, handled in onCreate
 *    (cold launch, resolved by loadContent) and onNewWant (warm launch, routed on the stack).
 */
import { AbilityConstant, ConfigurationConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { Router, window } from '@kit.ArkUI';
import { ApplicationStateObservation } from '../common/ApplicationStateObservation';
import { ApplicationState } from '../model/ApplicationState';
import { WorkoutMapImageManager } from '../common/WorkoutMapImageManager';
import { setFileContext } from '../common/BackupManager';
import { setSettingsContext } from '../common/SettingsModelEngine';
import { HealthObserver } from '../common/HealthObserver';
import { UserPreferences } from '../common/UserPreferences';
import { DataManager } from '../common/DataManager';
import { setQaFaults } from '../common/QaHooks';

const DOMAIN = 0x0000;
/**
 * Source: AppDelegate loads the launch screen, then runs `DataManager.setup` behind
 * ProgressViewController and only then swaps in TabBarController / StartScreenViewController.
 * The progress page owns that setup and picks the root itself (its two `replace` edges).
 */
const PROGRESS_ROOT: string = 'pages/ProgressViewControllerPage';
/**
 * The registered page set, mirroring `entry/src/main/resources/base/profile/main_pages.json`.
 * Only a page in this list can be loaded or pushed; the four `@CustomDialog` overlays are
 * deliberately not pages (they are mounted by their host screen).
 */
const REGISTERED_PAGES: string[] = [
  'pages/StartScreenViewControllerPage',
  'pages/SetupViewControllerPage',
  'pages/PolicyViewControllerPage',
  'pages/WorkoutListViewControllerPage',
  'pages/SettingsViewControllerPage',
  'pages/EditWorkoutControllerPage',
  'pages/NewWorkoutViewControllerPage',
  'pages/WorkoutViewControllerPage',
  'pages/ProgressViewControllerPage',
  'pages/ClearSettingsViewControllerPage',
  'pages/DebugControllerPage',
  'pages/HKImportListControllerPage',
  'pages/EditWorkoutPauseControllerPage',
  'pages/WorkoutMapViewControllerPage'
];
/**
 * An overlay screen is NOT a route: each of these is a `@CustomDialog` mounted by its host, exactly
 * as the source presents it. A deep link naming one therefore opens its HOST and asks the host to
 * mount it, which is the only way the pipeline can reach an overlay without turning it into a page.
 * The host of each is the one the source (and the capture's own opener) presents it from:
 *  - ChangeLogViewController      AppDelegate presents it over the tab root (the timeline).
 *  - WorkoutListSortViewController `WorkoutListViewController.sortItem`'s popover.
 *  - WorkoutTypeAlert             `TabBarController.displayNewWorkoutAlert()` over the tab root.
 *  - WorkoutShareAlert            the share button on `WorkoutViewController`.
 */
const OVERLAY_HOSTS: Map<string, string> = new Map<string, string>([
  ['ChangeLogViewController', 'pages/WorkoutListViewControllerPage'],
  ['WorkoutListSortViewController', 'pages/WorkoutListViewControllerPage'],
  ['WorkoutTypeAlert', 'pages/WorkoutListViewControllerPage'],
  ['WorkoutShareAlert', 'pages/WorkoutViewControllerPage']
]);
/**
 * The key the host page reads and clears once it has mounted the overlay. The host reads it
 * through `@StorageLink` + `@Watch`, so the write itself mounts the overlay — which is what makes
 * a WARM deep link work: `onNewWant` runs with the host already on the router stack, and nothing
 * re-runs its `aboutToAppear`.
 */
const DEEP_LINK_OVERLAY: string = 'deepLinkOverlay';
/**
 * The page a `targetPage` deep link resolved to, or '' for an ordinary cold start. Only the
 * progress page reads it: the source shows ProgressViewController purely as the launch-sequence
 * display (AppDelegate.swift:39-89 owns the root swap, ProgressViewController.swift:23-48 has no
 * navigation of its own), so when the link names THAT page the page is the destination and must
 * not run AppDelegate's swap out of it. Every other page is unaffected.
 */
const DEEP_LINK_PAGE: string = 'deepLinkPage';
/** A `policyType` want parameter, read once by PolicyViewControllerPage when it has no router params. */
const DEEP_LINK_POLICY_TYPE: string = 'deepLinkPolicyType';

export default class EntryAbility extends UIAbility {
  private pendingTargetPage: string | null = null;
  private mainWindowStage: window.WindowStage | null = null;

  /**
   * The pipeline replay launches every screen with `targetPage` in the want parameters, and it
   * passes the BARE ROUTE NAME (`StartScreenViewController`), not a page url. Resolve it to the
   * registered page path; an already-resolved `pages/...` value is accepted as-is.
   * Returns null for an unregistered name, so the caller falls back to the normal cold start.
   */
  private targetPageOf(want: Want): string | null {
    const params: Record<string, Object> | undefined = want.parameters;
    const faults: Object | undefined = params !== undefined ? params['qaFault'] : undefined;
    setQaFaults(typeof faults === 'string' ? faults : '');
    if (params === undefined) {
      return null;
    }
    // The policy page's `type` travels with the link too (`--ps policyType <raw>`), so the source's
    // type == nil branch (headline "Error", no request) is reachable: no screen ever opens it bare.
    const policyType: Object | undefined = params['policyType'];
    AppStorage.setOrCreate<string>(DEEP_LINK_POLICY_TYPE, typeof policyType === 'string' ? policyType : '');
    // Likewise the workout page's id (`--ps workoutUUID <id>`): an id that resolves to nothing is
    // the source's nil-workout branch (headline "ERROR", the loading-error alert).
    const workoutUUID: Object | undefined = params['workoutUUID'];
    AppStorage.setOrCreate<string>('deepLinkWorkoutUUID', typeof workoutUUID === 'string' ? workoutUUID : '');
    const raw: Object | undefined = params['targetPage'];
    if (typeof raw !== 'string') {
      return null;
    }
    const name: string = raw as string;
    if (name.length === 0) {
      return null;
    }
    const candidates: string[] = [name, 'pages/' + name, 'pages/' + name + 'Page'];
    for (const candidate of candidates) {
      if (REGISTERED_PAGES.includes(candidate)) {
        return candidate;
      }
    }
    const overlayHost: string | undefined = OVERLAY_HOSTS.get(name);
    if (overlayHost !== undefined) {
      AppStorage.setOrCreate<string>(DEEP_LINK_OVERLAY, name);
      return overlayHost;
    }
    hilog.error(DOMAIN, 'EntryAbility', 'targetPage %{public}s is not a registered page', name);
    return null;
  }

  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    try {
      this.context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET);
    } catch (err) {
      hilog.error(DOMAIN, 'EntryAbility', 'Failed to set colorMode. Cause: %{public}s', JSON.stringify(err));
    }
    setFileContext(this.context);
    setSettingsContext(this.context);
    this.pendingTargetPage = this.targetPageOf(want);
    AppStorage.setOrCreate<string>(DEEP_LINK_PAGE,
      this.pendingTargetPage !== null ? this.pendingTargetPage : '');
    if (UserPreferences.isSetUp.value) {
      HealthObserver.setupObservers();
    }
  }

  onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    const target: string | null = this.targetPageOf(want);
    if (target === null) {
      return;
    }
    AppStorage.setOrCreate<string>(DEEP_LINK_PAGE, target);
    if (this.mainWindowStage === null) {
      this.pendingTargetPage = target;
      return;
    }
    try {
      const router: Router = this.mainWindowStage.getMainWindowSync().getUIContext().getRouter();
      // Already showing the target (the normal case for an overlay deep link, whose host is the
      // page we are on): pushing a SECOND copy of the host is what a warm link used to do, and it
      // buries the page whose `@StorageLink` just mounted the overlay under a fresh empty one.
      // The AppStorage write in `targetPageOf` is the whole mount path here — nothing to push.
      if (router.getState().name === target.substring(target.lastIndexOf('/') + 1)) {
        return;
      }
      router.pushUrl({ url: target });
    } catch (err) {
      // A failed push leaves no host to consume the key, so clear it: otherwise the next ordinary
      // navigation to that host would open the overlay out of nowhere.
      AppStorage.setOrCreate<string>(DEEP_LINK_OVERLAY, '');
      hilog.error(DOMAIN, 'EntryAbility', 'deep link to %{public}s failed: %{public}s',
        target, JSON.stringify(err));
    }
  }

  onDestroy(): void {
    HealthObserver.teardownObservers();
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    this.mainWindowStage = windowStage;
    const root: string = this.pendingTargetPage !== null ? this.pendingTargetPage : PROGRESS_ROOT;
    if (this.pendingTargetPage !== null && this.pendingTargetPage !== PROGRESS_ROOT) {
      // A deep link skips the progress page, so the store still has to be opened. `setup` is
      // idempotent, so this never repeats the migration the progress page reports. A link TO the
      // progress page is excluded: that page runs setup itself and drives its bar from it, and a
      // second concurrent call would leave the bar at 0.
      DataManager.setup((value: number): void => {
        hilog.info(DOMAIN, 'EntryAbility', 'store migration %{public}f', value);
      }).catch((err: Object) => {
        hilog.error(DOMAIN, 'EntryAbility', 'DataManager.setup failed: %{public}s', JSON.stringify(err));
      });
    }
    this.pendingTargetPage = null;
    windowStage.loadContent(root, (err) => {
      if (err.code) {
        hilog.error(DOMAIN, 'EntryAbility', 'Failed to load %{public}s. Cause: %{public}s',
          root, JSON.stringify(err));
      }
    });
  }

  onWindowStageDestroy(): void {
    this.mainWindowStage = null;
  }

  onForeground(): void {
    WorkoutMapImageManager.resumeRenderProcess();
    ApplicationStateObservation.stateChanged(ApplicationState.FOREGROUND);
  }

  onBackground(): void {
    WorkoutMapImageManager.suspendRenderProcess();
    ApplicationStateObservation.stateChanged(ApplicationState.BACKGROUND);
  }
}
