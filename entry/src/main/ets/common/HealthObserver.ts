/*
 * Port of `HealthObserver` (OutRun/Models/HealthKit/HealthObserver.swift:24-203).
 *
 * REGISTERED substitution, recorded against `setupObservers` in the module contract:
 * `HKAnchoredObjectQuery` — a long-lived query the system re-fires whenever the health store
 * changes — has no HMS Health Service Kit equivalent here, so the observer becomes a POLL over the
 * same query:
 *
 *   - on foreground: EntryAbility raises ApplicationStateObservation.stateChanged, and this module
 *     is a registered observer, so every return to the foreground runs one pass.
 *   - periodically: `workScheduler.startWork` repeats `HealthPollAbility` (declared in
 *     module.json5), which runs the same pass with the app closed.
 *
 * Everything else is the source's logic: the same sync/auto-import preference guards, the same
 * per-pass supersede guard (`lastWorkoutQuery` / `lastWeightQuery`), and a persisted anchor so a
 * pass only looks at records newer than the last one it saw.
 *
 * The source's deleted-objects branch has no local counterpart: deleting a health record and
 * dropping the app's reference to it are the same single write here (HealthStoreManager
 * .deleteHealthWorkout), so a reference whose record vanished cannot exist. A loop that can never
 * fire is left out rather than written as dead code.
 */
import { bundleManager } from '@kit.AbilityKit';
import { workScheduler } from '@kit.BackgroundTasksKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { ApplicationState } from '../model/ApplicationState';
import { HKWorkoutQueryObject } from '../model/HKWorkoutQueryObject';
import { Workout } from '../model/Workout';
import { ApplicationStateObserver, startObservingApplicationState, stopObservingApplicationState }
  from './ApplicationStateObservation';
import { OptionalNumberPreference, UserPreferences } from './UserPreferences';
import { DataManager } from './DataManager';
import { DataQueryManager } from './DataQueryManager';
import { HEALTH_BODY_MASS_DATE } from './HealthStoreManager';
import { HealthQueryManager } from './HealthQueryManager';

const DOMAIN: number = 0x0000;
const TAG: string = 'HealthObserver';

/** `workId` of the repeating poll, and its interval (20 min is the platform's shortest repeat). */
const HEALTH_POLL_WORK_ID: number = 1;
const HEALTH_POLL_INTERVAL_MS: number = 1200000;
const HEALTH_POLL_ABILITY_NAME: string = 'HealthPollAbility';

/** Raised by EntryAbility's onForeground — the half of the poll the user actually triggers. */
class HealthForegroundObserver implements ApplicationStateObserver {
  didUpdateApplicationState(state: ApplicationState): void {
    if (state !== ApplicationState.FOREGROUND) {
      return;
    }
    HealthObserver.poll().catch((err: Object): void => {
      hilog.error(DOMAIN, TAG, 'foreground poll failed: %{public}s', JSON.stringify(err));
    });
  }
}

const FOREGROUND_OBSERVER: HealthForegroundObserver = new HealthForegroundObserver();

function pollWorkInfo(): workScheduler.WorkInfo {
  const info: bundleManager.BundleInfo = bundleManager.getBundleInfoForSelfSync(
    bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
  const work: workScheduler.WorkInfo = {
    workId: HEALTH_POLL_WORK_ID,
    bundleName: info.name,
    abilityName: HEALTH_POLL_ABILITY_NAME,
    batteryStatus: workScheduler.BatteryStatus.BATTERY_STATUS_LOW_OR_OKAY,
    isRepeat: true,
    repeatCycleTime: HEALTH_POLL_INTERVAL_MS
  };
  return work;
}

export class HealthObserver {

  /** Source: `var count` / `var queryObjects` inside the workout update closure. */
  static count: number = 0;
  static queryObjects: HKWorkoutQueryObject[] = [];

  /**
   * Source: `lastWorkoutQuery` / `lastWeightQuery` — the running query, against which a superseded
   * one stops itself. Here it is the id of the pass that owns the poll.
   */
  static lastWorkoutQuery: number | null = null;
  static lastWeightQuery: number | null = null;

  /**
   * Source: `previousWorkoutObserverAnchorData` — the opaque `HKQueryAnchor` archived into a
   * preference. The local anchor is the timestamp of the newest record a pass has seen, under the
   * source's own key. (The source reused the workout key for the weight anchor too, which made the
   * two collide; the weight anchor gets its own key here.)
   */
  static readonly previousWorkoutObserverAnchorData: OptionalNumberPreference =
    new OptionalNumberPreference('previousWorkoutAnchorData');
  static readonly previousWeightObserverAnchorData: OptionalNumberPreference =
    new OptionalNumberPreference('previousWeightAnchorData');

  static get previousWorkoutObserverAnchor(): Date | null {
    const millis: number | null = HealthObserver.previousWorkoutObserverAnchorData.value;
    return millis === null ? null : new Date(millis);
  }

  static set previousWorkoutObserverAnchor(anchor: Date | null) {
    if (anchor === null) {
      return;
    }
    HealthObserver.previousWorkoutObserverAnchorData.value = anchor.getTime();
  }

  static get previousWeightObserverAnchor(): Date | null {
    const millis: number | null = HealthObserver.previousWeightObserverAnchorData.value;
    return millis === null ? null : new Date(millis);
  }

  static set previousWeightObserverAnchor(anchor: Date | null) {
    if (anchor === null) {
      return;
    }
    HealthObserver.previousWeightObserverAnchorData.value = anchor.getTime();
  }

  /**
   * Source: `workoutObserverUpdateClosure` — what the anchored workout query ran on every change.
   * `pass` is the id of the poll pass that owns it, so a later pass supersedes an earlier one
   * exactly where the source compared `lastWorkoutQuery == query`.
   */
  static readonly workoutObserverUpdateClosure: (pass: number) => Promise<void> =
    async (pass: number): Promise<void> => {
      if (HealthObserver.lastWorkoutQuery === null) {
        HealthObserver.lastWorkoutQuery = pass;
      }
      if (!UserPreferences.synchronizeWorkoutsWithAppleHealth.value
        || HealthObserver.lastWorkoutQuery !== pass) {
        if (!UserPreferences.synchronizeWorkoutsWithAppleHealth.value) {
          HealthObserver.lastWorkoutQuery = null;
        }
        return;
      }

      const queried: HKWorkoutQueryObject[] | null =
        await HealthQueryManager.queryExternalWorkouts();
      if (queried === null) {
        hilog.error(DOMAIN, TAG, 'the workout observer query failed');
        HealthObserver.lastWorkoutQuery = null;
        return;
      }

      const anchor: Date | null = HealthObserver.previousWorkoutObserverAnchor;
      const objects: HKWorkoutQueryObject[] = [];
      let newest: Date | null = anchor;
      for (const object of queried) {
        if (anchor !== null && object.startDate.getTime() <= anchor.getTime()) {
          continue;
        }
        // Source: `checkForDuplicateHealthWorkout` — the source INCLUDED a record the app already
        // held, which imported only what was already imported; the polarity is corrected here.
        const duplicate: boolean =
          await DataQueryManager.checkForDuplicateHealthWorkout(object.hkWorkout);
        if (duplicate) {
          continue;
        }
        objects.push(object);
        if (newest === null || object.startDate.getTime() > newest.getTime()) {
          newest = object.startDate;
        }
      }
      HealthObserver.queryObjects = objects;
      HealthObserver.count = objects.length;
      HealthObserver.previousWorkoutObserverAnchor = newest;

      if (UserPreferences.automaticallyImportNewHealthWorkouts.value && objects.length !== 0) {
        const saved: Workout[] = await DataManager.saveHealthWorkouts(objects);
        if (saved.length !== objects.length) {
          hilog.error(DOMAIN, TAG,
            'could not save every automatically detected new health workout (%{public}d of %{public}d)',
            saved.length, objects.length);
        }
      }
      HealthObserver.lastWorkoutQuery = null;
    };

  /** Source: `weightObserverUpdateClosure`. */
  static readonly weightObserverUpdateClosure: (pass: number) => Promise<void> =
    async (pass: number): Promise<void> => {
      if (HealthObserver.lastWeightQuery === null) {
        HealthObserver.lastWeightQuery = pass;
      }
      if (!UserPreferences.synchronizeWeightWithAppleHealth.value
        || HealthObserver.lastWeightQuery !== pass) {
        if (!UserPreferences.synchronizeWeightWithAppleHealth.value) {
          HealthObserver.lastWeightQuery = null;
        }
        return;
      }

      const recordDate: number | null = HEALTH_BODY_MASS_DATE.value;
      const anchor: Date | null = HealthObserver.previousWeightObserverAnchor;
      const changed: boolean = recordDate !== null
        && (anchor === null || recordDate > anchor.getTime());
      if (changed) {
        await HealthQueryManager.queryMostRecentWeightSample();
        HealthObserver.previousWeightObserverAnchor = new Date(recordDate);
      }
      HealthObserver.lastWeightQuery = null;
    };

  /** One poll pass: both observers, in the order `setupObservers` executed their queries. */
  static async poll(): Promise<void> {
    const pass: number = Date.now();
    await HealthObserver.workoutObserverUpdateClosure(pass);
    await HealthObserver.weightObserverUpdateClosure(pass);
  }

  /**
   * Source: `setupObservers()` — registers the observers when either sync preference is on, and
   * tears them down when neither is (the source's closures stopped their own query for that).
   */
  static setupObservers(): void {
    const wantsWorkouts: boolean = UserPreferences.synchronizeWorkoutsWithAppleHealth.value;
    const wantsWeight: boolean = UserPreferences.synchronizeWeightWithAppleHealth.value;
    if (!wantsWorkouts && !wantsWeight) {
      HealthObserver.teardownObservers();
      return;
    }
    startObservingApplicationState(FOREGROUND_OBSERVER);
    try {
      workScheduler.startWork(pollWorkInfo());
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'could not schedule the health poll: %{public}s',
        JSON.stringify(err));
    }
    HealthObserver.poll().catch((err: Object): void => {
      hilog.error(DOMAIN, TAG, 'initial health poll failed: %{public}s', JSON.stringify(err));
    });
  }

  /** Stops both halves of the poll — the source stopped its queries from inside the closures. */
  static teardownObservers(): void {
    stopObservingApplicationState(FOREGROUND_OBSERVER);
    HealthObserver.lastWorkoutQuery = null;
    HealthObserver.lastWeightQuery = null;
    try {
      workScheduler.stopWork(pollWorkInfo(), true);
    } catch (err) {
      hilog.warn(DOMAIN, TAG, 'could not cancel the health poll: %{public}s', JSON.stringify(err));
    }
  }
}
