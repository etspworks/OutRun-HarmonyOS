/*
 * Port of `BackupManager` (OutRun/Models/Data/Backup/BackupManager.swift:24-103) plus the Codable
 * half of `BackupV3` (OutRun/Models/Data/Backup/Backup.swift:55-70) — model/BackupV3.ts owns the
 * envelope's shape, this module owns its encoding and decoding, as that model's header says.
 *
 * Three deliberate deviations from the source, all recorded in the plan:
 *   - V1/V2 envelopes are NOT read: `init(fromV1:)`/`init(fromV2:)` and those two structs were
 *     dropped with model/BackupV3.ts (no old HarmonyOS backups exist to read), so a file whose
 *     `version` is not "V3" takes the source's `default:` branch. The source's switch lists
 *     `BackupV1.versionCode, Backup.versionCode` and never reaches its own V2 branch — a source
 *     bug that is moot here.
 *   - the picked file arrives as a picker URI, not a `URL`; `@ohos.file.picker`
 *     `DocumentViewPicker.select()` replaces `UIDocumentPickerViewController`, needing no
 *     permission. `importBackup()` is that picker plus the insert, which is what the settings row
 *     calls (the source had a `BackupDocumentPickerDelegate` for it).
 *   - `JSONDecoder` becomes `JSON.parse` plus an explicit rebuild of the staging types: JSON
 *     carries Dates as strings and loses the classes, so decode() reconstructs every TempWorkout
 *     and its samples. That rebuild is the backup's data path — a field dropped there is data
 *     silently lost, so every field of every staging type is carried.
 *
 * The presenting `UIViewController` is gone: progress goes to common/LoadingOverlay.ts, alerts to
 * common/AlertDialogs.ts. The ability context the picker and the temp directory need is registered
 * here (ShareManager uses the same one) because only the ability or a page can resolve it.
 */
import { application, common } from '@kit.AbilityKit';
import { fileIo as fs, picker } from '@kit.CoreFileKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { DataManager, BackupInsertResult } from './DataManager';
import { DataQueryManager } from './DataQueryManager';
import { CustomTimeFormatting } from './Formatting';
import { localizedString } from './LocalizedStrings';
import { showProgressOverlay } from './LoadingOverlay';
import { VERSION_CODE } from '../model/BackupV3';
import { TempWorkout } from '../model/TempWorkout';
import { TempEvent } from '../model/TempEvent';
import { TempWorkoutEvent } from '../model/TempWorkoutEvent';
import { TempWorkoutRouteDataSample } from '../model/TempWorkoutRouteDataSample';
import { TempWorkoutHeartRateDataSample } from '../model/TempWorkoutHeartRateDataSample';
import { Workout } from '../model/Workout';

const DOMAIN: number = 0x0000;
const TAG: string = 'BackupManager';

/** Source: the `.orbup` document type the import picker filters on ("de.tadris.orbup"). */
export const BACKUP_FILE_SUFFIX: string = '.orbup';

let abilityContext: common.UIAbilityContext | null = null;

/**
 * Registered by EntryAbility (or the settings page) so the backup/share file pickers and the temp
 * directory resolve against the ability. Without it the application context is used, which still
 * serves file I/O.
 */
export function setFileContext(context: common.UIAbilityContext): void {
  abilityContext = context;
}

/** The ability context Share Kit needs; null until an ability registered one. */
export function uiAbilityContext(): common.UIAbilityContext | null {
  return abilityContext;
}

/** The context the pickers and `tempDir` are read from. */
export function fileContext(): common.Context {
  const context: common.UIAbilityContext | null = abilityContext;
  return context !== null ? context : application.getApplicationContext();
}

/** The decoded backup envelope — `BackupV3`'s Codable read, with its Dates back as Dates. */
export interface BackupEnvelope {
  date: Date;
  version: string;
  workoutData: TempWorkout[];
  eventData: TempEvent[];
}

// The raw JSON shapes `JSON.parse` hands back (every field optional: a file is untrusted input).

interface RawWorkoutEvent {
  uuid?: string;
  eventType?: number;
  startDate?: string;
  endDate?: string;
}

interface RawRouteSample {
  uuid?: string;
  timestamp?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  horizontalAccuracy?: number;
  verticalAccuracy?: number;
  speed?: number;
  direction?: number;
}

interface RawHeartRateSample {
  uuid?: string;
  heartRate?: number;
  timestamp?: string;
}

interface RawWorkout {
  uuid?: string;
  workoutType?: number;
  startDate?: string;
  endDate?: string;
  distance?: number;
  steps?: number;
  isRace?: boolean;
  isUserModified?: boolean;
  comment?: string;
  burnedEnergy?: number;
  healthKitUUID?: string;
  workoutEvents?: RawWorkoutEvent[];
  locations?: RawRouteSample[];
  heartRates?: RawHeartRateSample[];
}

interface RawEvent {
  uuid?: string;
  title?: string;
  comment?: string;
  startDate?: string;
  endDate?: string;
  workouts?: string[];
}

interface RawBackup {
  date?: string;
  version?: string;
  workoutData?: RawWorkout[];
  eventData?: RawEvent[];
}

function textOf(value: string | undefined): string | null {
  return value === undefined ? null : value;
}

function numberOf(value: number | undefined, fallback: number): number {
  return value === undefined ? fallback : value;
}

function optionalNumberOf(value: number | undefined): number | null {
  return value === undefined ? null : value;
}

function flagOf(value: boolean | undefined): boolean {
  return value === undefined ? false : value;
}

function dateOf(value: string | undefined): Date {
  return value === undefined ? new Date(0) : new Date(value);
}

function optionalDateOf(value: string | undefined): Date | null {
  return value === undefined ? null : new Date(value);
}

function workoutEventOf(raw: RawWorkoutEvent): TempWorkoutEvent {
  return new TempWorkoutEvent(textOf(raw.uuid), numberOf(raw.eventType, -1), dateOf(raw.startDate),
    dateOf(raw.endDate));
}

function routeSampleOf(raw: RawRouteSample): TempWorkoutRouteDataSample {
  return new TempWorkoutRouteDataSample(textOf(raw.uuid), dateOf(raw.timestamp),
    numberOf(raw.latitude, 0), numberOf(raw.longitude, 0), numberOf(raw.altitude, 0),
    numberOf(raw.horizontalAccuracy, 0), numberOf(raw.verticalAccuracy, 0), numberOf(raw.speed, 0),
    numberOf(raw.direction, 0));
}

function heartRateSampleOf(raw: RawHeartRateSample): TempWorkoutHeartRateDataSample {
  return new TempWorkoutHeartRateDataSample(textOf(raw.uuid), numberOf(raw.heartRate, 0),
    dateOf(raw.timestamp));
}

function workoutOf(raw: RawWorkout): TempWorkout {
  const events: TempWorkoutEvent[] = [];
  if (raw.workoutEvents !== undefined) {
    for (const rawEvent of raw.workoutEvents) {
      events.push(workoutEventOf(rawEvent));
    }
  }
  const locations: TempWorkoutRouteDataSample[] = [];
  if (raw.locations !== undefined) {
    for (const rawSample of raw.locations) {
      locations.push(routeSampleOf(rawSample));
    }
  }
  const heartRates: TempWorkoutHeartRateDataSample[] = [];
  if (raw.heartRates !== undefined) {
    for (const rawSample of raw.heartRates) {
      heartRates.push(heartRateSampleOf(rawSample));
    }
  }
  return new TempWorkout(textOf(raw.uuid), numberOf(raw.workoutType, -1), dateOf(raw.startDate),
    dateOf(raw.endDate), numberOf(raw.distance, 0), optionalNumberOf(raw.steps), flagOf(raw.isRace),
    flagOf(raw.isUserModified), textOf(raw.comment), optionalNumberOf(raw.burnedEnergy),
    textOf(raw.healthKitUUID), events, locations, heartRates);
}

function eventOf(raw: RawEvent): TempEvent {
  const workouts: string[] = [];
  if (raw.workouts !== undefined) {
    for (const uuid of raw.workouts) {
      workouts.push(uuid);
    }
  }
  return new TempEvent(textOf(raw.uuid), raw.title === undefined ? '' : raw.title,
    textOf(raw.comment), optionalDateOf(raw.startDate), optionalDateOf(raw.endDate), workouts);
}

export class BackupManager {

  /**
   * Source: `createBackup(forWorkouts:completion:progressClosure:)`. Writes the encoded backup to
   * the temp directory as `<backupTimeCode>.orbup` and returns its path, or null where the source
   * called back `(false, nil)`. `null` workouts means "everything in the store".
   */
  static async createBackup(workouts: Workout[] | null,
    progress: ((fraction: number) => void) | null = null): Promise<string | null> {
    const data: string | null = await DataQueryManager.getBackupData(workouts, null, progress);
    if (data === null) {
      return null;
    }
    const filePath: string =
      `${fileContext().tempDir}/${CustomTimeFormatting.backupTimeCode(new Date())}${BACKUP_FILE_SUFFIX}`;
    try {
      const file: fs.File = fs.openSync(filePath,
        fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
      try {
        fs.writeSync(file.fd, data);
      } finally {
        fs.closeSync(file);
      }
      return filePath;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to write backup file: %{public}s', JSON.stringify(err));
      return null;
    }
  }

  /**
   * The Codable read of `BackupV3` — every field of the envelope, with the staging types rebuilt
   * from their JSON form. Returns null when the text is not a backup this version can read, which
   * is the source's `default:` / "could not extract version" branch.
   */
  static decode(json: string): BackupEnvelope | null {
    let raw: RawBackup;
    try {
      raw = JSON.parse(json) as RawBackup;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'backup data is not valid json: %{public}s', JSON.stringify(err));
      return null;
    }
    if (raw.version === undefined) {
      hilog.error(DOMAIN, TAG, 'could not extract version from backup data');
      return null;
    }
    if (raw.version !== VERSION_CODE) {
      hilog.error(DOMAIN, TAG, 'backup version invalid: %{public}s', raw.version);
      return null;
    }
    const workoutData: TempWorkout[] = [];
    if (raw.workoutData !== undefined) {
      for (const rawWorkout of raw.workoutData) {
        workoutData.push(workoutOf(rawWorkout));
      }
    }
    const eventData: TempEvent[] = [];
    if (raw.eventData !== undefined) {
      for (const rawEvent of raw.eventData) {
        eventData.push(eventOf(rawEvent));
      }
    }
    const envelope: BackupEnvelope = {
      date: dateOf(raw.date),
      version: raw.version,
      workoutData: workoutData,
      eventData: eventData
    };
    return envelope;
  }

  /**
   * Source: `insertBackup(url:completion:progressClosure:)` — read the file, decode it, and insert
   * what the store does not hold yet. `uri` is what the document picker returned.
   */
  static async insertBackup(uri: string,
    progress: ((fraction: number) => void) | null = null): Promise<BackupInsertResult> {
    let json: string;
    try {
      // A picker uri is not a sandbox path: open it, then read the file it resolves to.
      const file: fs.File = fs.openSync(uri, fs.OpenMode.READ_ONLY);
      try {
        json = fs.readTextSync(file.path);
      } finally {
        fs.closeSync(file);
      }
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to read backup at %{public}s: %{public}s', uri,
        JSON.stringify(err));
      return new BackupInsertResult(false, JSON.stringify(err), [], []);
    }
    const envelope: BackupEnvelope | null = BackupManager.decode(json);
    if (envelope === null) {
      return new BackupInsertResult(false, 'backup version invalid', [], []);
    }
    return await DataManager.insertUniqueBackupData(envelope.eventData, envelope.workoutData,
      progress);
  }

  /**
   * Source: `BackupDocumentPickerDelegate.documentPicker(_:didPickDocumentsAt:)` — pick a `.orbup`
   * file, show the import progress, insert it. True when the insert succeeded; the caller raises
   * the success/error alert, as the source's delegate did through the controller.
   * A CANCELLED pick is not a failure: it throws, so the settings row's `.catch` logs it and no
   * alert is shown — dismissing the source's picker did nothing either.
   */
  static async importBackup(): Promise<boolean> {
    const documentPicker: picker.DocumentViewPicker = new picker.DocumentViewPicker(fileContext());
    const options: picker.DocumentSelectOptions = {
      maxSelectNumber: 1,
      fileSuffixFilters: [BACKUP_FILE_SUFFIX]
    };
    const uris: string[] = await documentPicker.select(options);
    if (uris.length === 0) {
      throw new Error('backup import cancelled');
    }
    const updateProgress: (progress: number, message?: string) => void = showProgressOverlay(
      localizedString('Loading'));
    updateProgress(0, localizedString('Settings.ImportBackupData.Message'));
    const result: BackupInsertResult = await BackupManager.insertBackup(uris[0],
      (fraction: number): void => {
        updateProgress(fraction);
      });
    hilog.info(DOMAIN, TAG, 'was able to read and load backup: %{public}d', result.success ? 1 : 0);
    return result.success;
  }
}
