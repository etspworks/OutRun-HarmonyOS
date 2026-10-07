/*
 * Port of `WorkoutStats` (OutRun/Models/Workout/Stats/WorkoutStats.swift:23-188).
 *
 * Everything the stats screen shows about one workout, computed once from the stored row. Every
 * value is a measurement, so the whole class is built on the Foundation measurement port
 * (common/Measurement.ts) — that is why NSMeasurement had to be ported rather than formatted away.
 * The arithmetic is the source's, including the details that look like bugs and are not: the
 * altitude/top-speed trio is only computed when the workout HAS route samples (null otherwise),
 * `averageSpeed` is 0 rather than a division by zero when nothing was active, and `burnedEnergy`
 * keys off `hasEnergyValue` rather than the optional itself.
 *
 * TWO source members take a parameter here that the source read off a global:
 * `pace` and `timeRelativeBurnedEnergy` converted to `UserPreferences.*MeasurementType.safeValue`.
 * A model that imports the settings service inverts the model -> service direction the rest of this
 * data layer keeps (the same call model/Workout.ts made about `description`), so the preferred unit
 * is passed in by the caller that already holds the preference.
 *
 * `queryAltitudes` / `querySpeeds` / `queryHeartRates` are NOT ported here. In the source they are
 * thin DataQueryManager calls that memoise their result in the three `lastQueried*Series` fields;
 * the memo fields are here, and the querying belongs to common/WorkoutStatsService.ts, which is
 * also what sets `Workout.cachedStats`. Putting a store query on a model would make model/ import
 * common/DataQueryManager.ts and give this class two reasons to exist.
 */
import { Measurement, Unit } from '../common/Measurement';
import { RelativeMeasurement } from './RelativeMeasurement';
import { Workout } from './Workout';
import { WorkoutType } from './WorkoutType';
import { WorkoutRouteDataSample } from './WorkoutRouteDataSample';
import { WorkoutStatsSeries } from './WorkoutStatsSeries';

/** Source: the `(Bool, WorkoutStatsSeries?)` tuple the three `lastQueried*Series` fields hold. */
export class CachedStatsSeries {
  readonly success: boolean;
  readonly series: WorkoutStatsSeries | null;

  constructor(success: boolean, series: WorkoutStatsSeries | null) {
    this.success = success;
    this.series = series;
  }
}

export class WorkoutStats {
  /** Source: `workout` — "DON'T ACCESS, ONLY PASS ON TO THREAD SAFE MANAGERS". */
  readonly workout: Workout;

  readonly type: WorkoutType;

  readonly hasWorkoutEvents: boolean;
  readonly hasRouteSamples: boolean;
  readonly hasHeartRateData: boolean;
  readonly hasEnergyValue: boolean;

  readonly distance: Measurement;
  readonly steps: Measurement | null;
  readonly ascendingAltitude: Measurement | null;
  readonly descendingAltitude: Measurement | null;

  readonly startDate: Date;
  readonly endDate: Date;
  readonly activeDuration: Measurement;
  readonly pauseDuration: Measurement;

  readonly averageSpeed: Measurement;
  readonly topSpeed: Measurement | null;

  readonly burnedEnergy: Measurement | null;

  /** Source: the three memo fields — written by common/WorkoutStatsService.ts, read by the screen. */
  lastQueriedAltitudeSeries: CachedStatsSeries | null = null;
  lastQueriedSpeedSeries: CachedStatsSeries | null = null;
  lastQueriedHeartRateSeries: CachedStatsSeries | null = null;

  /** Source: `init(workout:)`. */
  constructor(workout: Workout) {
    this.workout = workout;
    this.type = workout.type();

    this.hasWorkoutEvents = workout.workoutEvents.length !== 0;
    this.hasRouteSamples = workout.routeData.length !== 0;
    this.hasHeartRateData = workout.heartRates.length !== 0;
    this.hasEnergyValue = workout.burnedEnergy !== null;

    this.distance = new Measurement(workout.distance, Unit.METERS);
    this.steps = workout.steps !== null ? new Measurement(workout.steps, Unit.COUNT) : null;

    this.startDate = workout.startDate;
    this.endDate = workout.endDate;
    this.activeDuration = new Measurement(workout.activeDuration, Unit.SECONDS);
    this.pauseDuration = new Measurement(workout.pauseDuration, Unit.SECONDS);

    const activeSeconds: number = workout.activeDuration;
    this.averageSpeed = new Measurement(
      activeSeconds !== 0 ? workout.distance / activeSeconds : 0, Unit.METERS_PER_SECOND);

    this.burnedEnergy = this.hasEnergyValue
      ? new Measurement(workout.burnedEnergy !== null ? workout.burnedEnergy : 0, Unit.KILOCALORIES)
      : null;

    if (this.hasRouteSamples) {
      this.ascendingAltitude = new Measurement(workout.ascendingAltitude, Unit.METERS);
      this.descendingAltitude = new Measurement(workout.descendingAltitude, Unit.METERS);

      let fastest: number = workout.routeData[0].speed;
      for (const sample of workout.routeData) {
        if (sample.speed > fastest) {
          fastest = sample.speed;
        }
      }
      this.topSpeed = new Measurement(fastest, Unit.METERS_PER_SECOND);
    } else {
      this.ascendingAltitude = null;
      this.descendingAltitude = null;
      this.topSpeed = null;
    }
  }

  /**
   * Source: `pace` — active minutes per one preferred distance unit.
   * `distanceUnit` is the caller's `UserPreferences.distanceMeasurementType.safeValue`.
   */
  pace(distanceUnit: Unit): RelativeMeasurement {
    return new RelativeMeasurement(this.activeDuration.converting(Unit.MINUTES),
      this.distance.converting(distanceUnit));
  }

  /**
   * Source: `timeRelativeBurnedEnergy` — preferred energy units per active minute, null when the
   * workout has no energy value. `energyUnit` is the caller's
   * `UserPreferences.energyMeasurementType.safeValue`.
   */
  timeRelativeBurnedEnergy(energyUnit: Unit): RelativeMeasurement | null {
    if (this.burnedEnergy === null) {
      return null;
    }
    return new RelativeMeasurement(this.burnedEnergy.converting(energyUnit),
      this.activeDuration.converting(Unit.MINUTES));
  }
}
