/*
 * Port of `WorkoutListViewController.WorkoutListFilterType`
 * (OutRun/Controllers/Workout/WorkoutListViewController.swift:248-279).
 *
 * One filter applied to the workout list; the controller holds an array of them and combines the
 * clauses with AND (`refetchWithFilters`). Same treatment as model/WorkoutListSortType.ts: the
 * Swift case with its associated `Workout.WorkoutType` becomes `kind` + `workoutType`, and
 * `fetchClause` returns the column/value pair rather than a CoreStore `Where<Workout>` so the model
 * stays free of the store (common/DataManager.ts turns it into `RdbPredicates.equalTo`).
 * `workoutType` is null for the IS_RACE case, exactly as the source's optional getter is.
 */
import { localizedString } from '../common/LocalizedStrings';
import { WorkoutType } from './WorkoutType';

export enum WorkoutListFilterKind {
  IS_RACE = 'IS_RACE',
  TYPE = 'TYPE'
}

/** Source: the `Where<Workout>` a filter type produces — an equality on one column. */
export class WorkoutFilterClause {
  readonly column: string;
  readonly value: number | boolean;

  constructor(column: string, value: number | boolean) {
    this.column = column;
    this.value = value;
  }
}

export class WorkoutListFilterType {
  readonly kind: WorkoutListFilterKind;
  /** Source: `workoutType` — null unless this is the TYPE case. */
  readonly workoutType: WorkoutType | null;

  constructor(kind: WorkoutListFilterKind, workoutType: WorkoutType | null) {
    this.kind = kind;
    this.workoutType = workoutType;
  }

  /** Source: `case isRace`. */
  static isRace(): WorkoutListFilterType {
    return new WorkoutListFilterType(WorkoutListFilterKind.IS_RACE, null);
  }

  /** Source: `case type(Workout.WorkoutType)`. */
  static ofType(type: WorkoutType): WorkoutListFilterType {
    return new WorkoutListFilterType(WorkoutListFilterKind.TYPE, type);
  }

  /** Source: `==` — Equatable over the case and its associated value. */
  equals(other: WorkoutListFilterType): boolean {
    return this.kind === other.kind && this.workoutType === other.workoutType;
  }

  /** Source: `string` — note the TYPE case ignores its associated value here, as the source does. */
  title(): string {
    return this.kind === WorkoutListFilterKind.IS_RACE
      ? localizedString('WorkoutList.Filter.IsRace')
      : localizedString('Workout.Type');
  }

  /** Source: `fetchClause`. */
  fetchClause(): WorkoutFilterClause {
    if (this.kind === WorkoutListFilterKind.IS_RACE) {
      return new WorkoutFilterClause('isRace', true);
    }
    const type: WorkoutType = this.workoutType !== null ? this.workoutType : WorkoutType.UNKNOWN;
    return new WorkoutFilterClause('workoutType', type as number);
  }
}
