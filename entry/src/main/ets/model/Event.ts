/*
 * Port of `OutRunV3.Event` (OutRun/Models/Data/DataModels/Versions/OutRunV3.swift:161-173)
 * plus the `typealias Event` extension (DataModels/Event.swift) that gives it `description`.
 *
 * CoreStore entity -> plain model over @ohos.data.relationalStore (Rule 10 capability mapping).
 * `workouts` was a ToManyUnordered relationship; relationalStore has no relationship type, so it
 * carries the related workout uuids and the join row lives in DataManager.
 * `startDate` / `endDate` were TRANSIENT in CoreStore, computed from the member workouts
 * (DataModelValueGetters.startDate/endDate): earliest start, latest end, nil with no workouts.
 */
export class Event {
  uuid: string | null = null;
  title: string = '';
  comment: string | null = null;
  /** Transient: earliest `startDate` of the member workouts, null when the event has none. */
  startDate: Date | null = null;
  /** Transient: latest `endDate` of the member workouts, null when the event has none. */
  endDate: Date | null = null;
  /** uuids of the workouts in this event (CoreStore relationship `workouts`). */
  workouts: string[] = [];

  /** Source: `Event.description` — "WorkoutEvent(title: ...)", kept verbatim. */
  description(): string {
    return `WorkoutEvent(title: ${this.title})`;
  }
}
