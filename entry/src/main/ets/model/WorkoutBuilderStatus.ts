/*
 * Port of `WorkoutBuilder.Status`
 * (OutRun/Models/Workout/WorkoutBuilder/WorkoutBuilder+Status.swift:24-96).
 *
 * The recorder's state machine: what the record screen shows and what WorkoutBuilder allows.
 * `color` was a `UIColor` (yellow / green / red / systemGray). A model must not reach into the UI
 * layer, so it is returned as the hex string the source's four colours resolve to — `.systemGray`
 * is iOS's #8E8E93, the other three are the pure UIKit primaries.
 */
import { localizedString } from '../common/LocalizedStrings';

export enum WorkoutBuilderStatus {
  WAITING = 'WAITING',
  READY = 'READY',
  RECORDING = 'RECORDING',
  PAUSED = 'PAUSED',
  AUTO_PAUSED = 'AUTO_PAUSED'
}

/** Source: `title` — the localized status label. */
export function workoutBuilderStatusTitle(status: WorkoutBuilderStatus): string {
  switch (status) {
    case WorkoutBuilderStatus.WAITING: return localizedString('WorkoutBuilder.Status.Waiting');
    case WorkoutBuilderStatus.READY: return localizedString('WorkoutBuilder.Status.Ready');
    case WorkoutBuilderStatus.RECORDING: return localizedString('WorkoutBuilder.Status.Recording');
    case WorkoutBuilderStatus.PAUSED: return localizedString('WorkoutBuilder.Status.Paused');
    default: return localizedString('WorkoutBuilder.Status.AutoPaused');
  }
}

/** Source: `color` — UIColor.yellow / .green / .red / .systemGray as hex. */
export function workoutBuilderStatusColor(status: WorkoutBuilderStatus): string {
  switch (status) {
    case WorkoutBuilderStatus.WAITING: return '#FFFF00';
    case WorkoutBuilderStatus.READY: return '#00FF00';
    case WorkoutBuilderStatus.RECORDING: return '#FF0000';
    default: return '#8E8E93';
  }
}

/** Source: `isPausedStatus`. */
export function workoutBuilderStatusIsPaused(status: WorkoutBuilderStatus): boolean {
  return status === WorkoutBuilderStatus.PAUSED || status === WorkoutBuilderStatus.AUTO_PAUSED;
}

/** Source: `isActiveStatus` — data is being recorded in all three. */
export function workoutBuilderStatusIsActive(status: WorkoutBuilderStatus): boolean {
  return status === WorkoutBuilderStatus.RECORDING || workoutBuilderStatusIsPaused(status);
}
