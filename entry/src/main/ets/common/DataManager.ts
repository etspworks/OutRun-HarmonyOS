/*
 * DataManager — ported from OutRun/Models/Data/DataManager.swift, with the CoreStore/CoreData
 * stack replaced by `@ohos.data.relationalStore` (CLAUDE.md rule 10: capability, not library).
 *
 * What the port keeps from the source stack:
 *  - the THREE-VERSION schema chain (V1 -> V2 -> V3, OutRunV{1,2,3}.swift) with a migration
 *    progress callback, run from `setup()`;
 *  - the derived ("transient customGetter") workout values of DataModelValueGetters.swift —
 *    computed here and stored as real columns so the list can sort on activeDuration;
 *  - the observable workout list CoreStore's ListMonitor gave the list screen: relationalStore
 *    replaces the storage but none of the observation, so `workoutMonitor` owns a small
 *    observer registry and re-runs its query after every mutation.
 *
 * Apple Health is not available on HarmonyOS (registered platform-capability substitution), so
 * every healthKitUUID path here works against this store's own `healthKitID` column. The export
 * side is a hook a later health module registers — this module never calls a health API.
 */
import { application, common } from '@kit.AbilityKit';
import { relationalStore } from '@kit.ArkData';
import { fileIo as fs } from '@kit.CoreFileKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { util } from '@kit.ArkTS';
import { qaFault } from './QaHooks';
import { Workout } from '../model/Workout';
import { WorkoutEvent } from '../model/WorkoutEvent';
import { WorkoutRouteDataSample } from '../model/WorkoutRouteDataSample';
import { WorkoutHeartRateDataSample } from '../model/WorkoutHeartRateDataSample';
import { Event } from '../model/Event';
import { TempWorkout } from '../model/TempWorkout';
import { TempEvent } from '../model/TempEvent';
import { TempWorkoutEvent } from '../model/TempWorkoutEvent';
import { TempWorkoutRouteDataSample } from '../model/TempWorkoutRouteDataSample';
import { TempWorkoutHeartRateDataSample } from '../model/TempWorkoutHeartRateDataSample';
import { HKWorkoutQueryObject } from '../model/HKWorkoutQueryObject';
import { WorkoutType, workoutTypeFromRaw, workoutTypeMetSpeedMultiplier } from '../model/WorkoutType';
import { WorkoutEventType, workoutEventTypeFromRaw } from '../model/WorkoutEventType';
import { WorkoutSortClause } from '../model/WorkoutListSortType';
import { WorkoutFilterClause } from '../model/WorkoutListFilterType';
import { Unit } from './Measurement';
import { UserPreferences } from './UserPreferences';

const DOMAIN: number = 0x0000;
const TAG: string = 'DataManager';

export const DB_NAME: string = 'OutRun.db';
export const SCHEMA_VERSION: number = 3;

export const TABLE_WORKOUT: string = 'workout';
export const TABLE_WORKOUT_EVENT: string = 'workoutEvent';
export const TABLE_ROUTE_SAMPLE: string = 'workoutRouteDataSample';
export const TABLE_HEART_RATE_SAMPLE: string = 'workoutHeartRateSample';
export const TABLE_EVENT: string = 'event';
export const TABLE_EVENT_WORKOUT: string = 'eventWorkout';

const WORKOUT_COLUMNS: string[] = ['id', 'workoutType', 'distance', 'steps', 'startDate',
  'endDate', 'burnedEnergy', 'isRace', 'comment', 'isUserModified', 'healthKitID',
  'ascendingAltitude', 'descendingAltitude', 'activeDuration', 'pauseDuration', 'dayIdentifier'];

const CREATE_WORKOUT: string = `CREATE TABLE IF NOT EXISTS ${TABLE_WORKOUT} (
  id TEXT PRIMARY KEY NOT NULL, workoutType INTEGER NOT NULL DEFAULT -1,
  distance REAL NOT NULL DEFAULT -1, steps INTEGER, startDate INTEGER NOT NULL DEFAULT 0,
  endDate INTEGER NOT NULL DEFAULT 0, burnedEnergy REAL, isRace INTEGER NOT NULL DEFAULT 0,
  comment TEXT, isUserModified INTEGER NOT NULL DEFAULT 0, healthKitID TEXT,
  ascendingAltitude REAL NOT NULL DEFAULT 0, descendingAltitude REAL NOT NULL DEFAULT 0,
  activeDuration REAL NOT NULL DEFAULT 0, pauseDuration REAL NOT NULL DEFAULT 0,
  dayIdentifier TEXT NOT NULL DEFAULT '')`;

const CREATE_ROUTE_SAMPLE: string = `CREATE TABLE IF NOT EXISTS ${TABLE_ROUTE_SAMPLE} (
  id TEXT PRIMARY KEY NOT NULL, workoutId TEXT, timestamp INTEGER NOT NULL DEFAULT 0,
  latitude REAL NOT NULL DEFAULT -1, longitude REAL NOT NULL DEFAULT -1,
  altitude REAL NOT NULL DEFAULT -1, horizontalAccuracy REAL NOT NULL DEFAULT 0,
  verticalAccuracy REAL NOT NULL DEFAULT 0, speed REAL NOT NULL DEFAULT -1,
  direction REAL NOT NULL DEFAULT -1, orderIndex INTEGER NOT NULL DEFAULT 0)`;

const CREATE_WORKOUT_EVENT: string = `CREATE TABLE IF NOT EXISTS ${TABLE_WORKOUT_EVENT} (
  id TEXT PRIMARY KEY NOT NULL, workoutId TEXT, eventType INTEGER NOT NULL DEFAULT 0,
  startDate INTEGER NOT NULL DEFAULT 0, endDate INTEGER NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0, orderIndex INTEGER NOT NULL DEFAULT 0)`;

const CREATE_HEART_RATE_SAMPLE: string = `CREATE TABLE IF NOT EXISTS ${TABLE_HEART_RATE_SAMPLE} (
  id TEXT PRIMARY KEY NOT NULL, workoutId TEXT, heartRate REAL NOT NULL DEFAULT 0,
  timestamp INTEGER NOT NULL DEFAULT 0, orderIndex INTEGER NOT NULL DEFAULT 0)`;

const CREATE_EVENT: string = `CREATE TABLE IF NOT EXISTS ${TABLE_EVENT} (
  id TEXT PRIMARY KEY NOT NULL, eventTitle TEXT NOT NULL DEFAULT '', comment TEXT)`;

const CREATE_EVENT_WORKOUT: string = `CREATE TABLE IF NOT EXISTS ${TABLE_EVENT_WORKOUT} (
  eventId TEXT NOT NULL, workoutId TEXT NOT NULL, PRIMARY KEY (eventId, workoutId))`;

function newUuid(): string {
  return util.generateRandomUUID(true);
}

function millis(date: Date): number {
  return date.getTime();
}

/** seconds between two dates, always positive — `Date.distance(to:)` in Date.swift. */
function distanceInSeconds(from: Date, to: Date): number {
  return Math.abs(to.getTime() - from.getTime()) / 1000;
}

function pad(value: number, length: number): string {
  let text: string = `${value}`;
  while (text.length < length) {
    text = `0${text}`;
  }
  return text;
}

/** The ascending/descending pair DataModelValueGetters.dimensionalAltitudes returns. */
export class AltitudeGain {
  readonly ascending: number;
  readonly descending: number;

  constructor(ascending: number, descending: number) {
    this.ascending = ascending;
    this.descending = descending;
  }
}

/**
 * DataModelValueGetters.swift — in the source these are CoreStore transient `customGetter`s.
 * relationalStore has no transient attributes, so they are computed here and written into real
 * columns on every insert/update (which is also what lets the list sort by activeDuration).
 */
export class DataModelValueGetters {

  /** CustomTimeFormatting.dayIdentifier(forDate:) — the "yyyyMMdd" day key. */
  static dayIdentifier(date: Date): string {
    return `${pad(date.getFullYear(), 4)}${pad(date.getMonth() + 1, 2)}${pad(date.getDate(), 2)}`;
  }

  /** Total paused seconds, summed over pause/resume event pairs. */
  static pauseDuration(workout: Workout): number {
    let duration: number = 0;
    let pauseDate: Date | null = null;
    const events: WorkoutEvent[] = workout.workoutEvents;
    for (let index: number = 0; index < events.length; index++) {
      const event: WorkoutEvent = events[index];
      const type: WorkoutEventType = workoutEventTypeFromRaw(event.eventType);
      if ((type === WorkoutEventType.PAUSE || type === WorkoutEventType.AUTO_PAUSE)
        && pauseDate === null) {
        pauseDate = event.startDate;
      } else if ((type === WorkoutEventType.RESUME || type === WorkoutEventType.AUTO_RESUME)
        && pauseDate !== null) {
        duration += distanceInSeconds(event.startDate, pauseDate);
        pauseDate = null;
      }
      if (index + 1 === events.length && pauseDate !== null
        && workout.endDate.getTime() >= pauseDate.getTime()) {
        duration += distanceInSeconds(workout.endDate, pauseDate);
      }
    }
    return duration;
  }

  /** Total duration minus the paused part. */
  static activeDuration(workout: Workout): number {
    return distanceInSeconds(workout.endDate, workout.startDate)
      - DataModelValueGetters.pauseDuration(workout);
  }

  /**
   * Ascending and descending altitude, from the route samples smoothed over an 11-sample window.
   * Ported verbatim, including the source's double-counting of the centre sample.
   */
  static dimensionalAltitudes(workout: Workout): AltitudeGain {
    const altitudes: number[] = [];
    for (const sample of workout.routeData) {
      altitudes.push(sample.altitude);
    }
    let tempAscending: number = 0;
    let tempDescending: number = 0;
    let lastRoundedAltitude: number | null = null;
    for (let index: number = 0; index < altitudes.length; index++) {
      let tempSum: number = altitudes[index];
      let tempCount: number = 1;
      for (let i: number = index - 5; i <= index + 5; i++) {
        if (i >= 0 && i < altitudes.length) {
          tempSum += altitudes[i];
          tempCount += 1;
        }
      }
      const rounded: number = tempSum / tempCount;
      if (lastRoundedAltitude === null) {
        lastRoundedAltitude = rounded;
        continue;
      }
      const difference: number = rounded - lastRoundedAltitude;
      if (difference > 0) {
        tempAscending += difference;
      } else if (difference < 0) {
        tempDescending += Math.abs(difference);
      }
      lastRoundedAltitude = rounded;
    }
    return new AltitudeGain(Math.round(tempAscending), Math.round(tempDescending));
  }

  static ascendingAltitude(workout: Workout): number {
    return DataModelValueGetters.dimensionalAltitudes(workout).ascending;
  }

  static descendingAltitude(workout: Workout): number {
    return DataModelValueGetters.dimensionalAltitudes(workout).descending;
  }

  /** WorkoutEvent.duration */
  static duration(event: WorkoutEvent): number {
    return distanceInSeconds(event.endDate, event.startDate);
  }

  /**
   * Event.startDate. NOTE: the source's comparator is inverted (`min { $0.startDate >
   * $1.startDate }`), so it yields the LATEST workout start; ported as-is to keep the app's
   * observable behaviour.
   */
  static startDate(workouts: Workout[]): Date | null {
    let result: Date | null = null;
    for (const workout of workouts) {
      if (result === null || workout.startDate.getTime() > result.getTime()) {
        result = workout.startDate;
      }
    }
    return result;
  }

  /** Event.endDate — the source's comparator is inverted here too (earliest workout end). */
  static endDate(workouts: Workout[]): Date | null {
    let result: Date | null = null;
    for (const workout of workouts) {
      if (result === null || workout.endDate.getTime() < result.getTime()) {
        result = workout.endDate;
      }
    }
    return result;
  }
}

/** BurnedEnergyCalculator.calculateBurnedCalories — kcal from distance, type and body weight. */
function burnedKilocalories(type: WorkoutType, distanceMeters: number, weight: number): number {
  const kilometers: number = distanceMeters / 1000;
  return kilometers * workoutTypeMetSpeedMultiplier(type) * weight;
}

/** The workout values the source passes to `saveWorkout(withType:...)`. */
export class WorkoutDraft {
  type: WorkoutType;
  startDate: Date;
  endDate: Date;
  distance: number;
  steps: number | null = null;
  isRace: boolean = false;
  isUserModified: boolean = false;
  comment: string | null = null;
  burnedEnergy: number | null = null;
  healthKitUUID: string | null = null;
  events: TempWorkoutEvent[] = [];
  routeSamples: TempWorkoutRouteDataSample[] = [];
  heartRates: TempWorkoutHeartRateDataSample[] = [];

  constructor(type: WorkoutType, startDate: Date, endDate: Date, distance: number) {
    this.type = type;
    this.startDate = startDate;
    this.endDate = endDate;
    this.distance = distance;
  }
}

/** The optional edits `alterWorkout` applies; the `set*` flags mirror the source's tuples. */
export class WorkoutChanges {
  type: WorkoutType | null = null;
  startDate: Date | null = null;
  endDate: Date | null = null;
  distance: number | null = null;
  setSteps: boolean = false;
  steps: number | null = null;
  isRace: boolean | null = null;
  setComment: boolean = false;
  comment: string | null = null;
  weightBeforeWorkout: number | null = null;
}

/** The four values `insertUniqueBackupData`'s completion carries. */
export class BackupInsertResult {
  readonly success: boolean;
  readonly error: string | null;
  readonly workouts: Workout[];
  readonly events: Event[];

  constructor(success: boolean, error: string | null, workouts: Workout[], events: Event[]) {
    this.success = success;
    this.error = error;
    this.workouts = workouts;
    this.events = events;
  }
}

/** What CoreStore's `ListObserver` gave the workout list. */
export interface WorkoutMonitorObserver {
  monitorDidChange(): void;
  monitorWillRefetch(): void;
  monitorDidRefetch(): void;
}

/** Turns the list screen's sort/filter clauses into `RdbPredicates` over the workout table. */
export function workoutPredicates(filters: WorkoutFilterClause[],
  sort: WorkoutSortClause | null): relationalStore.RdbPredicates {
  const predicates: relationalStore.RdbPredicates =
    new relationalStore.RdbPredicates(TABLE_WORKOUT);
  let first: boolean = true;
  for (const filter of filters) {
    if (!first) {
      predicates.and();
    }
    first = false;
    const raw: number | boolean = filter.value;
    let stored: number = 0;
    if (raw === true) {
      stored = 1;
    } else if (raw !== false) {
      stored = raw as number;
    }
    predicates.equalTo(filter.column, stored);
  }
  if (sort !== null) {
    if (sort.descending) {
      predicates.orderByDesc(sort.column);
    } else {
      predicates.orderByAsc(sort.column);
    }
  }
  return predicates;
}

/**
 * The observable workout list the list screen binds to — CoreStore's
 * `dataStack.monitorList(From<Workout>().orderBy(.descending(\.startDate)))`.
 */
export class WorkoutListMonitor {
  private objectsList: Workout[] = [];
  private observers: WorkoutMonitorObserver[] = [];
  private filterClauses: WorkoutFilterClause[] = [];
  private sortClause: WorkoutSortClause = new WorkoutSortClause('startDate', true);

  objects(): Workout[] {
    return this.objectsList;
  }

  numberOfObjects(): number {
    return this.objectsList.length;
  }

  numberOfSections(): number {
    return 1;
  }

  /** `numberOfObjects(safelyIn:)` — null for a section that does not exist. */
  numberOfObjectsInSection(section: number): number | null {
    return section === 0 ? this.objectsList.length : null;
  }

  objectAt(section: number, row: number): Workout | null {
    if (section !== 0 || row < 0 || row >= this.objectsList.length) {
      return null;
    }
    return this.objectsList[row];
  }

  addObserver(observer: WorkoutMonitorObserver): void {
    if (this.observers.indexOf(observer) === -1) {
      this.observers.push(observer);
    }
  }

  removeObserver(observer: WorkoutMonitorObserver): void {
    const index: number = this.observers.indexOf(observer);
    if (index !== -1) {
      this.observers.splice(index, 1);
    }
  }

  /** Re-runs the query; passing no clauses keeps the current ones (a store-change reload). */
  async refetch(filters: WorkoutFilterClause[] | null = null,
    sort: WorkoutSortClause | null = null): Promise<void> {
    if (filters !== null) {
      this.filterClauses = filters;
    }
    if (sort !== null) {
      this.sortClause = sort;
    }
    for (const observer of this.observers) {
      observer.monitorWillRefetch();
    }
    try {
      this.objectsList =
        await DataManager.loadWorkouts(workoutPredicates(this.filterClauses, this.sortClause), false);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'monitor refetch failed: %{public}s', JSON.stringify(err));
    }
    for (const observer of this.observers) {
      observer.monitorDidRefetch();
      observer.monitorDidChange();
    }
  }
}

/** Registered by the health module so an imported workout can still reach a health store. */
export type HealthWorkoutExporter = (workouts: Workout[]) => Promise<void>;

export class DataManager {
  /** The open store — CoreStore's `dataStack`. */
  static dataStack: relationalStore.RdbStore | null = null;
  /** The database file backing it — CoreStore's `SQLiteStore`. */
  static storage: string | null = null;
  /** Set by the health module; this module never calls a health API itself. */
  static healthExporter: HealthWorkoutExporter | null = null;
  /** The observable workout list the list screen renders. */
  static readonly workoutMonitor: WorkoutListMonitor = new WorkoutListMonitor();

  /**
   * Resolves once `setup()` has finished (successfully or not). A page deep-linked into a COLD
   * start — the Debug screen is launched exactly that way — runs its `aboutToAppear` ~13 ms
   * before the store is open, so a read that does not wait renders the source's "unknown"
   * sentinel for ever: the screen is built once and never re-read.
   */
  static async ready(): Promise<void> {
    const task: Promise<void> | null = DataManager.setupTask;
    if (task === null) {
      return;
    }
    try {
      await task;
    } catch (err) {
      // A store that failed to open is still an ANSWER for the caller: it reads the "unknown"
      // sentinel, exactly as the source does, instead of waiting for ever.
      hilog.error(DOMAIN, TAG, 'store setup failed: %{public}s', JSON.stringify(err));
    }
  }

  /** The in-flight (or finished) `setup()`, which `ready()` waits on. */
  private static setupTask: Promise<void> | null = null;

  /** Size of the database file in bytes, or null when it is not open yet. */
  static get diskSize(): number | null {
    if (DataManager.storage === null) {
      // Silent otherwise, and indistinguishable on device from a failed stat: the Debug screen
      // renders the same "unknown" sentinel for both.
      hilog.warn(DOMAIN, TAG, 'diskSize read before the store path was resolved');
      return null;
    }
    try {
      return fs.statSync(DataManager.storage).size;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to stat %{public}s: %{public}s', DataManager.storage,
        JSON.stringify(err));
      return null;
    }
  }

  static requireStore(): relationalStore.RdbStore {
    if (DataManager.dataStack === null) {
      throw new Error('DataManager.setup() has not completed');
    }
    return DataManager.dataStack;
  }

  // MARK: Setup

  /**
   * Opens the store, creating or migrating the schema. `onMigrationProgress` is only called when
   * an older schema is actually upgraded — the source uses the same signal to show its migration
   * overlay.
   */
  static setup(onMigrationProgress: (progress: number) => void): Promise<void> {
    const task: Promise<void> = DataManager.performSetup(onMigrationProgress);
    DataManager.setupTask = task;
    return task;
  }

  private static async performSetup(
    onMigrationProgress: (progress: number) => void): Promise<void> {
    if (DataManager.dataStack !== null) {
      await DataManager.workoutMonitor.refetch();
      return;
    }
    const context: common.Context = application.getApplicationContext();
    const store: relationalStore.RdbStore = await DataManager.openStore(context);
    DataManager.dataStack = store;
    DataManager.storage = DataManager.resolveStoragePath(context);

    const version: number = store.version;
    if (version === SCHEMA_VERSION) {
      await DataManager.workoutMonitor.refetch();
      return;
    }
    if (version === 0) {
      await DataManager.createSchema(store);
      store.version = SCHEMA_VERSION;
      await DataManager.workoutMonitor.refetch();
      return;
    }
    // Migration chain, OutRunV1 -> OutRunV2 -> OutRunV3.
    onMigrationProgress(0);
    if (version === 1) {
      await DataManager.migrateV1ToV2(store);
      onMigrationProgress(0.5);
    }
    await DataManager.migrateV2ToV3(store);
    store.version = SCHEMA_VERSION;
    onMigrationProgress(1);
    await DataManager.workoutMonitor.refetch();
  }

  /**
   * Where `relationalStore.getRdbStore()` actually put the file. The documented layout is
   * `<databaseDir>/rdb/<name>` (the device's own WAL-recovery log names that path), but the
   * layout is not something the API reports back, so the file is LOOKED UP rather than assumed —
   * a wrong guess here is invisible: `diskSize` just answers null and the Debug screen shows the
   * source's "-1 bytes" sentinel for ever.
   */
  private static resolveStoragePath(context: common.Context): string {
    const candidates: string[] =
      [`${context.databaseDir}/rdb/${DB_NAME}`, `${context.databaseDir}/${DB_NAME}`];
    for (const candidate of candidates) {
      if (DataManager.fileExists(candidate)) {
        return candidate;
      }
    }
    return candidates[0];
  }

  /**
   * `fs.accessSync` is documented both ways — it RETURNS false for a missing path and it can
   * THROW 13900002 (no such file or directory). Either answer means the same thing here.
   */
  private static fileExists(path: string): boolean {
    try {
      return fs.accessSync(path);
    } catch (err) {
      return false;
    }
  }

  /** The store handle lives as long as the app does; `close()` releases it. */
  private static async openStore(context: common.Context): Promise<relationalStore.RdbStore> {
    const config: relationalStore.StoreConfig = {
      name: DB_NAME,
      securityLevel: relationalStore.SecurityLevel.S1
    };
    return relationalStore.getRdbStore(context, config);
  }

  /** Teardown for the owning ability's `onDestroy` — CLAUDE.md rule 8. */
  static async close(): Promise<void> {
    const store: relationalStore.RdbStore | null = DataManager.dataStack;
    if (store === null) {
      return;
    }
    try {
      await store.close();
    } finally {
      DataManager.dataStack = null;
    }
  }

  private static async createSchema(store: relationalStore.RdbStore): Promise<void> {
    await store.executeSql(CREATE_WORKOUT);
    await store.executeSql(CREATE_ROUTE_SAMPLE);
    await store.executeSql(CREATE_WORKOUT_EVENT);
    await store.executeSql(CREATE_HEART_RATE_SAMPLE);
    await store.executeSql(CREATE_EVENT);
    await store.executeSql(CREATE_EVENT_WORKOUT);
  }

  /** OutRunV2.mappingProvider: isRace/isUserModified/comment and the sample accuracies. */
  private static async migrateV1ToV2(store: relationalStore.RdbStore): Promise<void> {
    await DataManager.addColumn(store, TABLE_WORKOUT, 'isRace', 'INTEGER NOT NULL DEFAULT 0');
    await DataManager.addColumn(store, TABLE_WORKOUT, 'isUserModified',
      'INTEGER NOT NULL DEFAULT 0');
    await DataManager.addColumn(store, TABLE_WORKOUT, 'comment', 'TEXT');
    await DataManager.addColumn(store, TABLE_ROUTE_SAMPLE, 'horizontalAccuracy',
      'REAL NOT NULL DEFAULT 0');
    await DataManager.addColumn(store, TABLE_ROUTE_SAMPLE, 'verticalAccuracy',
      'REAL NOT NULL DEFAULT 0');
  }

  /** OutRunV3.mappingProvider: steps, the derived columns and the four inserted entities. */
  private static async migrateV2ToV3(store: relationalStore.RdbStore): Promise<void> {
    await DataManager.addColumn(store, TABLE_WORKOUT, 'steps', 'INTEGER');
    await DataManager.addColumn(store, TABLE_WORKOUT, 'ascendingAltitude',
      'REAL NOT NULL DEFAULT 0');
    await DataManager.addColumn(store, TABLE_WORKOUT, 'descendingAltitude',
      'REAL NOT NULL DEFAULT 0');
    await DataManager.addColumn(store, TABLE_WORKOUT, 'activeDuration', 'REAL NOT NULL DEFAULT 0');
    await DataManager.addColumn(store, TABLE_WORKOUT, 'pauseDuration', 'REAL NOT NULL DEFAULT 0');
    await DataManager.addColumn(store, TABLE_WORKOUT, 'dayIdentifier',
      `TEXT NOT NULL DEFAULT ''`);
    await store.executeSql(CREATE_WORKOUT_EVENT);
    await store.executeSql(CREATE_HEART_RATE_SAMPLE);
    await store.executeSql(CREATE_EVENT);
    await store.executeSql(CREATE_EVENT_WORKOUT);
    // The V2 workouts have no events, so their derived values come from the route data alone.
    const workouts: Workout[] = await DataManager.loadWorkouts(
      new relationalStore.RdbPredicates(TABLE_WORKOUT), true);
    for (const workout of workouts) {
      await DataManager.writeDerivedValues(store, workout);
    }
  }

  private static async addColumn(store: relationalStore.RdbStore, table: string, column: string,
    definition: string): Promise<void> {
    try {
      await store.executeSql(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (err) {
      // An already-present column is the normal case on a partially migrated store.
      hilog.info(DOMAIN, TAG, 'skipped column %{public}s: %{public}s', column, JSON.stringify(err));
    }
  }

  // MARK: Row mapping

  /** Fills every `Workout` column the store holds. */
  static workoutFromRow(rs: relationalStore.ResultSet): Workout {
    const workout: Workout = new Workout();
    workout.uuid = rs.getString(rs.getColumnIndex('id'));
    workout.workoutType = rs.getLong(rs.getColumnIndex('workoutType'));
    workout.distance = rs.getDouble(rs.getColumnIndex('distance'));
    const stepsIndex: number = rs.getColumnIndex('steps');
    workout.steps = rs.isColumnNull(stepsIndex) ? null : rs.getLong(stepsIndex);
    workout.startDate = new Date(rs.getLong(rs.getColumnIndex('startDate')));
    workout.endDate = new Date(rs.getLong(rs.getColumnIndex('endDate')));
    const energyIndex: number = rs.getColumnIndex('burnedEnergy');
    workout.burnedEnergy = rs.isColumnNull(energyIndex) ? null : rs.getDouble(energyIndex);
    workout.isRace = rs.getLong(rs.getColumnIndex('isRace')) !== 0;
    const commentIndex: number = rs.getColumnIndex('comment');
    workout.comment = rs.isColumnNull(commentIndex) ? null : rs.getString(commentIndex);
    workout.isUserModified = rs.getLong(rs.getColumnIndex('isUserModified')) !== 0;
    const healthIndex: number = rs.getColumnIndex('healthKitID');
    workout.healthKitUUID = rs.isColumnNull(healthIndex) ? null : rs.getString(healthIndex);
    workout.ascendingAltitude = rs.getDouble(rs.getColumnIndex('ascendingAltitude'));
    workout.descendingAltitude = rs.getDouble(rs.getColumnIndex('descendingAltitude'));
    workout.activeDuration = rs.getDouble(rs.getColumnIndex('activeDuration'));
    workout.pauseDuration = rs.getDouble(rs.getColumnIndex('pauseDuration'));
    workout.dayIdentifier = rs.getString(rs.getColumnIndex('dayIdentifier'));
    return workout;
  }

  private static workoutValues(workout: Workout): relationalStore.ValuesBucket {
    const values: relationalStore.ValuesBucket = {
      'id': workout.uuid,
      'workoutType': workout.workoutType,
      'distance': workout.distance,
      'steps': workout.steps,
      'startDate': millis(workout.startDate),
      'endDate': millis(workout.endDate),
      'burnedEnergy': workout.burnedEnergy,
      'isRace': workout.isRace ? 1 : 0,
      'comment': workout.comment,
      'isUserModified': workout.isUserModified ? 1 : 0,
      'healthKitID': workout.healthKitUUID,
      'ascendingAltitude': workout.ascendingAltitude,
      'descendingAltitude': workout.descendingAltitude,
      'activeDuration': workout.activeDuration,
      'pauseDuration': workout.pauseDuration,
      'dayIdentifier': workout.dayIdentifier
    };
    return values;
  }

  static routeSampleFromRow(rs: relationalStore.ResultSet): WorkoutRouteDataSample {
    const sample: WorkoutRouteDataSample = new WorkoutRouteDataSample();
    sample.uuid = rs.getString(rs.getColumnIndex('id'));
    sample.timestamp = new Date(rs.getLong(rs.getColumnIndex('timestamp')));
    sample.latitude = rs.getDouble(rs.getColumnIndex('latitude'));
    sample.longitude = rs.getDouble(rs.getColumnIndex('longitude'));
    sample.altitude = rs.getDouble(rs.getColumnIndex('altitude'));
    sample.horizontalAccuracy = rs.getDouble(rs.getColumnIndex('horizontalAccuracy'));
    sample.verticalAccuracy = rs.getDouble(rs.getColumnIndex('verticalAccuracy'));
    sample.speed = rs.getDouble(rs.getColumnIndex('speed'));
    sample.direction = rs.getDouble(rs.getColumnIndex('direction'));
    return sample;
  }

  static heartRateFromRow(rs: relationalStore.ResultSet): WorkoutHeartRateDataSample {
    const sample: WorkoutHeartRateDataSample = new WorkoutHeartRateDataSample();
    sample.uuid = rs.getString(rs.getColumnIndex('id'));
    sample.heartRate = rs.getDouble(rs.getColumnIndex('heartRate'));
    sample.timestamp = new Date(rs.getLong(rs.getColumnIndex('timestamp')));
    return sample;
  }

  static workoutEventFromRow(rs: relationalStore.ResultSet): WorkoutEvent {
    const event: WorkoutEvent = new WorkoutEvent();
    event.uuid = rs.getString(rs.getColumnIndex('id'));
    event.eventType = rs.getLong(rs.getColumnIndex('eventType'));
    event.startDate = new Date(rs.getLong(rs.getColumnIndex('startDate')));
    event.endDate = new Date(rs.getLong(rs.getColumnIndex('endDate')));
    return event;
  }

  static eventFromRow(rs: relationalStore.ResultSet): Event {
    const event: Event = new Event();
    event.uuid = rs.getString(rs.getColumnIndex('id'));
    event.title = rs.getString(rs.getColumnIndex('eventTitle'));
    const commentIndex: number = rs.getColumnIndex('comment');
    event.comment = rs.isColumnNull(commentIndex) ? null : rs.getString(commentIndex);
    return event;
  }

  // MARK: Queries used across the data layer

  /** Loads workouts; `includeChildren` also loads events, route and heart-rate samples. */
  static async loadWorkouts(predicates: relationalStore.RdbPredicates,
    includeChildren: boolean): Promise<Workout[]> {
    const store: relationalStore.RdbStore = DataManager.requireStore();
    const workouts: Workout[] = [];
    const rs: relationalStore.ResultSet = await store.query(predicates, WORKOUT_COLUMNS);
    try {
      while (rs.goToNextRow()) {
        workouts.push(DataManager.workoutFromRow(rs));
      }
    } finally {
      rs.close();
    }
    if (includeChildren) {
      for (const workout of workouts) {
        await DataManager.hydrate(workout);
      }
    }
    return workouts;
  }

  static async workout(uuid: string): Promise<Workout | null> {
    const predicates: relationalStore.RdbPredicates =
      new relationalStore.RdbPredicates(TABLE_WORKOUT);
    predicates.equalTo('id', uuid);
    const workouts: Workout[] = await DataManager.loadWorkouts(predicates, true);
    return workouts.length === 0 ? null : workouts[0];
  }

  /** Fills a workout's children and the events referencing it. */
  static async hydrate(workout: Workout): Promise<Workout> {
    if (workout.uuid === null) {
      return workout;
    }
    workout.workoutEvents = await DataManager.loadWorkoutEvents(workout.uuid);
    workout.routeData = await DataManager.loadRouteSamples(workout.uuid);
    workout.heartRates = await DataManager.loadHeartRateSamples(workout.uuid);
    workout.events = await DataManager.loadEventIdsOfWorkout(workout.uuid);
    return workout;
  }

  static async loadRouteSamples(workoutUuid: string): Promise<WorkoutRouteDataSample[]> {
    const store: relationalStore.RdbStore = DataManager.requireStore();
    const predicates: relationalStore.RdbPredicates =
      new relationalStore.RdbPredicates(TABLE_ROUTE_SAMPLE);
    predicates.equalTo('workoutId', workoutUuid).orderByAsc('orderIndex');
    const samples: WorkoutRouteDataSample[] = [];
    const rs: relationalStore.ResultSet = await store.query(predicates);
    try {
      while (rs.goToNextRow()) {
        samples.push(DataManager.routeSampleFromRow(rs));
      }
    } finally {
      rs.close();
    }
    return samples;
  }

  static async loadHeartRateSamples(workoutUuid: string): Promise<WorkoutHeartRateDataSample[]> {
    const store: relationalStore.RdbStore = DataManager.requireStore();
    const predicates: relationalStore.RdbPredicates =
      new relationalStore.RdbPredicates(TABLE_HEART_RATE_SAMPLE);
    predicates.equalTo('workoutId', workoutUuid).orderByAsc('orderIndex');
    const samples: WorkoutHeartRateDataSample[] = [];
    const rs: relationalStore.ResultSet = await store.query(predicates);
    try {
      while (rs.goToNextRow()) {
        samples.push(DataManager.heartRateFromRow(rs));
      }
    } finally {
      rs.close();
    }
    return samples;
  }

  static async loadWorkoutEvents(workoutUuid: string): Promise<WorkoutEvent[]> {
    const store: relationalStore.RdbStore = DataManager.requireStore();
    const predicates: relationalStore.RdbPredicates =
      new relationalStore.RdbPredicates(TABLE_WORKOUT_EVENT);
    predicates.equalTo('workoutId', workoutUuid).orderByAsc('orderIndex');
    const events: WorkoutEvent[] = [];
    const rs: relationalStore.ResultSet = await store.query(predicates);
    try {
      while (rs.goToNextRow()) {
        events.push(DataManager.workoutEventFromRow(rs));
      }
    } finally {
      rs.close();
    }
    return events;
  }

  private static async loadEventIdsOfWorkout(workoutUuid: string): Promise<string[]> {
    const store: relationalStore.RdbStore = DataManager.requireStore();
    const predicates: relationalStore.RdbPredicates =
      new relationalStore.RdbPredicates(TABLE_EVENT_WORKOUT);
    predicates.equalTo('workoutId', workoutUuid);
    const ids: string[] = [];
    const rs: relationalStore.ResultSet = await store.query(predicates, ['eventId']);
    try {
      while (rs.goToNextRow()) {
        ids.push(rs.getString(rs.getColumnIndex('eventId')));
      }
    } finally {
      rs.close();
    }
    return ids;
  }

  /** Every event in the store, with its linked workout uuids and derived date range. */
  static async loadEvents(): Promise<Event[]> {
    const store: relationalStore.RdbStore = DataManager.requireStore();
    const events: Event[] = [];
    const predicates: relationalStore.RdbPredicates =
      new relationalStore.RdbPredicates(TABLE_EVENT);
    const rs: relationalStore.ResultSet = await store.query(predicates);
    try {
      while (rs.goToNextRow()) {
        events.push(DataManager.eventFromRow(rs));
      }
    } finally {
      rs.close();
    }
    for (const event of events) {
      event.workouts = await DataManager.loadWorkoutIdsOfEvent(event.uuid !== null ? event.uuid : '');
      const linked: Workout[] = await DataManager.workoutsOfEvent(event);
      event.startDate = DataModelValueGetters.startDate(linked);
      event.endDate = DataModelValueGetters.endDate(linked);
    }
    return events;
  }

  private static async loadWorkoutIdsOfEvent(eventUuid: string): Promise<string[]> {
    const store: relationalStore.RdbStore = DataManager.requireStore();
    const predicates: relationalStore.RdbPredicates =
      new relationalStore.RdbPredicates(TABLE_EVENT_WORKOUT);
    predicates.equalTo('eventId', eventUuid);
    const ids: string[] = [];
    const rs: relationalStore.ResultSet = await store.query(predicates, ['workoutId']);
    try {
      while (rs.goToNextRow()) {
        ids.push(rs.getString(rs.getColumnIndex('workoutId')));
      }
    } finally {
      rs.close();
    }
    return ids;
  }

  /** Every workout uuid in the store — used by the backup importer's duplicate check. */
  static async allWorkoutUuids(): Promise<string[]> {
    const store: relationalStore.RdbStore = DataManager.requireStore();
    const predicates: relationalStore.RdbPredicates =
      new relationalStore.RdbPredicates(TABLE_WORKOUT);
    predicates.isNotNull('id');
    const uuids: string[] = [];
    const rs: relationalStore.ResultSet = await store.query(predicates, ['id']);
    try {
      while (rs.goToNextRow()) {
        uuids.push(rs.getString(rs.getColumnIndex('id')));
      }
    } finally {
      rs.close();
    }
    return uuids;
  }

  private static async allEventUuids(): Promise<string[]> {
    const store: relationalStore.RdbStore = DataManager.requireStore();
    const predicates: relationalStore.RdbPredicates =
      new relationalStore.RdbPredicates(TABLE_EVENT);
    predicates.isNotNull('id');
    const uuids: string[] = [];
    const rs: relationalStore.ResultSet = await store.query(predicates, ['id']);
    try {
      while (rs.goToNextRow()) {
        uuids.push(rs.getString(rs.getColumnIndex('id')));
      }
    } finally {
      rs.close();
    }
    return uuids;
  }

  // MARK: Writing

  private static async insertChildren(store: relationalStore.RdbStore, workout: Workout,
    events: TempWorkoutEvent[], routeSamples: TempWorkoutRouteDataSample[],
    heartRates: TempWorkoutHeartRateDataSample[]): Promise<void> {
    const workoutId: string = workout.uuid !== null ? workout.uuid : '';
    for (let index: number = 0; index < events.length; index++) {
      const temp: TempWorkoutEvent = events[index];
      const event: WorkoutEvent = new WorkoutEvent();
      event.uuid = temp.uuid !== null ? temp.uuid : newUuid();
      event.eventType = temp.eventType;
      event.startDate = temp.startDate;
      event.endDate = temp.endDate;
      const values: relationalStore.ValuesBucket = {
        'id': event.uuid,
        'workoutId': workoutId,
        'eventType': event.eventType,
        'startDate': millis(event.startDate),
        'endDate': millis(event.endDate),
        'duration': DataModelValueGetters.duration(event),
        'orderIndex': index
      };
      await store.insert(TABLE_WORKOUT_EVENT, values);
      workout.workoutEvents.push(event);
    }
    for (let index: number = 0; index < routeSamples.length; index++) {
      const temp: TempWorkoutRouteDataSample = routeSamples[index];
      const sample: WorkoutRouteDataSample = new WorkoutRouteDataSample();
      sample.uuid = temp.uuid !== null ? temp.uuid : newUuid();
      sample.timestamp = temp.timestamp;
      sample.latitude = temp.latitude;
      sample.longitude = temp.longitude;
      sample.altitude = temp.altitude;
      sample.horizontalAccuracy = temp.horizontalAccuracy;
      sample.verticalAccuracy = temp.verticalAccuracy;
      sample.speed = temp.speed;
      sample.direction = temp.direction;
      const values: relationalStore.ValuesBucket = {
        'id': sample.uuid,
        'workoutId': workoutId,
        'timestamp': millis(sample.timestamp),
        'latitude': sample.latitude,
        'longitude': sample.longitude,
        'altitude': sample.altitude,
        'horizontalAccuracy': sample.horizontalAccuracy,
        'verticalAccuracy': sample.verticalAccuracy,
        'speed': sample.speed,
        'direction': sample.direction,
        'orderIndex': index
      };
      await store.insert(TABLE_ROUTE_SAMPLE, values);
      workout.routeData.push(sample);
    }
    for (let index: number = 0; index < heartRates.length; index++) {
      const temp: TempWorkoutHeartRateDataSample = heartRates[index];
      const sample: WorkoutHeartRateDataSample = new WorkoutHeartRateDataSample();
      sample.uuid = temp.uuid !== null ? temp.uuid : newUuid();
      sample.heartRate = temp.heartRate;
      sample.timestamp = temp.timestamp;
      const values: relationalStore.ValuesBucket = {
        'id': sample.uuid,
        'workoutId': workoutId,
        'heartRate': sample.heartRate,
        'timestamp': millis(sample.timestamp),
        'orderIndex': index
      };
      await store.insert(TABLE_HEART_RATE_SAMPLE, values);
      workout.heartRates.push(sample);
    }
  }

  /** Recomputes the derived columns from the workout's children and writes them back. */
  private static async writeDerivedValues(store: relationalStore.RdbStore,
    workout: Workout): Promise<void> {
    const altitudes: AltitudeGain = DataModelValueGetters.dimensionalAltitudes(workout);
    workout.ascendingAltitude = altitudes.ascending;
    workout.descendingAltitude = altitudes.descending;
    workout.pauseDuration = DataModelValueGetters.pauseDuration(workout);
    workout.activeDuration = DataModelValueGetters.activeDuration(workout);
    workout.dayIdentifier = DataModelValueGetters.dayIdentifier(workout.startDate);
    const values: relationalStore.ValuesBucket = {
      'ascendingAltitude': workout.ascendingAltitude,
      'descendingAltitude': workout.descendingAltitude,
      'pauseDuration': workout.pauseDuration,
      'activeDuration': workout.activeDuration,
      'dayIdentifier': workout.dayIdentifier
    };
    const predicates: relationalStore.RdbPredicates =
      new relationalStore.RdbPredicates(TABLE_WORKOUT);
    predicates.equalTo('id', workout.uuid);
    await store.update(values, predicates);
  }

  // MARK: Save Workout

  /** `saveWorkout(withType:start:end:distance:...)` */
  static async saveWorkout(draft: WorkoutDraft): Promise<Workout | null> {
    if (qaFault('saveFail')) {
      hilog.warn(DOMAIN, TAG, 'QA fault saveFail: the store refuses this save');
      return null;
    }
    try {
      const store: relationalStore.RdbStore = DataManager.requireStore();
      const workout: Workout = new Workout();
      workout.uuid = newUuid();
      workout.workoutType = draft.type as number;
      workout.startDate = draft.startDate;
      workout.endDate = draft.endDate;
      workout.distance = draft.distance;
      workout.steps = draft.steps;
      workout.isRace = draft.isRace;
      workout.isUserModified = draft.isUserModified;
      workout.comment = draft.comment;
      const weight: number | null = UserPreferences.weight.value;
      if (draft.burnedEnergy !== null) {
        workout.burnedEnergy = draft.burnedEnergy;
      } else if (weight !== null) {
        workout.burnedEnergy = burnedKilocalories(draft.type, draft.distance, weight);
      }
      if (draft.healthKitUUID !== null) {
        workout.healthKitUUID = draft.healthKitUUID;
      }
      workout.dayIdentifier = DataModelValueGetters.dayIdentifier(workout.startDate);
      await store.insert(TABLE_WORKOUT, DataManager.workoutValues(workout));
      await DataManager.insertChildren(store, workout, draft.events, draft.routeSamples,
        draft.heartRates);
      await DataManager.writeDerivedValues(store, workout);
      await DataManager.notifyWorkoutsChanged();
      return workout;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to save workout: %{public}s', JSON.stringify(err));
      return null;
    }
  }

  /** `saveWorkout(for hkQueryObject:)` */
  static async saveHealthWorkout(queryObject: HKWorkoutQueryObject): Promise<Workout | null> {
    const workouts: Workout[] = await DataManager.saveHealthWorkouts([queryObject]);
    return workouts.length === 0 ? null : workouts[0];
  }

  /**
   * `saveWorkouts(for hkQueryObjects:)` — maps every field of the query object onto a workout,
   * skipping anything already imported (by its health uuid).
   */
  static async saveHealthWorkouts(queryObjects: HKWorkoutQueryObject[]): Promise<Workout[]> {
    const saved: Workout[] = [];
    try {
      const store: relationalStore.RdbStore = DataManager.requireStore();
      const weight: number | null = UserPreferences.weight.value;
      for (const object of queryObjects) {
        if (await DataManager.hasWorkoutWithHealthUuid(object.hkWorkout)) {
          continue;
        }
        const workout: Workout = new Workout();
        workout.uuid = newUuid();
        workout.workoutType = object.type as number;
        workout.startDate = object.startDate;
        workout.endDate = object.endDate;
        workout.distance = object.distance.converting(Unit.METERS).value;
        workout.steps = object.steps;
        workout.isUserModified = object.isUserEntered;
        workout.healthKitUUID = object.hkWorkout;
        const energy: number | null = object.energyBurned !== null
          ? object.energyBurned.converting(Unit.KILOCALORIES).value : null;
        if (energy !== null) {
          workout.burnedEnergy = energy;
        } else if (weight !== null) {
          workout.burnedEnergy = burnedKilocalories(object.type,
            object.distance.converting(Unit.METERS).value, weight);
        }
        workout.dayIdentifier = DataModelValueGetters.dayIdentifier(workout.startDate);
        await store.insert(TABLE_WORKOUT, DataManager.workoutValues(workout));
        await DataManager.insertChildren(store, workout, object.events, object.locations,
          object.heartRates);
        await DataManager.writeDerivedValues(store, workout);
        saved.push(workout);
      }
      await DataManager.notifyWorkoutsChanged();
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to import health workouts: %{public}s', JSON.stringify(err));
    }
    return saved;
  }

  /** `saveWorkout(tempWorkout:)` */
  static async saveTempWorkout(tempWorkout: TempWorkout): Promise<Workout | null> {
    if (qaFault('saveFail')) {
      hilog.warn(DOMAIN, TAG, 'QA fault saveFail: the store refuses this save');
      return null;
    }
    const workouts: Workout[] = await DataManager.saveWorkouts([tempWorkout]);
    return workouts.length === 0 ? null : workouts[0];
  }

  /**
   * `saveWorkouts(tempWorkouts:)` — the backup import path. Keeps a health reference only when
   * this store already knows it, and hands the rest to the registered health exporter when the
   * user asked for health synchronisation.
   */
  static async saveWorkouts(tempWorkouts: TempWorkout[],
    progress: ((fraction: number) => void) | null = null): Promise<Workout[]> {
    const saved: Workout[] = [];
    const toExport: Workout[] = [];
    const synchronize: boolean = UserPreferences.synchronizeWorkoutsWithAppleHealth.value;
    try {
      const store: relationalStore.RdbStore = DataManager.requireStore();
      if (progress !== null) {
        progress(0);
      }
      for (let index: number = 0; index < tempWorkouts.length; index++) {
        const temp: TempWorkout = tempWorkouts[index];
        const workout: Workout = new Workout();
        workout.uuid = temp.uuid !== null ? temp.uuid : newUuid();
        workout.workoutType = temp.workoutType;
        workout.startDate = temp.startDate;
        workout.endDate = temp.endDate;
        workout.distance = temp.distance;
        workout.steps = temp.steps;
        workout.isRace = temp.isRace;
        workout.isUserModified = temp.isUserModified;
        workout.comment = temp.comment;
        workout.burnedEnergy = temp.burnedEnergy;
        if (temp.healthKitUUID !== null
          && await DataManager.hasWorkoutWithHealthUuid(temp.healthKitUUID)) {
          workout.healthKitUUID = temp.healthKitUUID;
        } else if (synchronize) {
          toExport.push(workout);
        }
        workout.dayIdentifier = DataModelValueGetters.dayIdentifier(workout.startDate);
        await store.insert(TABLE_WORKOUT, DataManager.workoutValues(workout));
        await DataManager.insertChildren(store, workout, temp.workoutEvents, temp.locations,
          temp.heartRates);
        await DataManager.writeDerivedValues(store, workout);
        if (progress !== null) {
          progress((index / tempWorkouts.length) / (synchronize ? 2 : 1));
        }
        saved.push(workout);
      }
      await DataManager.notifyWorkoutsChanged();
      if (synchronize && toExport.length !== 0 && DataManager.healthExporter !== null) {
        await DataManager.healthExporter(toExport);
      }
      if (progress !== null) {
        progress(1);
      }
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to import workouts: %{public}s', JSON.stringify(err));
    }
    return saved;
  }

  // MARK: Alter Workout

  /** `alterWorkout(workout:type:start:end:distance:steps:isRace:comment:weightBeforeWorkout:)` */
  static async alterWorkout(workout: Workout, changes: WorkoutChanges): Promise<Workout | null> {
    try {
      const store: relationalStore.RdbStore = DataManager.requireStore();
      if (changes.type !== null) {
        workout.workoutType = changes.type as number;
      }
      if (changes.startDate !== null) {
        workout.startDate = changes.startDate;
        workout.dayIdentifier = DataModelValueGetters.dayIdentifier(changes.startDate);
      }
      if (changes.endDate !== null) {
        workout.endDate = changes.endDate;
      }
      if (changes.distance !== null) {
        workout.distance = changes.distance;
      }
      if (changes.setSteps) {
        workout.steps = changes.steps;
      }
      if (changes.isRace !== null) {
        workout.isRace = changes.isRace;
      }
      if (changes.setComment) {
        workout.comment = changes.comment;
      }
      if (changes.startDate !== null || changes.endDate !== null || changes.distance !== null
        || changes.setSteps) {
        workout.isUserModified = true;
      }
      if (changes.weightBeforeWorkout !== null && UserPreferences.weight.value !== null) {
        workout.burnedEnergy = burnedKilocalories(workoutTypeFromRaw(workout.workoutType),
          workout.distance, changes.weightBeforeWorkout);
      }
      const predicates: relationalStore.RdbPredicates =
        new relationalStore.RdbPredicates(TABLE_WORKOUT);
      predicates.equalTo('id', workout.uuid);
      await store.update(DataManager.workoutValues(workout), predicates);
      await DataManager.hydrate(workout);
      await DataManager.writeDerivedValues(store, workout);
      workout.cachedStats = null;
      await DataManager.notifyWorkoutsChanged();
      return workout;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to alter workout: %{public}s', JSON.stringify(err));
      return null;
    }
  }

  // MARK: Save Event

  static async saveEvent(tempEvent: TempEvent): Promise<Event | null> {
    const events: Event[] = await DataManager.saveEvents([tempEvent]);
    return events.length === 0 ? null : events[0];
  }

  static async saveEvents(tempEvents: TempEvent[]): Promise<Event[]> {
    const saved: Event[] = [];
    try {
      const store: relationalStore.RdbStore = DataManager.requireStore();
      const existingWorkoutUuids: string[] = await DataManager.allWorkoutUuids();
      for (const temp of tempEvents) {
        const event: Event = new Event();
        event.uuid = temp.uuid !== null ? temp.uuid : newUuid();
        event.title = temp.title;
        event.comment = temp.comment;
        const values: relationalStore.ValuesBucket = {
          'id': event.uuid,
          'eventTitle': event.title,
          'comment': event.comment
        };
        await store.insert(TABLE_EVENT, values);
        for (const workoutUuid of temp.workouts) {
          if (existingWorkoutUuids.indexOf(workoutUuid) === -1) {
            continue;
          }
          const link: relationalStore.ValuesBucket = {
            'eventId': event.uuid,
            'workoutId': workoutUuid
          };
          await store.insert(TABLE_EVENT_WORKOUT, link);
          event.workouts.push(workoutUuid);
        }
        const linked: Workout[] = await DataManager.workoutsOfEvent(event);
        event.startDate = DataModelValueGetters.startDate(linked);
        event.endDate = DataModelValueGetters.endDate(linked);
        saved.push(event);
      }
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to add events: %{public}s', JSON.stringify(err));
    }
    return saved;
  }

  /** The workouts an event links to, in store order. */
  static async workoutsOfEvent(event: Event): Promise<Workout[]> {
    if (event.workouts.length === 0) {
      return [];
    }
    const predicates: relationalStore.RdbPredicates =
      new relationalStore.RdbPredicates(TABLE_WORKOUT);
    predicates.in('id', event.workouts);
    predicates.orderByDesc('startDate');
    return DataManager.loadWorkouts(predicates, false);
  }

  // MARK: Insert Backup Data

  /** `insertUniqueBackupData(tempEvents:tempWorkouts:)` — imports only what is not present yet. */
  static async insertUniqueBackupData(tempEvents: TempEvent[], tempWorkouts: TempWorkout[],
    progress: ((fraction: number) => void) | null = null): Promise<BackupInsertResult> {
    try {
      const existingWorkoutUuids: string[] = await DataManager.allWorkoutUuids();
      const importWorkouts: TempWorkout[] = [];
      for (const temp of tempWorkouts) {
        if (temp.uuid === null || existingWorkoutUuids.indexOf(temp.uuid) !== -1) {
          continue;
        }
        importWorkouts.push(temp);
      }
      const workouts: Workout[] = await DataManager.saveWorkouts(importWorkouts, progress);

      const existingEventUuids: string[] = await DataManager.allEventUuids();
      const importEvents: TempEvent[] = [];
      for (const temp of tempEvents) {
        if (temp.uuid === null || existingEventUuids.indexOf(temp.uuid) !== -1) {
          continue;
        }
        importEvents.push(temp);
      }
      const events: Event[] = await DataManager.saveEvents(importEvents);
      return new BackupInsertResult(true, null, workouts, events);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to insert backup data: %{public}s', JSON.stringify(err));
      return new BackupInsertResult(false, JSON.stringify(err), [], []);
    }
  }

  // MARK: Health reference

  private static async hasWorkoutWithHealthUuid(uuid: string): Promise<boolean> {
    const store: relationalStore.RdbStore = DataManager.requireStore();
    const predicates: relationalStore.RdbPredicates =
      new relationalStore.RdbPredicates(TABLE_WORKOUT);
    predicates.equalTo('healthKitID', uuid);
    const rs: relationalStore.ResultSet = await store.query(predicates, ['id']);
    try {
      return rs.rowCount > 0;
    } finally {
      rs.close();
    }
  }

  static async addHealthKitWorkoutUUID(workout: Workout, uuid: string): Promise<boolean> {
    return DataManager.writeHealthUuid(workout, uuid);
  }

  static async removeHealthKitWorkoutUUID(workout: Workout): Promise<boolean> {
    return DataManager.writeHealthUuid(workout, null);
  }

  private static async writeHealthUuid(workout: Workout, uuid: string | null): Promise<boolean> {
    try {
      const store: relationalStore.RdbStore = DataManager.requireStore();
      const values: relationalStore.ValuesBucket = { 'healthKitID': uuid };
      const predicates: relationalStore.RdbPredicates =
        new relationalStore.RdbPredicates(TABLE_WORKOUT);
      predicates.equalTo('id', workout.uuid);
      const changed: number = await store.update(values, predicates);
      if (changed === 0) {
        return false;
      }
      workout.healthKitUUID = uuid;
      await DataManager.notifyWorkoutsChanged();
      return true;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to write health reference: %{public}s', JSON.stringify(err));
      return false;
    }
  }

  static async removeAllHealthKitWorkoutUUIDs(): Promise<boolean> {
    try {
      const store: relationalStore.RdbStore = DataManager.requireStore();
      const values: relationalStore.ValuesBucket = { 'healthKitID': null };
      const predicates: relationalStore.RdbPredicates =
        new relationalStore.RdbPredicates(TABLE_WORKOUT);
      predicates.isNotNull('healthKitID');
      await store.update(values, predicates);
      await DataManager.notifyWorkoutsChanged();
      return true;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to remove health references: %{public}s', JSON.stringify(err));
      return false;
    }
  }

  static async removeHealthKitReference(uuid: string): Promise<boolean> {
    try {
      const store: relationalStore.RdbStore = DataManager.requireStore();
      const values: relationalStore.ValuesBucket = { 'healthKitID': null };
      const predicates: relationalStore.RdbPredicates =
        new relationalStore.RdbPredicates(TABLE_WORKOUT);
      predicates.equalTo('healthKitID', uuid);
      await store.update(values, predicates);
      await DataManager.notifyWorkoutsChanged();
      return true;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to remove health reference: %{public}s', JSON.stringify(err));
      return false;
    }
  }

  // MARK: Delete

  static async delete(workout: Workout): Promise<boolean> {
    try {
      const store: relationalStore.RdbStore = DataManager.requireStore();
      const uuid: string = workout.uuid !== null ? workout.uuid : '';
      await DataManager.deleteChildren(store, TABLE_ROUTE_SAMPLE, uuid);
      await DataManager.deleteChildren(store, TABLE_HEART_RATE_SAMPLE, uuid);
      await DataManager.deleteChildren(store, TABLE_WORKOUT_EVENT, uuid);
      const links: relationalStore.RdbPredicates =
        new relationalStore.RdbPredicates(TABLE_EVENT_WORKOUT);
      links.equalTo('workoutId', uuid);
      await store.delete(links);
      const predicates: relationalStore.RdbPredicates =
        new relationalStore.RdbPredicates(TABLE_WORKOUT);
      predicates.equalTo('id', uuid);
      await store.delete(predicates);
      await DataManager.notifyWorkoutsChanged();
      return true;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to delete workout: %{public}s', JSON.stringify(err));
      return false;
    }
  }

  private static async deleteChildren(store: relationalStore.RdbStore, table: string,
    workoutUuid: string): Promise<void> {
    const predicates: relationalStore.RdbPredicates = new relationalStore.RdbPredicates(table);
    predicates.equalTo('workoutId', workoutUuid);
    await store.delete(predicates);
  }

  static async deleteAll(): Promise<boolean> {
    try {
      const store: relationalStore.RdbStore = DataManager.requireStore();
      await store.executeSql(`DELETE FROM ${TABLE_ROUTE_SAMPLE}`);
      await store.executeSql(`DELETE FROM ${TABLE_HEART_RATE_SAMPLE}`);
      await store.executeSql(`DELETE FROM ${TABLE_WORKOUT_EVENT}`);
      await store.executeSql(`DELETE FROM ${TABLE_EVENT_WORKOUT}`);
      await store.executeSql(`DELETE FROM ${TABLE_WORKOUT}`);
      await DataManager.notifyWorkoutsChanged();
      return true;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to delete all workouts: %{public}s', JSON.stringify(err));
      return false;
    }
  }

  // MARK: Workout Monitor

  /** What CoreStore did implicitly: the monitored list follows every store mutation. */
  static async notifyWorkoutsChanged(): Promise<void> {
    await DataManager.workoutMonitor.refetch();
  }
}
