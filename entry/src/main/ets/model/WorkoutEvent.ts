/*
 * Port of `OutRunV3.WorkoutEvent` (OutRun/Models/Data/DataModels/Versions/OutRunV3.swift:113-126)
 * plus the `typealias WorkoutEvent` extension (DataModels/WorkoutEvent.swift:25-33) that gives it
 * `type` and `description`.
 *
 * CoreStore entity -> plain model over @ohos.data.relationalStore, the same shape model/Workout.ts
 * uses: `eventType` stays the raw Int that goes in the column, `realEventType()` is the typed read.
 * The `workout` ToOne relationship is not a field here — model/Workout.ts owns the ordered
 * `workoutEvents` array and common/DataManager.ts fills it, so the back-reference would be a
 * second copy of the same edge.
 * `duration` was a TRANSIENT customGetter (`DataModelValueGetters.duration`,
 * DataModelValueGetters.swift:93-97) computed from the two dates; it is a method here for the same
 * reason model/Workout.ts keeps its transients on the instance.
 * `description` is NOT ported (debug output only, and it would pull the formatter into a model).
 */
import { WorkoutEventType, workoutEventTypeFromRaw } from './WorkoutEventType';

export class WorkoutEvent {
  uuid: string | null = null;
  eventType: number = 0;
  startDate: Date = new Date(0);
  endDate: Date = new Date(0);

  /** Source: `type` — UNKNOWN for a raw value no case covers. */
  realEventType(): WorkoutEventType {
    return workoutEventTypeFromRaw(this.eventType);
  }

  /**
   * Source: the transient `duration` getter — `end.distance(to: start)`. `Date.distance(to:)` is
   * ABSOLUTE in this app (OutRun/Extensions/Date.swift), so this is unsigned seconds.
   */
  duration(): number {
    return Math.abs(this.endDate.getTime() - this.startDate.getTime()) / 1000;
  }
}
