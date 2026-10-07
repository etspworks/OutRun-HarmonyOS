/*
 * Port of `HKWorkoutQueryObject` (OutRun/Models/HealthKit/HKWorkoutQueryObject.swift:24-81) —
 * one importable workout, with the samples attached to it.
 *
 * HMS Health Service Kit is not available to this build (registered platform-capability
 * substitution), so there is no HKWorkout to hold: `hkWorkout` carries the uuid of the row in the
 * app's OWN relationalStore workout storage that this object was built from, which is what every
 * consumer actually used it for (identity + the `description`). The import UI is unchanged.
 * `duration` is END-to-START in the source: Date.distance(to:) is ABSOLUTE (Extensions/Date.swift),
 * so the argument order does not flip the sign — kept as written.
 */
import { Measurement, Unit } from '../common/Measurement';
import { WorkoutType } from './WorkoutType';
import { TempWorkoutEvent } from './TempWorkoutEvent';
import { TempWorkoutRouteDataSample } from './TempWorkoutRouteDataSample';
import { TempWorkoutHeartRateDataSample } from './TempWorkoutHeartRateDataSample';

export class HKWorkoutQueryObject {
  /** uuid of the stored workout this object was built from (source: the HKWorkout itself). */
  readonly hkWorkout: string;
  readonly type: WorkoutType;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly distance: Measurement;
  steps: number | null = null;
  readonly energyBurned: Measurement | null;
  readonly duration: Measurement;
  readonly isUserEntered: boolean;

  events: TempWorkoutEvent[] = [];
  locations: TempWorkoutRouteDataSample[] = [];
  heartRates: TempWorkoutHeartRateDataSample[] = [];

  private constructor(uuid: string, type: WorkoutType, startDate: Date, endDate: Date,
    distance: Measurement, duration: Measurement, energyBurned: Measurement | null,
    isUserEntered: boolean) {
    this.hkWorkout = uuid;
    this.type = type;
    this.startDate = startDate;
    this.endDate = endDate;
    this.distance = distance;
    this.duration = duration;
    this.energyBurned = energyBurned;
    this.isUserEntered = isUserEntered;
  }

  /**
   * Source: `init?(_ workout: HKWorkout)`. Failable for two reasons, both kept: no total distance,
   * or an activity type this app has no WorkoutType for. Returns null in either case.
   */
  static create(uuid: string, type: WorkoutType | null, startDate: Date, endDate: Date,
    distanceMeters: number | null, energyKilocalories: number | null, isUserEntered: boolean,
    events: TempWorkoutEvent[]): HKWorkoutQueryObject | null {
    if (distanceMeters === null) {
      return null;
    }
    if (type === null) {
      return null;
    }
    const seconds: number = Math.abs(endDate.getTime() - startDate.getTime()) / 1000;
    const duration: Measurement = new Measurement(seconds, Unit.SECONDS);
    const distance: Measurement = new Measurement(distanceMeters, Unit.METERS);
    let energyBurned: Measurement | null = null;
    if (energyKilocalories !== null) {
      const energyMeasurement: Measurement = new Measurement(energyKilocalories, Unit.KILOCALORIES);
      energyBurned = energyMeasurement;
    }
    const object: HKWorkoutQueryObject = new HKWorkoutQueryObject(
      uuid, type, startDate, endDate, distance, duration, energyBurned, isUserEntered);
    object.events = events;
    return object;
  }

  /** Source: `description`. */
  description(): string {
    return `HKWorkoutQueryObject(uuid: ${this.hkWorkout}`;
  }
}
