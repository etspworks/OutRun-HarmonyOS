/*
 * Port of `TempV3.WorkoutEvent` (OutRun/Models/Data/TempDataTypes.swift:105-110) plus its
 * extension (TempDataTypes.swift:211-248) and the `typealias TempWorkoutEvent`.
 *
 * PRE-PERSISTENCE staging type (see TempWorkoutHeartRateDataSample.ts): WorkoutBuilder creates
 * pause/resume events while recording and DataManager stores them with the workout.
 * `eventType` stays the raw Int that goes into the store; `realEventType()` is the typed read,
 * exactly as in the source.
 * `init(healthEvent: HKWorkoutEvent)` is NOT ported — HMS Health Service Kit is unavailable to
 * this build (registered platform-capability substitution), so no HealthKit event ever arrives.
 */
import { WorkoutEvent } from './WorkoutEvent';
import { WorkoutEventType, workoutEventTypeFromRaw } from './WorkoutEventType';

export class TempWorkoutEvent {
  readonly uuid: string | null;
  readonly eventType: number;
  readonly startDate: Date;
  readonly endDate: Date;

  constructor(uuid: string | null, eventType: number, startDate: Date, endDate: Date) {
    this.uuid = uuid;
    this.eventType = eventType;
    this.startDate = startDate;
    this.endDate = endDate;
  }

  /** Source: `init(workoutEvent:)` — a stored row back into its staging form. */
  static fromEvent(event: WorkoutEvent): TempWorkoutEvent {
    return new TempWorkoutEvent(event.uuid, event.eventType, event.startDate, event.endDate);
  }

  /** Source: `init(type:startDate:endDate:)`. */
  static of(type: WorkoutEventType, startDate: Date, endDate: Date): TempWorkoutEvent {
    return new TempWorkoutEvent(null, type as number, startDate, endDate);
  }

  /** Source: `init(type:date:)` — a zero-length event, used for every pause/resume marker. */
  static atDate(type: WorkoutEventType, date: Date): TempWorkoutEvent {
    return TempWorkoutEvent.of(type, date, date);
  }

  /** Source: `realEventType` — UNKNOWN for a raw value no case covers. */
  realEventType(): WorkoutEventType {
    return workoutEventTypeFromRaw(this.eventType);
  }
}
