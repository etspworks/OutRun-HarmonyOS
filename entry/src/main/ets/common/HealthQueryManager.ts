/*
 * Port of `HealthQueryManager` (OutRun/Models/HealthKit/HealthQueryManager.swift:24-256) — the READ
 * half of the health store: the import list's candidates and the most recent body-mass record.
 *
 * Same registered platform-capability substitution as HealthStoreManager: with HMS Health Service
 * Kit unavailable, "the health store" is the app's OWN relationalStore storage — the workouts
 * carrying a `healthKitID`, plus the body-mass record HealthStoreManager.syncWeight writes. The
 * source's dedup predicate is ported exactly (a record the app already references is never offered
 * for import), so on a device whose only health records were written by this app the honest answer
 * is an empty candidate list and `screen_hk_import` renders its `hk_empty` branch. Nothing is
 * fabricated to fill it.
 */
import { relationalStore } from '@kit.ArkData';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { HKWorkoutQueryObject } from '../model/HKWorkoutQueryObject';
import { TempWorkoutEvent } from '../model/TempWorkoutEvent';
import { TempWorkoutRouteDataSample } from '../model/TempWorkoutRouteDataSample';
import { TempWorkoutHeartRateDataSample } from '../model/TempWorkoutHeartRateDataSample';
import { Workout } from '../model/Workout';
import { WorkoutEvent } from '../model/WorkoutEvent';
import { WorkoutRouteDataSample } from '../model/WorkoutRouteDataSample';
import { WorkoutHeartRateDataSample } from '../model/WorkoutHeartRateDataSample';
import { WorkoutType, workoutTypeFromRaw } from '../model/WorkoutType';
import { UserPreferences } from './UserPreferences';
import { DataManager, TABLE_WORKOUT } from './DataManager';
import { DataQueryManager } from './DataQueryManager';
import { HEALTH_BODY_MASS_KILOGRAMS, HealthStoreManager } from './HealthStoreManager';

const DOMAIN: number = 0x0000;
const TAG: string = 'HealthQueryManager';

/**
 * Source: the `predicateForWorkouts(with:)` disjunction — walking, running, cycling, hiking and
 * skating, which is every type this app has a WorkoutType for.
 */
const IMPORTABLE_WORKOUT_TYPES: number[] = [
  WorkoutType.RUNNING as number,
  WorkoutType.WALKING as number,
  WorkoutType.CYCLING as number,
  WorkoutType.HIKING as number,
  WorkoutType.SKATING as number
];

export class HealthQueryManager {

  /**
   * Source: `queryExternalWorkouts(completion:)` — health records this app does not already
   * reference, newest first. Returns null when the query could not run (the source's
   * `success == false`).
   */
  static async queryExternalWorkouts(): Promise<HKWorkoutQueryObject[] | null> {
    const authorized: boolean = await HealthStoreManager.gainAuthorization();
    if (!authorized) {
      return null;
    }
    try {
      const existing: string[] = await DataQueryManager.getAllExistingHealthKitWorkoutUUIDs();
      const predicates: relationalStore.RdbPredicates =
        new relationalStore.RdbPredicates(TABLE_WORKOUT);
      predicates.isNotNull('healthKitID');
      if (existing.length !== 0) {
        predicates.notIn('healthKitID', existing);
      }
      predicates.in('workoutType', IMPORTABLE_WORKOUT_TYPES);
      predicates.orderByDesc('startDate');
      const records: Workout[] = await DataManager.loadWorkouts(predicates, false);

      const queryObjects: HKWorkoutQueryObject[] = [];
      for (const record of records) {
        const queryObject: HKWorkoutQueryObject | null =
          await HealthQueryManager.queryObjectOf(record);
        if (queryObject === null) {
          continue;
        }
        queryObjects.push(queryObject);
        // Source order; the heart-rate attach is commented out at the source's call site.
        await HealthQueryManager.getAndAttatchRoute(queryObject);
        await HealthQueryManager.getAndAttatchSteps(queryObject);
      }
      return queryObjects;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to query external workouts: %{public}s',
        JSON.stringify(err));
      return null;
    }
  }

  /** Source: `HKWorkoutQueryObject(_ workout: HKWorkout)` applied to a health record. */
  private static async queryObjectOf(record: Workout): Promise<HKWorkoutQueryObject | null> {
    if (record.uuid === null || record.healthKitUUID === null) {
      return null;
    }
    const stored: WorkoutEvent[] = await DataManager.loadWorkoutEvents(record.uuid);
    const events: TempWorkoutEvent[] = [];
    for (const event of stored) {
      events.push(new TempWorkoutEvent(null, event.eventType, event.startDate, event.endDate));
    }
    return HKWorkoutQueryObject.create(record.healthKitUUID, workoutTypeFromRaw(record.workoutType),
      record.startDate, record.endDate, record.distance, record.burnedEnergy,
      record.isUserModified, events);
  }

  /** The app-side workout a health record belongs to, by the record's id. */
  private static async workoutOfRecord(recordId: string): Promise<Workout | null> {
    const predicates: relationalStore.RdbPredicates =
      new relationalStore.RdbPredicates(TABLE_WORKOUT);
    predicates.equalTo('healthKitID', recordId);
    const workouts: Workout[] = await DataManager.loadWorkouts(predicates, false);
    return workouts.length === 0 ? null : workouts[0];
  }

  /**
   * Source: `getAndAttatchSteps(to:completion:)`. NOTE a source defect kept out of the port: the
   * source built its step query over `objectTypeRouteType`, so it never read a step count at all.
   * The intent is ported (the record's own step count), not the typo.
   */
  static async getAndAttatchSteps(queryObject: HKWorkoutQueryObject): Promise<void> {
    try {
      const record: Workout | null =
        await HealthQueryManager.workoutOfRecord(queryObject.hkWorkout);
      if (record === null) {
        return;
      }
      const steps: number = record.steps === null ? 0 : record.steps;
      queryObject.steps = steps !== 0 ? steps : null;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to attach steps: %{public}s', JSON.stringify(err));
    }
  }

  /** Source: `getAndAttatchRoute(to:completion:)` — the record's route, appended to the object. */
  static async getAndAttatchRoute(queryObject: HKWorkoutQueryObject): Promise<void> {
    try {
      const record: Workout | null =
        await HealthQueryManager.workoutOfRecord(queryObject.hkWorkout);
      if (record === null || record.uuid === null) {
        return;
      }
      const route: WorkoutRouteDataSample[] = await DataManager.loadRouteSamples(record.uuid);
      if (route.length === 0) {
        hilog.warn(DOMAIN, TAG, 'health record %{public}s carries no route',
          queryObject.hkWorkout);
        return;
      }
      for (const point of route) {
        queryObject.locations.push(new TempWorkoutRouteDataSample(null, point.timestamp,
          point.latitude, point.longitude, point.altitude, point.horizontalAccuracy,
          point.verticalAccuracy, point.speed, point.direction));
      }
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to attach route: %{public}s', JSON.stringify(err));
    }
  }

  /**
   * Source: `getAndAttachHeartRate(to:completion:)`. Implemented, and — like the source — not
   * called from `queryExternalWorkouts`, whose call site is commented out there.
   */
  static async getAndAttachHeartRate(queryObject: HKWorkoutQueryObject): Promise<void> {
    try {
      const record: Workout | null =
        await HealthQueryManager.workoutOfRecord(queryObject.hkWorkout);
      if (record === null || record.uuid === null) {
        return;
      }
      const stored: WorkoutHeartRateDataSample[] =
        await DataManager.loadHeartRateSamples(record.uuid);
      if (stored.length === 0) {
        return;
      }
      const rates: TempWorkoutHeartRateDataSample[] = [];
      for (const entry of stored) {
        rates.push(new TempWorkoutHeartRateDataSample(null, entry.heartRate, entry.timestamp));
      }
      queryObject.heartRates = rates;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to attach heart rates: %{public}s', JSON.stringify(err));
    }
  }

  /**
   * Source: `queryMostRecentWeightSample()` — reads the newest body-mass record and applies it to
   * the user's weight. The record is the one HealthStoreManager.syncWeight writes, so this is the
   * health-store-to-app direction the source had, unchanged.
   */
  static async queryMostRecentWeightSample(): Promise<void> {
    const newWeightInKG: number | null = HEALTH_BODY_MASS_KILOGRAMS.value;
    if (newWeightInKG === null) {
      return;
    }
    UserPreferences.weight.value = newWeightInKG;
  }
}
