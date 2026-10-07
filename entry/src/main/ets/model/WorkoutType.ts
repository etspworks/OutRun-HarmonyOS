/*
 * Port of `OutRunV3.Workout.WorkoutType` (OutRun/Models/Data/DataModels/Workout.swift:114-196).
 *
 * The Swift enum carried its own `rawValue` mapping because the CoreStore column is an Int; the
 * raw value is the persisted one, so the enum members ARE the raw values here and
 * `workoutTypeFromRaw` is the source's `init(rawValue:)` (UNKNOWN for anything else).
 * `allCases` deliberately omits `unknown`, exactly as the source's override does — it is the
 * list the type picker offers, not the list of representable values.
 * `init?(hkType:)` and `healthKitType` are NOT ported: HMS Health Service Kit is unavailable to
 * this build (registered platform-capability substitution), so no HealthKit type ever arrives.
 * `description` is the localized name; `debugDescription` is the English one, kept because the
 * backup writer and the log lines use it.
 */
import { localizedString } from '../common/LocalizedStrings';

export enum WorkoutType {
  RUNNING = 0,
  WALKING = 1,
  CYCLING = 2,
  SKATING = 3,
  HIKING = 4,
  UNKNOWN = -1
}

/** Source: `init(rawValue:)` — UNKNOWN for a raw value no case covers. */
export function workoutTypeFromRaw(raw: number): WorkoutType {
  switch (raw) {
    case 0: return WorkoutType.RUNNING;
    case 1: return WorkoutType.WALKING;
    case 2: return WorkoutType.CYCLING;
    case 3: return WorkoutType.SKATING;
    case 4: return WorkoutType.HIKING;
    default: return WorkoutType.UNKNOWN;
  }
}

/** Source: `allCases` — the five selectable types, without `unknown`. */
export function workoutTypeAllCases(): WorkoutType[] {
  return [WorkoutType.RUNNING, WorkoutType.WALKING, WorkoutType.CYCLING, WorkoutType.SKATING,
    WorkoutType.HIKING];
}

/** Source: `description` — the localized name. */
export function workoutTypeDescription(type: WorkoutType): string {
  return localizedString(`Workout.Type.${workoutTypeDebugDescription(type)}`);
}

/** Source: `debugDescription`. */
export function workoutTypeDebugDescription(type: WorkoutType): string {
  switch (type) {
    case WorkoutType.RUNNING: return 'Running';
    case WorkoutType.WALKING: return 'Walking';
    case WorkoutType.CYCLING: return 'Cycling';
    case WorkoutType.SKATING: return 'Skating';
    case WorkoutType.HIKING: return 'Hiking';
    default: return 'Unknown';
  }
}

/** Source: `METSpeedMultiplier` — the per-type factor BurnedEnergyCalculator multiplies MET by. */
export function workoutTypeMetSpeedMultiplier(type: WorkoutType): number {
  switch (type) {
    case WorkoutType.RUNNING: return 1.035;
    case WorkoutType.WALKING: return 0.655;
    case WorkoutType.HIKING: return 0.655;
    case WorkoutType.CYCLING: return 0.450;
    case WorkoutType.SKATING: return 0.560;
    default: return 0;
  }
}
