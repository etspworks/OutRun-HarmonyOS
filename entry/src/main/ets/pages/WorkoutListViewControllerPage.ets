/*
 * S3 structure — port of `WorkoutListViewController`
 * (OutRun/Controllers/Workout/WorkoutListViewController.swift) together with the timeline half of
 * `TabBarController` (OutRun/Controllers/General/TabBarController.swift), which is this screen's
 * chrome: the two bar items (Timeline / Settings), the raised centre add button with its long
 * press, and the 10-tap debug gesture on the bar.
 *
 * Source tree: navigationItem.title = LS["WorkoutListViewController.Headline"], a right bar button
 * whose title is `sortType.stringWithArrow`, and a tableView of WorkoutListCell rows over the
 * centred `noDataLabel`. Each cell carries its OWN day header, so there are no section headers.
 *
 * Bindings (never literals from the capture):
 *   list          DataManager.workoutMonitor — the observable store, through an ArrayDataSource
 *   sort title    this.sortType.titleWithArrow()
 *   empty state   workoutMonitor.numberOfObjects() === 0, exclusive with the list
 *   busy state    monitorWillRefetch -> monitorDidRefetch (the source dims and disables the table)
 *
 * Hosts the two overlays the source presents over this root: the change log
 * (AppDelegate, on a version change) and the sort popover, plus the long-press workout-type alert
 * and the banner queue's current banner (the source draws banners in the key window over this root).
 *
 * S5 style, transcribed from the source's own attributes (not measured off the capture):
 *   navigationBar  barTintColor .backgroundColor; large title systemFont 32 .heavy lowercase
 *                  small-caps in .accentColor; the sort bar button is the bar's .accentColor tint
 *   noDataLabel    .secondaryColor / systemFont 16 .bold, centred
 *   tableView      alpha 0.5 while the monitor refetches (setTable(enabled:))
 *   tabBar         barTintColor .backgroundColor, no translucency and no hairline (the source
 *                  covers it with its own background view); items tint .accentColor when selected
 *                  and .secondaryColor when not, 23pt glyph over the item title
 *   addButton      58x58, cornerRadius 29, .accentColor, 4pt .backgroundColor-at-20% border,
 *                  raised over the bar, with the 20pt .tabbarPlus glyph tinted white
 */
import { router } from '@kit.ArkUI';
import { ChangeLogViewControllerPage } from './ChangeLogViewControllerPage';
import { WorkoutListSortViewControllerPage } from './WorkoutListSortViewControllerPage';
import { WorkoutTypeAlertPage } from './WorkoutTypeAlertPage';
import { workoutTypeFromRaw } from '../model/WorkoutType';
import { Workout } from '../model/Workout';
import { WorkoutListSortKind, WorkoutListSortType } from '../model/WorkoutListSortType';
import { WorkoutFilterClause, WorkoutListFilterKind, WorkoutListFilterType } from '../model/WorkoutListFilterType';
import { TempWorkout } from '../model/TempWorkout';
import { DataManager, WorkoutMonitorObserver } from '../common/DataManager';
import { Banner, BannerQueue, BannerQueueObserver } from '../common/BannerQueue';
import { WorkoutBuilder } from '../common/WorkoutBuilder';
import { OptionalStringPreference } from '../common/UserPreferences';
import { Config } from '../common/Config';
import { showConfirmAlert, showDismissableAlert, showErrorAlert } from '../common/AlertDialogs';
import { ArrayDataSource } from '../common/ArrayDataSource';
import { localizedString } from '../common/LocalizedStrings';
import { WorkoutListCell } from '../components/WorkoutListCell';
import { WorkoutListHeader } from '../components/WorkoutListHeader';
import { ORBaseBanner } from '../components/ORBaseBanner';
import { TAB_SETTINGS, TAB_TIMELINE, TabBar } from '../components/TabBar';



/**
 * Source: `AppDelegate.lastVersion` — its own UserPreference key, not one of UserPreferences'.
 * The change log is presented over this root on a version change, so the key is read here.
 */
const LAST_VERSION: OptionalStringPreference = new OptionalStringPreference('lastVersion');
/** The overlays THIS page hosts (the AppStorage key `EntryAbility` leaves a deep-link in is
 * 'deepLinkOverlay', read by the @StorageLink below): AppDelegate presents the change log over this
 * root, `sortItem` owns the sort popover and
 * `TabBarController.displayNewWorkoutAlert()` presents the type alert over the same root. */
const CHANGELOG_OVERLAY: string = 'ChangeLogViewController';
const SORT_OVERLAY: string = 'WorkoutListSortViewController';
const TYPE_ALERT_OVERLAY: string = 'WorkoutTypeAlert';

/** Source: `ListSectionObserver` on the controller — the monitor callbacks it implements. */
class MonitorObserver implements WorkoutMonitorObserver {
  private readonly onChange: () => void;
  private readonly onWillRefetch: () => void;
  private readonly onDidRefetch: () => void;

  constructor(onChange: () => void, onWillRefetch: () => void, onDidRefetch: () => void) {
    this.onChange = onChange;
    this.onWillRefetch = onWillRefetch;
    this.onDidRefetch = onDidRefetch;
  }

  monitorDidChange(): void {
    this.onChange();
  }

  monitorWillRefetch(): void {
    this.onWillRefetch();
  }

  monitorDidRefetch(): void {
    this.onDidRefetch();
  }
}

/** Source: `ORBannerQueue`'s observer — the key window redraws when the queue changes. */
class QueueObserver implements BannerQueueObserver {
  private readonly onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
  }

  bannerQueueDidChange(): void {
    this.onChange();
  }
}

@Entry
@Component
struct WorkoutListViewControllerPage {
  /** Source: TabBarController.selectedIndex — 0 timeline, 2 settings. */
  @StorageLink('selectedTab') selectedTab: number = TAB_TIMELINE;
  /**
   * Source: `sortType = WorkoutListSortType.day(true)` with `didSet { refetchWithFilters() }` —
   * the sort sheet writes this through @Link, so the re-query hangs off @Watch, not off the sheet.
   */
  @State @Watch('onFiltersChanged') sortType: WorkoutListSortType =
    new WorkoutListSortType(WorkoutListSortKind.DAY, true);
  /** Source: `filterTypes: [WorkoutListFilterType] = []`, same `didSet`. */
  @State @Watch('onFiltersChanged') filterTypes: WorkoutListFilterType[] = [];
  /**
   * Source: `ClearSettingsViewController`'s type rows writing `listController.filterTypes` — the
   * sort sheet pushes that page, so the selection arrives through this shared key (-1 = the
   * source's 'All', i.e. no `.type(...)` clause at all).
   */
  @StorageLink('workoutListTypeFilter') @Watch('onTypeFilterChanged') typeFilterRaw: number = -1;
  /**
   * The overlay deep-link channel, READ REACTIVELY. `EntryAbility` stamps this key on EVERY deep
   * link — cold (before `loadContent`) and warm (`onNewWant`, where this page is already on the
   * router stack and `aboutToAppear` never runs again), so consuming it only in `aboutToAppear`
   * mounted the overlay on the first launch per host and on no later one. `@Watch` fires on the
   * warm write, `onPageShow()` covers a return to this page, and the consume clears the key back
   * to '' — which is also what makes re-arming the SAME overlay a CHANGE the watch can see.
   */
  @StorageLink('deepLinkOverlay') @Watch('onDeepLinkOverlayChanged') deepLinkOverlay: string = '';
  /** Source: `displayNewWorkoutAlert()`'s presented alert. */
  @State isTypeAlertShown: boolean = false;
  /** Source: `showSortController`'s presented popover — cleared when the sheet dismisses itself. */
  @State isSortShown: boolean = false;
  /** Source: `setTable(enabled:)` — between listMonitorWillRefetch and listMonitorDidRefetch. */
  @State isRefetching: boolean = false;
  /**
   * Source: `DataManager.workoutMonitor` — the rows the source's ListMonitor holds, adapted for
   * LazyForEach. Filled from the monitor, never seeded with literals, and REPLACED on every
   * monitor change so the empty/populated branch below re-evaluates.
   */
  @State workoutMonitor: ArrayDataSource<Workout> = new ArrayDataSource<Workout>([]);
  /** Source: `ORBannerQueue.default`'s current banner. */
  @State currentBanner: Banner | null = null;
  /** Source: AppDelegate presenting ChangeLogViewController over this root — the overlay's state. */
  @State isChangeLogShown: boolean = false;
  /** Source: `changeLogController.changeLog = Config.changeLogs[Config.version]`. */
  @State changeLogText: string = '';

  private monitorObserver: MonitorObserver = new MonitorObserver(
    (): void => {
      this.reloadFromMonitor();
    },
    (): void => {
      this.isRefetching = true;
    },
    (): void => {
      this.isRefetching = false;
    });

  private queueObserver: QueueObserver = new QueueObserver((): void => {
    this.currentBanner = BannerQueue.DEFAULT.current;
  });

  /**
   * S5: the source presents the changelog `.overFullScreen` with its OWN blurred backdrop and its
   * own rounded card, so the dialog must add neither — `customStyle` drops ArkUI's default white
   * container and insets, and the mask is cleared because `effectView` is the backdrop.
   */
  private changeLogDialog: CustomDialogController = new CustomDialogController({
    builder: ChangeLogViewControllerPage({
      changeLog: this.changeLogText,
      isChangeLogShown: $isChangeLogShown
    }),
    autoCancel: true,
    customStyle: true,
    alignment: DialogAlignment.Center,
    maskColor: 'rgba(0,0,0,0)'
  });

  /**
   * S5 geometry, measured off the capture (S0044 `base.ui.json`): the popover is the 250x307pt
   * card at `[121,79][371,386]` on the 390x844pt screen — i.e. pinned to the TOP-END corner, 19pt
   * in from the trailing edge and 79pt down, under the list's sort bar button. A UIKit popover
   * does NOT dim what is behind it (the captured list renders at full brightness), so the mask is
   * cleared, and `customStyle` drops ArkUI's own white container so the sheet paints its own.
   */
  private sortDialog: CustomDialogController = new CustomDialogController({
    builder: WorkoutListSortViewControllerPage({
      filterTypes: $filterTypes,
      sortType: $sortType,
      isShown: $isSortShown
    }),
    autoCancel: true,
    customStyle: true,
    alignment: DialogAlignment.TopEnd,
    offset: { dx: -19, dy: 79 },
    maskColor: 'rgba(0,0,0,0)'
  });

  /**
   * Source: `TabBarController.displayNewWorkoutAlert()` — the long press on the centre add button
   * presents WorkoutTypeAlert WITH a manualAction, so 'Enter Manually' is offered here.
   */
  private typeAlert: CustomDialogController = new CustomDialogController({
    builder: WorkoutTypeAlertPage({
      allowsManualEntry: true,
      isShown: $isTypeAlertShown,
      /**
       * Source: `manualAction: { showDetailViewController(NavigationController(rootViewController:
       * EditWorkoutController()), sender:) }` — the tab bar owns where manual entry goes, and
       * supplying it is what adds the 'Enter Manually' option. It passes NO type action, so the
       * alert pushes the recording screen FOR THE CHOSEN TYPE, as the source's closure does.
       */
      manualAction: (): void => {
        router.pushUrl({ url: 'pages/EditWorkoutControllerPage' });
      }
    }),
    autoCancel: true,
    /** S5: same alert card as the other call site — the sheet paints its own chrome. */
    customStyle: true,
    alignment: DialogAlignment.Center
  });

  /** Source: `viewDidLoad` — DataManager.workoutMonitor.addObserver(self) and the first fetch. */
  aboutToAppear(): void {
    DataManager.workoutMonitor.addObserver(this.monitorObserver);
    BannerQueue.DEFAULT.addObserver(this.queueObserver);
    this.currentBanner = BannerQueue.DEFAULT.current;
    this.refetchWithFilters();
    this.checkForTerminationWorkout();
    this.presentChangeLogIfNeeded();
    this.presentDeepLinkOverlay();
  }

  /** The warm half of the deep-link channel: this page is already up, so nothing re-runs
   * `aboutToAppear` — the AppStorage write itself has to mount the overlay. */
  onDeepLinkOverlayChanged(): void {
    this.presentDeepLinkOverlay();
  }

  /** A deep link that pushed this page again, or a return to it, shows it without constructing
   * it — the key is still armed in both cases. */
  onPageShow(): void {
    this.presentDeepLinkOverlay();
  }

  /** Source: `deinit` — removeObserver. */
  aboutToDisappear(): void {
    DataManager.workoutMonitor.removeObserver(this.monitorObserver);
    BannerQueue.DEFAULT.removeObserver(this.queueObserver);
  }

  build() {
    Stack() {
      Column() {
        /** Source: `navigationItem.title` + the right bar button. */
        Row() {
          Text(localizedString('WorkoutListViewController.Headline'))
            .fontSize(32)
            .fontWeight(900)
            .lineHeight(39)
            .fontFeature('"smcp" 1')
            .fontColor($r('app.color.accent_color'))
            .maxLines(1)
            .alignSelf(ItemAlign.End)
          Blank()
          /** Source: `sortItem.title = sortType.stringWithArrow` — DATA-BOUND. */
          Text(this.sortType.titleWithArrow())
            .id('workout_list_sort')
            .fontSize(17)
            .fontColor($r('app.color.accent_color'))
            .maxLines(1)
            .alignSelf(ItemAlign.Start)
            .onClick(() => {
              this.showSortController();
            })
        }
        .width('100%')
        .height(96)
        .padding({ left: 15, right: 15, top: 8, bottom: 8 })
        /**
         * Source: the tableView over `noDataLabel`. The two are exclusive —
         * `noDataLabel.isHidden = numberOfObjects() != 0` (plan variants has_workouts/no_workouts).
         */
        if (this.workoutMonitor.totalCount() === 0) {
          Text(localizedString('NoData.Message'))
            .layoutWeight(1)
            .width('100%')
            .padding({ left: 20, right: 20 })
            .fontSize(16)
            .fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.secondary_color'))
            .textAlign(TextAlign.Center)
            .align(Alignment.Center)
        } else {
          List() {
            LazyForEach(this.workoutMonitor, (workout: Workout) => {
              ListItem() {
                Column() {
                  /** Source: `WorkoutListCell.headerView` — one WorkoutListHeader per cell. */
                  WorkoutListHeader({ dayIdentifier: workout.dayIdentifier })
                  WorkoutListCell({ workout: workout })
                }
                .id('workout_list_itemroot')
                .onClick(() => {
                  this.openWorkout(workout);
                })
              }
            }, (workout: Workout) => workout.uuid !== null ? workout.uuid : '')
          }
          .layoutWeight(1)
          .width('100%')
          .scrollBar(BarState.Off)
          /** Source: `setTable(enabled:)` — alpha 0.5 and interaction off while it refetches. */
          .opacity(this.isRefetching ? 0.5 : 1)
          .enabled(!this.isRefetching)
        }
        /** Source: `TabBarController.tabBar` — the bar every tab shares (components/TabBar). */
        TabBar({
          selectedTab: this.selectedTab,
          onTimeline: (): void => {
            this.selectedTab = TAB_TIMELINE;
          },
          onAdd: (): void => {
            this.openNewWorkout();
          },
          onAddLongPress: (): void => {
            this.isTypeAlertShown = true;
            this.typeAlert.open();
          },
          onSettings: (): void => {
            this.openSettings();
          }
        })
      }
      /** Source: the banner queue draws its current banner over this root. */
      if (this.currentBanner !== null) {
        ORBaseBanner({ banner: this.currentBanner }) {
          Text(this.bannerText())
        }
      }
    }
    .id('WorkoutListViewControllerPage')
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background_color'))
  }

  /**
   * Source: `filterTypes` being reassigned by the type rows — `refetchWithFilters()` follows the
   * write in the source too.
   */
  private onTypeFilterChanged(): void {
    const kept: WorkoutListFilterType[] = [];
    for (const filter of this.filterTypes) {
      if (filter.kind !== WorkoutListFilterKind.TYPE) {
        kept.push(filter);
      }
    }
    if (this.typeFilterRaw >= 0) {
      kept.push(WorkoutListFilterType.ofType(workoutTypeFromRaw(this.typeFilterRaw)));
    }
    // the assignment itself re-queries, through onFiltersChanged
    this.filterTypes = kept;
  }

  /** Source: the `didSet` on BOTH `filterTypes` and `sortType` — `refetchWithFilters()`. */
  private onFiltersChanged(): void {
    this.refetchWithFilters();
  }

  /** Source: `refetchWithFilters()` — the filter clauses plus the sort's OrderBy. */
  private async refetchWithFilters(): Promise<void> {
    const clauses: WorkoutFilterClause[] = [];
    for (const filter of this.filterTypes) {
      clauses.push(filter.fetchClause());
    }
    await DataManager.workoutMonitor.refetch(clauses, this.sortType.fetchClause());
  }

  /**
   * Source: the ListMonitor callbacks — `tableView.reloadData()` plus `noDataLabel.isHidden =
   * numberOfObjects() != 0`. Reassigning the data source is what re-runs the empty-state branch.
   */
  private reloadFromMonitor(): void {
    const objects: Workout[] = DataManager.workoutMonitor.objects();
    if ((objects.length === 0) !== (this.workoutMonitor.totalCount() === 0)) {
      // The empty-state branch flips: a new source re-runs it.
      this.workoutMonitor = new ArrayDataSource<Workout>(objects);
      return;
    }
    // A replaced source object does not make LazyForEach drop rows that are already built (a
    // deleted workout stayed on the Timeline); reloading the same source does.
    this.workoutMonitor.reload(objects);
  }

  private bannerText(): string {
    const banner: Banner | null = this.currentBanner;
    return banner !== null ? banner.text : '';
  }

  /** Source: `showSortController(sourceView:)` — presented as a popover. */
  private showSortController(): void {
    this.isSortShown = true;
    this.sortDialog.open();
  }

  /** Source: `tableView(_:didSelectRowAt:)` — showDetailViewController(WorkoutViewController). */
  private openWorkout(workout: Workout): void {
    router.pushUrl({
      url: 'pages/WorkoutViewControllerPage',
      params: { 'workoutUUID': workout.uuid } as Record<string, string | null>
    });
  }

  /** Source: `TabBarController.showNewWorkoutController()` from the centre add button. */
  private openNewWorkout(): void {
    router.pushUrl({ url: 'pages/NewWorkoutViewControllerPage' });
  }

  /** Source: the tab swap to the settings tab — the source swaps the root, it does not push. */
  private openSettings(): void {
    this.selectedTab = TAB_SETTINGS;
    router.replaceUrl({ url: 'pages/SettingsViewControllerPage' });
  }

  /**
   * Source: `AppDelegate.checkForTerminationWorkout(controller:)`, run over this root right after
   * launch: the workout that was recording when the app went away is offered as Save / Cancel, and
   * saving it stores the workout and opens it. The snapshot is
   * `WorkoutBuilder.currentlyActive.createSnapshot()`, which is where
   * `AppDelegate.tryToSaveRecodingWorkout()` took it from too.
   *
   * The cross-LAUNCH half: with no builder in memory, `didSaveWorkoutOnTermination` still set
   * means the process died mid-recording. A decodable `termWorkoutData` snapshot is offered as
   * Rescued Workout (Save / Cancel); without one it is the Lost Workout alert. The term keys are
   * deleted before asking, as the source does. A builder still in memory is offered the same way;
   * either answer clears it.
   */
  private async checkForTerminationWorkout(): Promise<void> {
    const builder: WorkoutBuilder | null = WorkoutBuilder.currentlyActive;
    if (builder === null) {
      if (!WorkoutBuilder.didSaveWorkoutOnTermination.value) {
        return;
      }
      const data: string | null = WorkoutBuilder.termWorkoutSaveSuccess.value
        ? WorkoutBuilder.termWorkoutData.value : null;
      const rescued: TempWorkout | null = data !== null ? TempWorkout.fromJSONString(data) : null;
      WorkoutBuilder.didSaveWorkoutOnTermination.delete();
      WorkoutBuilder.termWorkoutSaveSuccess.delete();
      WorkoutBuilder.termWorkoutData.delete();
      if (rescued === null) {
        await showDismissableAlert(localizedString('TerminationBackup.LostAlert.Title'),
          localizedString('TerminationBackup.LostAlert.Message'));
        return;
      }
      await this.offerRescuedWorkout(rescued);
      return;
    }
    const snapshot: TempWorkout | null = builder.createSnapshot();
    if (snapshot === null) {
      return;
    }
    await this.offerRescuedWorkout(snapshot, builder);
  }

  /** Source: the Rescued Workout alert — Save stores the workout and opens it, Cancel drops it. */
  private async offerRescuedWorkout(snapshot: TempWorkout, builder: WorkoutBuilder | null = null): Promise<void> {
    const shouldSave: boolean = await showConfirmAlert(
      localizedString('TerminationBackup.SaveAlert.Title'),
      localizedString('TerminationBackup.SaveAlert.Message'),
      localizedString('Save'), false);
    if (builder !== null) {
      builder.actOnDismiss();
    }
    if (!shouldSave) {
      return;
    }
    const workout: Workout | null = await DataManager.saveTempWorkout(snapshot);
    if (workout === null) {
      await showErrorAlert(localizedString('TerminationBackup.Save.Error'));
      return;
    }
    this.openWorkout(workout);
  }

  /**
   * Source: AppDelegate — present(ChangeLogViewController) over this root when the stored
   * `lastVersion` is neither nil nor the current version, then store the current version.
   */
  private presentChangeLogIfNeeded(): void {
    const stored: string | null = LAST_VERSION.value;
    const current: string = Config.version;
    if (stored === current) {
      return;
    }
    const text: string | undefined = Config.changeLogs.get(current);
    if (stored !== null && text !== undefined) {
      this.changeLogText = text;
      this.isChangeLogShown = true;
      this.changeLogDialog.open();
    }
    LAST_VERSION.value = current;
  }

  /**
   * The pipeline's deep-link channel for the overlays this page HOSTS: `EntryAbility` cannot route
   * to `ChangeLogViewController` (it is a `@CustomDialog`, not a page), so it opens this host and
   * leaves the overlay's name in AppStorage for us to mount. Source-faithful in what it shows: this
   * build's version ships no changelog entry, and the source's own capture opener falls back to the
   * newest entry the app HAS rather than inventing content (GalleryOpeners.swift:199-206) — with an
   * empty changelog the overlay closes itself, exactly as `viewDidLoad` does.
   */
  private presentDeepLinkOverlay(): void {
    const requested: string = this.deepLinkOverlay;
    if (requested.length === 0) {
      return;
    }
    if (requested === SORT_OVERLAY) {
      this.deepLinkOverlay = '';
      if (this.isSortShown) {
        return;
      }
      this.showSortController();
      return;
    }
    if (requested === TYPE_ALERT_OVERLAY) {
      this.deepLinkOverlay = '';
      if (this.isTypeAlertShown) {
        return;
      }
      this.isTypeAlertShown = true;
      this.typeAlert.open();
      return;
    }
    if (requested !== CHANGELOG_OVERLAY) {
      return;
    }
    this.deepLinkOverlay = '';
    if (this.isChangeLogShown) {
      return;
    }
    const logs: Map<string, string> = Config.changeLogs;
    let text: string | undefined = logs.get(Config.version);
    if (text === undefined && Config.VERSIONS.length > 0) {
      /* `Config.VERSIONS` is oldest-first, so its last entry is the newest release the app knows —
       * the one the changelog table is keyed on. */
      text = logs.get(Config.VERSIONS[Config.VERSIONS.length - 1]);
    }
    if (text === undefined || text.length === 0) {
      return;
    }
    this.changeLogText = text;
    this.isChangeLogShown = true;
    this.changeLogDialog.open();
  }
}
