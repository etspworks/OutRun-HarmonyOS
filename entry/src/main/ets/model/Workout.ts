/*
 * Port of `OutRunV3.Workout` (OutRun/Models/Data/DataModels/Versions/OutRunV3.swift:84-111) plus
 * the `typealias Workout` extension (DataModels/Workout.swift) that gives it `type`,
 * `cachedStats`, `hasRouteData`, `hasHeartRateData` and `pauseRanges`.
 *
 * CoreStore entity -> plain model over @ohos.data.relationalStore (Rule 10 capability mapping),
 * the same shape model/Event.ts uses. relationalStore has no relationship type, so the ordered
 * to-many relationships are plain arrays filled by common/DataManager.ts, and the unordered
 * `events` inverse carries event uuids (Event.workouts carries workout uuids, symmetrically).
 * The five TRANSIENT values (ascending/descendingAltitude, active/pauseDuration, dayIdentifier)
 * were CoreStore customGetters; they are fields here, computed on read by
 * common/DataManager.ts's DataModelValueGetters port.
 * `cachedStats` was a static [address: WorkoutStats] dictionary (`Workout._stats`) purely because
 * a Swift extension cannot store — an instance field does the same job with no address keying.
 * `WorkoutType` lives in model/WorkoutType.ts, not nested here.
 * `description` is NOT ported: it is CustomStringConvertible debug output built from
 * CustomMeasurementFormatting, and a model importing common/Formatting.ts would invert the
 * model -> service direction the rest of the data layer keeps.
 */
import { WorkoutType, workoutTypeFromRaw } from './WorkoutType';
import { WorkoutEventType, workoutEventTypeFromRaw } from './WorkoutEventType';
import { WorkoutEvent } from './WorkoutEvent';
import { WorkoutRouteDataSample } from './WorkoutRouteDataSample';
import { WorkoutHeartRateDataSample } from './WorkoutHeartRateDataSample';
import { WorkoutStats } from './WorkoutStats';

/** A `ClosedRange<TimeInterval>` — seconds from the workout start, both bounds inclusive. */
export class TimeRange {
  readonly start: number;
  readonly end: number;

  constructor(start: number, end: number) {
    this.start = start;
    this.end = end;
  }
}

export class Workout {
  uuid: string | null = null;
  workoutType: number = -1;
  distance: number = -1;
  steps: number | null = null;
  startDate: Date = new Date(0);
  endDate: Date = new Date(0);
  burnedEnergy: number | null = null;
  isRace: boolean = false;
  comment: string | null = null;
  isUserModified: boolean = false;
  healthKitUUID: string | null = null;

  /** Transient: total metres climbed (DataModelValueGetters.ascendingAltitude). */
  ascendingAltitude: number = 0;
  /** Transient: total metres descended (DataModelValueGetters.descendingAltitude). */
  descendingAltitude: number = 0;
  /** Transient: seconds of the workout not spent paused (DataModelValueGetters.activeDuration). */
  activeDuration: number = 0;
  /** Transient: seconds spent paused (DataModelValueGetters.pauseDuration). */
  pauseDuration: number = 0;
  /** Transient: the day this workout is grouped under (DataModelValueGetters.dayIdentifier). */
  dayIdentifier: string = '';

  heartRates: WorkoutHeartRateDataSample[] = [];
  routeData: WorkoutRouteDataSample[] = [];
  workoutEvents: WorkoutEvent[] = [];
  /** uuids of the events this workout belongs to (CoreStore relationship `events`). */
  events: string[] = [];

  /** Source: `cachedStats` (the `Workout._stats` cache) — set by common/WorkoutStatsService.ts. */
  cachedStats: WorkoutStats | null = null;

  /** Source: `type` — UNKNOWN for a raw value no case covers. */
  type(): WorkoutType {
    return workoutTypeFromRaw(this.workoutType);
  }

  /** Source: `hasRouteData`. */
  hasRouteData(): boolean {
    return this.routeData.length !== 0;
  }

  /** Source: `hasHeartRateData`. */
  hasHeartRateData(): boolean {
    return this.heartRates.length !== 0;
  }

  /**
   * Source: `pauseRanges` — one range per pause event, ended by the next resume event in order or
   * by the workout's end when the resumes run out. `Date.distance(to:)` is ABSOLUTE in this app
   * (OutRun/Extensions/Date.swift), so every bound is seconds FROM the start, unsigned.
   */
  pauseRanges(): TimeRange[] {
    const resumeEvents: WorkoutEvent[] = [];
    for (const event of this.workoutEvents) {
      const type: WorkoutEventType = workoutEventTypeFromRaw(event.eventType);
      if (type === WorkoutEventType.RESUME || type === WorkoutEventType.AUTO_RESUME) {
        resumeEvents.push(event);
      }
    }

    const ranges: TimeRange[] = [];
    let nextResume: number = 0;
    for (const event of this.workoutEvents) {
      const type: WorkoutEventType = workoutEventTypeFromRaw(event.eventType);
      if (type !== WorkoutEventType.PAUSE && type !== WorkoutEventType.AUTO_PAUSE) {
        continue;
      }
      const pauseInterval: number = this.interval(event.startDate);
      let endInterval: number;
      if (nextResume < resumeEvents.length) {
        endInterval = this.interval(resumeEvents[nextResume].startDate);
        nextResume += 1;
      } else {
        endInterval = this.interval(this.endDate);
      }
      if (pauseInterval < endInterval) {
        ranges.push(new TimeRange(pauseInterval, endInterval));
      }
    }
    return ranges;
  }

  private interval(date: Date): number {
    return Math.abs(date.getTime() - this.startDate.getTime()) / 1000;
  }
}
