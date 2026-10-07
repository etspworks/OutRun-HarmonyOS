/*
 * Port of `TempV3.Event` (OutRun/Models/Data/TempDataTypes.swift:129-136) plus its extension
 * (TempDataTypes.swift:340-355) and the `typealias TempEvent`.
 *
 * PRE-PERSISTENCE staging type (see TempWorkoutHeartRateDataSample.ts): the backup reader builds
 * these and DataManager inserts them, which is why `workouts` is a list of workout uuids rather
 * than of workouts — the same shape model/Event.ts uses for the stored row.
 * `startDate` / `endDate` are the source's TRANSIENT getters (earliest start, latest end of the
 * member workouts), so they are carried as values and stay null for an event with no workouts.
 */
import { Event } from './Event';

export class TempEvent {
  readonly uuid: string | null;
  readonly title: string;
  readonly comment: string | null;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly workouts: string[];

  constructor(uuid: string | null, title: string, comment: string | null, startDate: Date | null,
    endDate: Date | null, workouts: string[]) {
    this.uuid = uuid;
    this.title = title;
    this.comment = comment;
    this.startDate = startDate;
    this.endDate = endDate;
    this.workouts = workouts;
  }

  /** Source: `init(event:)` — `workouts.compactMap { $0.uuid }`, a stored event's workout uuids. */
  static fromEvent(event: Event): TempEvent {
    const workouts: string[] = [];
    for (const uuid of event.workouts) {
      workouts.push(uuid);
    }
    return new TempEvent(event.uuid, event.title, event.comment, event.startDate, event.endDate,
      workouts);
  }
}
