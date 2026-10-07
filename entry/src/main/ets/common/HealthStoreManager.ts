/*
 * Port of `HealthStoreManager` (OutRun/Models/HealthKit/HealthStoreManager.swift:24-565).
 *
 * REGISTERED platform-capability substitution: HMS Health Service Kit is not available to this
 * build (it needs a Huawei developer agreement, `ohos.permission.READ_HEALTH_DATA` is deliberately
 * not requested, and the iOS HealthKit entitlements were pruned at source). The Health import /
 * export UI stays and is backed by the app's OWN local relationalStore workout storage:
 *
 *   - "the health store"   = the set of workouts carrying a `healthKitID`, plus the body-mass
 *                            record below. `healthStore` is the app's own RdbStore handle.
 *   - "saving to health"   = stamping a workout with a health-record id (`addHealthKitWorkoutUUID`),
 *                            which is exactly what the workout-detail screen's
 *                            "Add to Apple Health" / "Remove from Apple Health" button reads.
 *   - "deleting from health" = clearing that stamp.
 *   - "a body-mass sample" = HEALTH_BODY_MASS_KILOGRAMS + HEALTH_BODY_MASS_DATE, written by
 *                            `syncWeight` and read back by HealthQueryManager
 *                            .queryMostRecentWeightSample() / the HealthObserver poll.
 *
 * No HMS Health API is called, imported or faked anywhere in this module.
 *
 * `DataManager.healthExporter` is registered at the bottom of this file, so a workout saved with
 * `synchronize` on flows through the same export path the source used for HealthKit.
 */
import { util } from '@kit.ArkTS';
import { relationalStore } from '@kit.ArkData';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { Workout } from '../model/Workout';
import { WorkoutType, workoutTypeDebugDescription, workoutTypeFromRaw } from '../model/WorkoutType';
import { Dimension, Measurement, Unit, unitDimension } from './Measurement';
import { OptionalNumberPreference, UserPreferences } from './UserPreferences';
import { DataManager } from './DataManager';
import { DataQueryManager } from './DataQueryManager';
import { PermissionManager } from './PermissionManager';
import { qaFault } from './QaHooks';

const DOMAIN: number = 0x0000;
const TAG: string = 'HealthStoreManager';

/**
 * The local body-mass record — the one thing the source kept in the health store that has no
 * column of its own in the app's workout storage. Written by `syncWeight`, read by
 * `HealthQueryManager.queryMostRecentWeightSample()`.
 */
export const HEALTH_BODY_MASS_KILOGRAMS: OptionalNumberPreference =
  new OptionalNumberPreference('healthBodyMassKilograms');
export const HEALTH_BODY_MASS_DATE: OptionalNumberPreference =
  new OptionalNumberPreference('healthBodyMassDate');

/** Source: the `HKObjectType` constants — the kinds of record the app exports. */
export enum HealthObjectType {
  WORKOUT_TYPE = 'WORKOUT_TYPE',
  ACTIVE_ENERGY_BURNED = 'ACTIVE_ENERGY_BURNED',
  DISTANCE_WALKING_RUNNING = 'DISTANCE_WALKING_RUNNING',
  DISTANCE_CYCLING = 'DISTANCE_CYCLING',
  ROUTE_TYPE = 'ROUTE_TYPE',
  BODY_MASS = 'BODY_MASS',
  HEART_RATE = 'HEART_RATE',
  STEP_COUNT = 'STEP_COUNT'
}

/** Source: `HKAuthorizationStatus`. */
export enum HealthAuthorizationStatus {
  NOT_DETERMINED = 'NOT_DETERMINED',
  SHARING_DENIED = 'SHARING_DENIED',
  SHARING_AUTHORIZED = 'SHARING_AUTHORIZED'
}

export class HealthStoreManager {

  /** Source: `static let healthStore = HKHealthStore()` — here the app's own store. */
  static get healthStore(): relationalStore.RdbStore {
    return DataManager.requireStore();
  }

  static readonly objectTypeWorkoutType: HealthObjectType = HealthObjectType.WORKOUT_TYPE;
  static readonly objectTypeActiveEnergyBurned: HealthObjectType =
    HealthObjectType.ACTIVE_ENERGY_BURNED;
  static readonly objectTypeDistanceWalkingRunning: HealthObjectType =
    HealthObjectType.DISTANCE_WALKING_RUNNING;
  static readonly objectTypeDistanceCycling: HealthObjectType = HealthObjectType.DISTANCE_CYCLING;
  static readonly objectTypeRouteType: HealthObjectType = HealthObjectType.ROUTE_TYPE;
  static readonly objectTypeBodyMass: HealthObjectType = HealthObjectType.BODY_MASS;
  static readonly objectTypeHeartRate: HealthObjectType = HealthObjectType.HEART_RATE;
  static readonly objectTypeStepCount: HealthObjectType = HealthObjectType.STEP_COUNT;

  /**
   * Source: `HKUnit.count().unitDivided(by: .minute())`. Measurement has no beats-per-minute
   * member and the local store keeps a heart rate as a plain bpm number, so the unit of a heart
   * rate record is a count.
   */
  static readonly heartRateUnit: Unit = Unit.COUNT;

  /**
   * Source: `requestedTypes`. Heart rate is left out here exactly as the source leaves it out
   * (commented "not fully implemented yet").
   */
  static readonly requestedTypes: HealthObjectType[] = [
    HealthStoreManager.objectTypeWorkoutType,
    HealthStoreManager.objectTypeActiveEnergyBurned,
    HealthStoreManager.objectTypeDistanceWalkingRunning,
    HealthStoreManager.objectTypeDistanceCycling,
    HealthStoreManager.objectTypeRouteType,
    HealthStoreManager.objectTypeBodyMass,
    HealthStoreManager.objectTypeStepCount
  ];

  /**
   * Source: `gainAuthorization(completion:)`. There is no health store to authorize against, so
   * the question is whether the app can reach the storage it exports into —
   * `PermissionManager.checkHealthPermission()` answers exactly that.
   */
  static async gainAuthorization(): Promise<boolean> {
    const granted: boolean = await PermissionManager.checkHealthPermission();
    if (!granted) {
      hilog.error(DOMAIN, TAG, 'health authorization refused: local workout store unavailable');
    }
    return granted;
  }

  /**
   * Source: `authorizationStatus(for:)`. Sharing a kind of record is authorized when the user's
   * sync switch for it is on and the store is reachable; the switches are the real gate here, so
   * a record kind the user did not enable is genuinely not written.
   */
  static authorizationStatus(type: HealthObjectType): HealthAuthorizationStatus {
    try {
      DataManager.requireStore();
    } catch (err) {
      return HealthAuthorizationStatus.NOT_DETERMINED;
    }
    const enabled: boolean = type === HealthObjectType.BODY_MASS
      ? UserPreferences.synchronizeWeightWithAppleHealth.value
      : UserPreferences.synchronizeWorkoutsWithAppleHealth.value;
    return enabled
      ? HealthAuthorizationStatus.SHARING_AUTHORIZED : HealthAuthorizationStatus.SHARING_DENIED;
  }

  /**
   * Source: `saveHealthWorkout(forWorkout:completion:)`. Returns the id of the written health
   * record (the source returned the `HKWorkout`), or null when nothing was written.
   */
  static async saveHealthWorkout(workout: Workout): Promise<string | null> {
    const authorized: boolean = await HealthStoreManager.gainAuthorization();
    // QA fault `healthFail`: health write access refused (TC-DATA-060).
    if (!authorized || qaFault('healthFail')) {
      return null;
    }
    if (workout.uuid === null) {
      hilog.error(DOMAIN, TAG, 'cannot export a workout that was never stored');
      return null;
    }
    try {
      const type: WorkoutType = workoutTypeFromRaw(workout.workoutType);
      const recordId: string = util.generateRandomUUID(true);
      const stamped: boolean = await DataManager.addHealthKitWorkoutUUID(workout, recordId);
      if (!stamped) {
        hilog.error(DOMAIN, TAG, 'failed to save workout: could not write the health reference');
        return null;
      }
      // Source: attachRoute / attachHeartRates, then `add(samplesToAdd, to: healthWorkout)`.
      const routeRecords: number = await HealthStoreManager.attachRoute(workout);
      const heartRateRecords: number = await HealthStoreManager.attachHeartRates(workout);
      const kinds: HealthObjectType[] = HealthStoreManager.recordKindsOf(workout, type);
      hilog.info(DOMAIN, TAG,
        'health record %{public}s covers %{public}s of %{public}s (route %{public}d, hr %{public}d)',
        recordId, JSON.stringify(kinds), workoutTypeDebugDescription(type), routeRecords,
        heartRateRecords);
      return recordId;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to save workout: %{public}s', JSON.stringify(err));
      return null;
    }
  }

  /**
   * Source: `attachRoute(to:with:)` — the route goes into the record the workout was exported as.
   * The route samples already live beside the workout in the app's own store, so attaching them
   * is loading them onto the workout; the count is what the export reports.
   */
  static async attachRoute(workout: Workout): Promise<number> {
    if (workout.uuid === null) {
      return 0;
    }
    try {
      workout.routeData = await DataManager.loadRouteSamples(workout.uuid);
      return workout.routeData.length;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to create route for health record: %{public}s',
        JSON.stringify(err));
      return 0;
    }
  }

  /**
   * Source: `attachHeartRates(to:with:)`. Gated on the heart-rate kind the same way the source
   * gates it (the source's call site is commented out as "not fully implemented yet", so the
   * record never carries heart rates unless that kind is authorized).
   */
  static async attachHeartRates(workout: Workout): Promise<number> {
    if (workout.uuid === null) {
      return 0;
    }
    if (HealthStoreManager.authorizationStatus(HealthStoreManager.objectTypeHeartRate)
      !== HealthAuthorizationStatus.SHARING_AUTHORIZED) {
      return 0;
    }
    try {
      workout.heartRates = await DataManager.loadHeartRateSamples(workout.uuid);
      return workout.heartRates.length;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to add heart rates to health record: %{public}s',
        JSON.stringify(err));
      return 0;
    }
  }

  /** Source: the per-type `authorizationStatus` checks building `samplesToAdd`. */
  private static recordKindsOf(workout: Workout, type: WorkoutType): HealthObjectType[] {
    const kinds: HealthObjectType[] = [HealthStoreManager.objectTypeWorkoutType];
    if (type === WorkoutType.CYCLING
      && HealthStoreManager.authorizationStatus(HealthStoreManager.objectTypeDistanceCycling)
      === HealthAuthorizationStatus.SHARING_AUTHORIZED) {
      kinds.push(HealthStoreManager.objectTypeDistanceCycling);
    }
    if ((type === WorkoutType.RUNNING || type === WorkoutType.WALKING)
      && HealthStoreManager.authorizationStatus(HealthStoreManager.objectTypeDistanceWalkingRunning)
      === HealthAuthorizationStatus.SHARING_AUTHORIZED) {
      kinds.push(HealthStoreManager.objectTypeDistanceWalkingRunning);
    }
    if (workout.steps !== null
      && HealthStoreManager.authorizationStatus(HealthStoreManager.objectTypeStepCount)
      === HealthAuthorizationStatus.SHARING_AUTHORIZED) {
      kinds.push(HealthStoreManager.objectTypeStepCount);
    }
    if (workout.burnedEnergy !== null
      && HealthStoreManager.authorizationStatus(HealthStoreManager.objectTypeActiveEnergyBurned)
      === HealthAuthorizationStatus.SHARING_AUTHORIZED) {
      kinds.push(HealthStoreManager.objectTypeActiveEnergyBurned);
    }
    return kinds;
  }

  /**
   * Source: `deleteHealthWorkout(fromWorkout:completion:)`. The source deleted the record's
   * related samples and then the record; locally the samples belong to the app's own workout (the
   * user is NOT deleting their workout here), so deleting the record is clearing its stamp.
   */
  static async deleteHealthWorkout(workout: Workout): Promise<boolean> {
    const targetUuid: string | null = workout.healthKitUUID;
    if (targetUuid === null) {
      return false;
    }
    const authorized: boolean = await HealthStoreManager.gainAuthorization();
    if (!authorized) {
      return false;
    }
    const exists: boolean = await HealthStoreManager.lookupExistence(targetUuid);
    if (!exists) {
      hilog.warn(DOMAIN, TAG, 'health record %{public}s was already gone', targetUuid);
    }
    const type: WorkoutType = workoutTypeFromRaw(workout.workoutType);
    const kinds: HealthObjectType[] = HealthStoreManager.recordKindsOf(workout, type);
    kinds.push(HealthStoreManager.objectTypeRouteType);
    const removed: boolean = await DataManager.removeHealthKitWorkoutUUID(workout);
    if (!removed) {
      hilog.error(DOMAIN, TAG, 'failed to delete health record %{public}s', targetUuid);
      return false;
    }
    hilog.info(DOMAIN, TAG, 'deleted health record %{public}s covering %{public}s',
      targetUuid, JSON.stringify(kinds));
    return true;
  }

  /** Source: `alterHealthWorkout(from:completion:)` — delete, then save again. */
  static async alterHealthWorkout(workout: Workout): Promise<boolean> {
    const authorized: boolean = await HealthStoreManager.gainAuthorization();
    if (!authorized || qaFault('healthFail')) {
      return false;
    }
    const deleted: boolean = await HealthStoreManager.deleteHealthWorkout(workout);
    if (!deleted) {
      hilog.error(DOMAIN, TAG, 'failed to delete health record in order to alter it');
      return false;
    }
    const recordId: string | null = await HealthStoreManager.saveHealthWorkout(workout);
    if (recordId === null) {
      hilog.error(DOMAIN, TAG, 'failed to resave health record in order to alter it');
      return false;
    }
    return true;
  }

  /**
   * Source: `deleteAllHealthWorkouts(completion:)` — every record of every requested type written
   * by this app, plus the app's references to them. Locally both are the one stamp column, and the
   * body-mass record is dropped with them.
   */
  static async deleteAllHealthWorkouts(): Promise<boolean> {
    const authorized: boolean = await HealthStoreManager.gainAuthorization();
    if (!authorized) {
      return false;
    }
    const removed: boolean = await DataManager.removeAllHealthKitWorkoutUUIDs();
    if (!removed) {
      return false;
    }
    HEALTH_BODY_MASS_KILOGRAMS.value = null;
    HEALTH_BODY_MASS_DATE.value = null;
    hilog.info(DOMAIN, TAG, 'deleted all health records of types %{public}s',
      JSON.stringify(HealthStoreManager.requestedTypes));
    return true;
  }

  /**
   * Source: `syncWeight(measurement:completion:)` — writes a body-mass record. The caller has
   * already stored the user's own weight; this is the health-store half of it.
   */
  static async syncWeight(measurement: Measurement): Promise<boolean> {
    const authorized: boolean = await HealthStoreManager.gainAuthorization();
    if (!authorized) {
      return false;
    }
    // Source: `measurement.canBeConverted(to: UnitMass.kilograms)`.
    if (unitDimension(measurement.unit) !== Dimension.MASS) {
      return false;
    }
    if (HealthStoreManager.authorizationStatus(HealthStoreManager.objectTypeBodyMass)
      !== HealthAuthorizationStatus.SHARING_AUTHORIZED) {
      return false;
    }
    const weightValue: number = measurement.converting(Unit.KILOGRAMS).value;
    HEALTH_BODY_MASS_KILOGRAMS.value = weightValue;
    HEALTH_BODY_MASS_DATE.value = Date.now();
    return true;
  }

  /**
   * Source: `syncAllUnsyncedWorkoutsWithAppleHealth(completion:)`, whose completion carried
   * (success, allSyncedAlready). Collapsed to one value for the caller: null = the sync failed,
   * true = everything was already synced, false = it synced them now.
   */
  static async syncAllUnsyncedWorkoutsWithAppleHealth(): Promise<boolean | null> {
    const authorized: boolean = await HealthStoreManager.gainAuthorization();
    if (!authorized) {
      return null;
    }
    let workouts: Workout[] = [];
    try {
      workouts = await DataQueryManager.queryAllWorkoutsWithoutAppleHealthReference();
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to query unsynced workouts: %{public}s',
        JSON.stringify(err));
      return null;
    }
    if (workouts.length === 0) {
      return true;
    }
    let saveSuccess: boolean = true;
    for (const workout of workouts) {
      const recordId: string | null = await HealthStoreManager.saveHealthWorkout(workout);
      if (recordId === null) {
        saveSuccess = false;
      }
    }
    return saveSuccess ? false : null;
  }

  /**
   * Source: `lookupExistence(of:)` — it blocked on a DispatchGroup; ArkTS has no blocking wait,
   * so it is async here and every caller awaits it.
   */
  static async lookupExistence(uuid: string): Promise<boolean> {
    return DataQueryManager.checkForDuplicateHealthWorkout(uuid);
  }
}

/**
 * The export hook `DataManager.saveWorkouts(..., synchronize: true)` calls: every workout the
 * import did not already match to a health record is exported here, which is what the source did
 * with HealthKit at the same point.
 */
DataManager.healthExporter = async (workouts: Workout[]): Promise<void> => {
  for (const workout of workouts) {
    const recordId: string | null = await HealthStoreManager.saveHealthWorkout(workout);
    if (recordId === null) {
      hilog.error(DOMAIN, TAG, 'failed to export a saved workout to the health store');
    }
  }
};
