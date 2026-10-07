/*
 * Port of `WorkoutEvent.WorkoutEventType`
 * (OutRun/Models/Data/DataModels/WorkoutEvent.swift:35-164).
 *
 * Same shape as model/WorkoutType.ts: the Int raw value is the persisted column, so the enum
 * members ARE the raw values and `workoutEventTypeFromRaw` is the source's `init(rawValue:)`.
 * `init(healthType:)` and `healthKitType` are NOT ported — HMS Health Service Kit is unavailable
 * to this build (registered platform-capability substitution), so no HKWorkoutEventType ever
 * arrives and nothing converts back to one.
 */
import { localizedString } from '../common/LocalizedStrings';

export enum WorkoutEventType {
  PAUSE = 0,
  AUTO_PAUSE = 1,
  RESUME = 2,
  AUTO_RESUME = 3,
  LAP = 4,
  MARKER = 5,
  SEGMENT = 6,
  UNKNOWN = -1
}

/** Source: `init(rawValue:)` — UNKNOWN for a raw value no case covers. */
export function workoutEventTypeFromRaw(raw: number): WorkoutEventType {
  switch (raw) {
    case 0: return WorkoutEventType.PAUSE;
    case 1: return WorkoutEventType.AUTO_PAUSE;
    case 2: return WorkoutEventType.RESUME;
    case 3: return WorkoutEventType.AUTO_RESUME;
    case 4: return WorkoutEventType.LAP;
    case 5: return WorkoutEventType.MARKER;
    case 6: return WorkoutEventType.SEGMENT;
    default: return WorkoutEventType.UNKNOWN;
  }
}

/** Source: `description` — the localized name. */
export function workoutEventTypeDescription(type: WorkoutEventType): string {
  switch (type) {
    case WorkoutEventType.PAUSE: return localizedString('WorkoutEvent.Type.Pause');
    case WorkoutEventType.AUTO_PAUSE: return localizedString('WorkoutEvent.Type.AutoPause');
    case WorkoutEventType.RESUME: return localizedString('WorkoutEvent.Type.Resume');
    case WorkoutEventType.AUTO_RESUME: return localizedString('WorkoutEvent.Type.AutoResume');
    case WorkoutEventType.LAP: return localizedString('WorkoutEvent.Type.Lap');
    case WorkoutEventType.MARKER: return localizedString('WorkoutEvent.Type.Marker');
    case WorkoutEventType.SEGMENT: return localizedString('WorkoutEvent.Type.Segment');
    default: return localizedString('WorkoutEvent.Type.Unknown');
  }
}

/** Source: `debugDescription`. */
export function workoutEventTypeDebugDescription(type: WorkoutEventType): string {
  switch (type) {
    case WorkoutEventType.PAUSE: return 'Pause';
    case WorkoutEventType.AUTO_PAUSE: return 'Auto Pause';
    case WorkoutEventType.RESUME: return 'Resume';
    case WorkoutEventType.AUTO_RESUME: return 'Auto Resume';
    case WorkoutEventType.LAP: return 'Lap';
    case WorkoutEventType.MARKER: return 'Marker';
    case WorkoutEventType.SEGMENT: return 'Segment';
    default: return 'Unknown';
  }
}
