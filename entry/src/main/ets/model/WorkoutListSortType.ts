/*
 * Port of `WorkoutListViewController.WorkoutListSortType`
 * (OutRun/Controllers/Workout/WorkoutListViewController.swift:195-246).
 *
 * How the workout list is ordered. The Swift enum carried an associated `Bool` (descending) on
 * every case, which ArkTS has no equivalent for, so it is a class: the case is `kind`, the
 * associated value is `descending`.
 * `fetchClause` returned a CoreStore `OrderBy<Workout>`. relationalStore builds its ordering from
 * a column name plus a direction, so that is what this returns — common/DataManager.ts turns it
 * into `RdbPredicates.orderByAsc/orderByDesc`. Keeping the clause a VALUE rather than a predicate
 * keeps the model free of the store.
 * The source's own note on DURATION is kept: it orders on `activeDuration`, which is transient, so
 * the store cannot sort by it. It stays here because the sort screen still offers it.
 */
import { localizedString } from '../common/LocalizedStrings';

export enum WorkoutListSortKind {
  DAY = 'DAY',
  DISTANCE = 'DISTANCE',
  /** The source marks this one "Not usable because value is transient". */
  DURATION = 'DURATION'
}

/** Source: the `OrderBy<Workout>` a sort type produces. */
export class WorkoutSortClause {
  readonly column: string;
  readonly descending: boolean;

  constructor(column: string, descending: boolean) {
    this.column = column;
    this.descending = descending;
  }
}

export class WorkoutListSortType {
  readonly kind: WorkoutListSortKind;
  /** Source: `descending` — the enum's associated value. */
  readonly descending: boolean;

  constructor(kind: WorkoutListSortKind, descending: boolean) {
    this.kind = kind;
    this.descending = descending;
  }

  /** Source: `==` — Equatable over both the case and its associated value. */
  equals(other: WorkoutListSortType): boolean {
    return this.kind === other.kind && this.descending === other.descending;
  }

  /** Source: `string`. */
  title(): string {
    switch (this.kind) {
      case WorkoutListSortKind.DAY: return localizedString('WorkoutList.Sort.Date');
      case WorkoutListSortKind.DISTANCE: return localizedString('WorkoutStats.Distance');
      default: return localizedString('Workout.Duration');
    }
  }

  /** Source: `stringWithArrow` — the nav-bar button's title. */
  titleWithArrow(): string {
    return `${this.title()}${this.descending ? ' ↓' : ' ↑'}`;
  }

  /** Source: `oppositeOrderedType` — tapping the same sort row flips its direction. */
  oppositeOrderedType(): WorkoutListSortType {
    return new WorkoutListSortType(this.kind, !this.descending);
  }

  /** Source: `fetchClause`. */
  fetchClause(): WorkoutSortClause {
    switch (this.kind) {
      case WorkoutListSortKind.DAY: return new WorkoutSortClause('startDate', this.descending);
      case WorkoutListSortKind.DISTANCE: return new WorkoutSortClause('distance', this.descending);
      default: return new WorkoutSortClause('activeDuration', this.descending);
    }
  }
}
