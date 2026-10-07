/*
 * Port of `BackupV3` (OutRun/Models/Data/Backup/Backup.swift:55-70), the current backup envelope
 * (`typealias Backup = BackupV3`).
 *
 * V1 and V2 are NOT ported: they exist in the source only so BackupManager can READ an old file,
 * and this app has no old HarmonyOS backups to read. `version` is written into every backup and
 * is what a reader dispatches on, so it stays a field rather than being implied.
 * Encoding/decoding (Codable) belongs to common/BackupManager.ts.
 */
import { TempWorkout } from './TempWorkout';
import { TempEvent } from './TempEvent';

/** Source: `BackupV3.versionCode`. */
export const VERSION_CODE: string = 'V3';

export class BackupV3 {
  readonly date: Date;
  readonly version: string = VERSION_CODE;
  readonly workoutData: TempWorkout[];
  readonly eventData: TempEvent[];

  constructor(workouts: TempWorkout[], events: TempEvent[]) {
    this.date = new Date();
    this.workoutData = workouts;
    this.eventData = events;
  }
}
