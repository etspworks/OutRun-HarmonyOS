/*
 * Port of `WorkoutBuilder` (OutRun/Models/Workout/WorkoutBuilder/WorkoutBuilder.swift:24-552) with
 * the extensions that make up the same class:
 *   WorkoutBuilder+Status.swift        -> model/WorkoutBuilderStatus.ts (already generated)
 *   WorkoutBuilder+AutoPause.swift     -> `AutoPause` below
 *   WorkoutBuilder+LiveUpdates.swift   -> the live-update section below
 *   Components/WorkoutBuilder+AutoPauseDetection.swift -> `AutoPauseDetection`
 *   Components/WorkoutBuilder+LocationManagement.swift -> `LocationManagement`
 *   Components/WorkoutBuilder+StepCounter.swift        -> `StepCounter`
 *   Components/WorkoutBuilder+AltitudeManagement.swift -> `AltitudeManagement`
 * They live in one module because they are one Swift class and the plan declares one target module.
 *
 * CAPABILITY MAPPINGS (Rule 10), each the substitution recorded in the plan:
 *   CLLocationManager  -> @ohos.geoLocationManager `on('locationChange')` with a
 *                         ContinuousLocationRequest in the SPORT scenario, plus a
 *                         BackgroundTasksKit continuous task (BackgroundMode.LOCATION) so fixes keep
 *                         arriving with the screen off. Both are released in `finally`.
 *   CMPedometer        -> SensorId.PEDOMETER. The HarmonyOS sensor reports steps since boot, not
 *                         "since a date", so the component takes a baseline at each start instead.
 *   CMAltimeter        -> SensorId.BAROMETER, relative altitude derived from the first pressure
 *                         reading with the barometric formula (the altimeter gave it directly).
 *   CMMotionActivity   -> NOT AVAILABLE (recorded contractOutOfScope). The source's auto-pause is
 *                         already a speed state machine over GPS speed, so that machine is ported
 *                         verbatim (thresholds below). The accelerometer may only CONFIRM movement
 *                         while a fix carries no measured speed (`speedAccuracy` absent or <= 0);
 *                         it never opens an auto-pause, so missing motion data can never be read
 *                         as standing still.
 *   HealthKit          -> not used here at all; the snapshot goes to DataManager's own store.
 *
 * NOT PORTED: `WorkoutBuilder+Termination.swift` (three UserPreference keys for crash recovery) —
 * it is a separate source file outside this module's contract and has no reader in this batch.
 */
import { geoLocationManager } from '@kit.LocationKit';
import { sensor } from '@kit.SensorServiceKit';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';
import { common, wantAgent, Want, WantAgent } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { TempWorkout } from '../model/TempWorkout';
import { TempWorkoutEvent } from '../model/TempWorkoutEvent';
import { TempWorkoutRouteDataSample } from '../model/TempWorkoutRouteDataSample';
import { WorkoutEventType } from '../model/WorkoutEventType';
import { WorkoutType, workoutTypeFromRaw } from '../model/WorkoutType';
import { TimeRange } from '../model/Workout';
import { ApplicationState } from '../model/ApplicationState';
import {
  WorkoutBuilderStatus,
  workoutBuilderStatusIsActive,
  workoutBuilderStatusIsPaused
} from '../model/WorkoutBuilderStatus';
import { ApplicationStateObserver, startObservingApplicationState, stopObservingApplicationState }
  from './ApplicationStateObservation';
import { BurnedEnergyCalculator } from './BurnedEnergyCalculator';
import { Dimension, Measurement, Unit, standardUnit } from './Measurement';
import { RelativeMeasurement } from '../model/RelativeMeasurement';
import { BoolPreference, OptionalStringPreference, UserPreferences } from './UserPreferences';
import { qaFault } from './QaHooks';
import { WorkoutCompletionActionHandler, WorkoutContinuable }
  from './WorkoutCompletionActionHandler';

const DOMAIN: number = 0x0001;
const TAG: string = 'WorkoutBuilder';
/** How often an active builder refreshes its termination snapshot (see `termWorkoutData`). */
const SNAPSHOT_INTERVAL_MS: number = 15000;

/** Source: the `0.5` / `0.25` m/s thresholds and the `3` s / `10` s windows in AutoPauseDetection. */
const AUTO_PAUSE_RESUME_SPEED: number = 0.5;
const AUTO_PAUSE_START_SPEED: number = 0.25;
const AUTO_PAUSE_MIN_SECONDS: number = 3;
const AUTO_PAUSE_STALE_SECONDS: number = 10;

/*
 * Accelerometer stand-in for a missing GPS speed. It may only ever CONFIRM movement: a device
 * beyond this band around gravity is definitely moving, but one inside it is NOT necessarily still
 * (a phone riding in a waist belt while its owner walks reads ~9.81 too), so stillness is never
 * inferred from it. The band is the knob worth tuning per device.
 * ponytail: fixed band, per-device calibration if a real device reads outside it.
 */
const GRAVITY: number = 9.81;
const MOTION_STILL_BAND: number = 0.35;
/** Accelerometer sampling period in nanoseconds — five readings a second is plenty for this. */
const MOTION_SAMPLE_INTERVAL_NS: number = 200000000;
/** The pseudo-speed fed to the state machine once the accelerometer has confirmed movement. */
const MOTION_MOVING_SPEED: number = 1.0;
/**
 * `CLLocation.speed` is -1 when iOS did not measure it, and the source's `speed >= 0` guard is that
 * validity test. `geoLocationManager.Location.speed` has no sentinel (an unmeasured speed arrives
 * as 0), so `measuredSpeed` maps HarmonyOS's answer back onto the source's own sentinel.
 */
const NO_MEASURED_SPEED: number = -1;

/** Location report interval in seconds — the source recorded every fix CoreLocation produced. */
const LOCATION_INTERVAL_SECONDS: number = 1;
/** Source: `averageAccuracy` floor and the `< 100 m` hard reject in `checkForAppropriateAccuracy`. */
const MIN_DESIRED_ACCURACY: number = 20;
const MAX_ACCEPTABLE_ACCURACY: number = 100;
/** The source's sentinel for "do not check accuracy at all" in `UserPreferences.gpsAccuracy`. */
const GPS_ACCURACY_DISABLED: number = -1;

/** Barometric formula constants, standard atmosphere. */
const SEA_LEVEL_FACTOR: number = 44330;
const BAROMETRIC_EXPONENT: number = 1 / 5.255;

/**
 * Source: `WorkoutBuilder.AutoPause` (WorkoutBuilder+AutoPause.swift:24-128).
 * The source's `init?` returned nil when start >= end; `create` returns null for the same case.
 */
export class AutoPause {
  readonly startDate: Date;
  readonly endDate: Date;

  private constructor(startDate: Date, endDate: Date) {
    this.startDate = startDate;
    this.endDate = endDate;
  }

  /** Source: `init?(start:end:)`. */
  static create(start: Date, end: Date): AutoPause | null {
    if (start.getTime() >= end.getTime()) {
      return null;
    }
    return new AutoPause(start, end);
  }

  /** Source: `merge(with:)`. */
  merge(other: AutoPause): AutoPause {
    const start: Date = this.startDate.getTime() < other.startDate.getTime()
      ? this.startDate : other.startDate;
    const end: Date = this.endDate.getTime() > other.endDate.getTime()
      ? this.endDate : other.endDate;
    const merged: AutoPause | null = AutoPause.create(start, end);
    return merged !== null ? merged : this;
  }

  /** Source: `asWorkoutEvents()`. */
  asWorkoutEvents(): TempWorkoutEvent[] {
    return [
      TempWorkoutEvent.atDate(WorkoutEventType.AUTO_PAUSE, this.startDate),
      TempWorkoutEvent.atDate(WorkoutEventType.AUTO_RESUME, this.endDate)
    ];
  }

  /**
   * Source: `asRange(from:)`. The source built `startInterval...endInterval` from
   * `Date.distance(to:)`, which for a reference date earlier than the pause yields a LOWER bound
   * above the upper one — a range Swift traps on. The intervals are kept, ordered low-to-high, so
   * the length and the containment test below mean what the source intended.
   */
  asRange(from: Date): TimeRange {
    return intervalRange(secondsBetween(this.startDate, from), secondsBetween(this.endDate, from));
  }

  /** Source: `convertToEvents(with:)` — flattened and sorted by start date. */
  static convertToEvents(pauses: AutoPause[]): TempWorkoutEvent[] {
    const events: TempWorkoutEvent[] = [];
    for (const pause of pauses) {
      for (const event of pause.asWorkoutEvents()) {
        events.push(event);
      }
    }
    events.sort((a: TempWorkoutEvent, b: TempWorkoutEvent): number =>
      a.startDate.getTime() - b.startDate.getTime());
    return events;
  }
}

/** Swift's `Date.distance(to:)` — seconds from `from` to `to`, signed. */
function secondsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 1000;
}

function intervalRange(a: number, b: number): TimeRange {
  return a <= b ? new TimeRange(a, b) : new TimeRange(b, a);
}

function rangeLength(range: TimeRange): number {
  return range.end - range.start;
}

/**
 * Source: `WorkoutBuilderDelegate` (OutRun/Protocols/WorkoutBuilder/WorkoutBuilderDelegate.swift).
 * The protocol had an empty default for every method so a view controller could adopt a subset;
 * an ArkTS interface has no defaults and an ArkUI struct cannot implement one, so the delegate is
 * a holder of optional callbacks the record page assigns. Unset callbacks are simply not called —
 * exactly what the source's empty defaults did.
 */
export class WorkoutBuilderDelegate {
  onDistanceUpdate: ((distance: Measurement) => void) | null = null;
  onDurationUpdate: ((duration: Measurement) => void) | null = null;
  onSpeedUpdate: ((speed: Measurement, rolling: boolean) => void) | null = null;
  onEnergyUpdate: ((energy: Measurement) => void) | null = null;
  onPaceUpdate: ((pace: RelativeMeasurement, rolling: boolean) => void) | null = null;
  onStatusUpdate: ((status: WorkoutBuilderStatus) => void) | null = null;
  onRouteDataUpdate: ((locations: geoLocationManager.Location[]) => void) | null = null;
  onCurrentLocationUpdate:
    ((location: geoLocationManager.Location, force: boolean) => void) | null = null;
  onUiUpdatesSuspended: ((suspended: boolean) => void) | null = null;
  onInsufficientLocationPermission: (() => void) | null = null;

  /** Source: `resetAll()` — zero every displayed value in the unit the source used. */
  resetAll(): void {
    if (this.onDistanceUpdate !== null) {
      this.onDistanceUpdate(new Measurement(0, Unit.METERS));
    }
    if (this.onDurationUpdate !== null) {
      this.onDurationUpdate(new Measurement(0, Unit.SECONDS));
    }
    const rolling: boolean = UserPreferences.displayRollingSpeed.value;
    if (this.onSpeedUpdate !== null) {
      this.onSpeedUpdate(new Measurement(0, Unit.METERS_PER_SECOND), rolling);
    }
    if (this.onEnergyUpdate !== null) {
      this.onEnergyUpdate(new Measurement(0, Unit.KILOCALORIES));
    }
    if (this.onPaceUpdate !== null) {
      this.onPaceUpdate(
        RelativeMeasurement.of(0, Unit.MINUTES, UserPreferences.distanceMeasurementType.safeValue),
        rolling);
    }
  }
}

/** Source: `WorkoutBuilderComponent` (OutRun/Protocols/WorkoutBuilder/WorkoutBuilderComponent.swift). */
export interface WorkoutBuilderComponent {
  builder: WorkoutBuilder | null;
  isReady: boolean;

  statusChanged(oldStatus: WorkoutBuilderStatus, newStatus: WorkoutBuilderStatus,
    timestamp: Date): void;

  continueWorkout(snapshot: TempWorkout, timestamp: Date): void;

  reset(): void;
}

/**
 * Source: `WorkoutBuilder.AutoPauseDetection`
 * (Components/WorkoutBuilder+AutoPauseDetection.swift:26-262).
 *
 * The state machine is the source's, unchanged: below 0.25 m/s opens a predicted pause, at or above
 * 0.5 m/s closes it, a pause shorter than 3 s is discarded, a new pause within 3 s of the last one
 * re-opens it, and a prediction left stale for 10 s while detection is disabled is dropped.
 * `noteAcceleration` is the added half: HarmonyOS has no "speed not measured" sentinel, and the
 * source never had to handle that because CoreLocation signalled it with -1. The accelerometer may
 * only CONFIRM movement while the speed is unmeasured; it never opens an auto-pause, because
 * "the device is not accelerating" is not the same claim as "the wearer is standing still".
 */
export class AutoPauseDetection implements WorkoutBuilderComponent {
  builder: WorkoutBuilder | null = null;
  isReady: boolean = true;

  private isManuallyPaused: boolean = false;
  private detectedAutoPauses: AutoPause[] = [];
  private lastSpeed: number | null = null;
  private currentPredictedStartDate: Date | null = null;
  /** Latest accelerometer magnitude, used only while the GPS speed is invalid. */
  private lastMotionMagnitude: number | null = null;
  /** False once `sensor.on(ACCELEROMETER)` has failed — then there is no movement evidence at all. */
  private motionAvailable: boolean = true;

  /** Source: `update(timestamp:workoutType:speed:)`. */
  update(timestamp: Date, workoutType: WorkoutType, speed: number): void {
    const effectiveSpeed: number = this.resolveSpeed(speed);
    const builder: WorkoutBuilder | null = this.builder;
    const detectionAllowed: boolean = !this.isManuallyPaused && effectiveSpeed >= 0
      && workoutType !== WorkoutType.WALKING && workoutType !== WorkoutType.HIKING
      && builder !== null && workoutBuilderStatusIsActive(builder.status);

    if (!detectionAllowed) {
      const predicted: Date | null = this.currentPredictedStartDate;
      if (predicted !== null && secondsBetween(predicted, timestamp) > AUTO_PAUSE_STALE_SECONDS) {
        this.setPredictedStartDate(null);
      }
      return;
    }

    const predictedStartDate: Date | null = this.currentPredictedStartDate;
    if (predictedStartDate !== null) {
      // looking for the end date
      if (effectiveSpeed >= AUTO_PAUSE_RESUME_SPEED) {
        if (secondsBetween(predictedStartDate, timestamp) >= AUTO_PAUSE_MIN_SECONDS) {
          const autoPause: AutoPause | null = AutoPause.create(predictedStartDate, timestamp);
          if (autoPause !== null) {
            this.detectedAutoPauses.push(autoPause);
          }
        }
        this.setPredictedStartDate(null);
      }
    } else if (effectiveSpeed <= AUTO_PAUSE_START_SPEED) {
      // looking for the start date
      const lastPause: AutoPause | null = this.detectedAutoPauses.length > 0
        ? this.detectedAutoPauses[this.detectedAutoPauses.length - 1] : null;
      if (lastPause !== null
        && secondsBetween(lastPause.endDate, timestamp) < AUTO_PAUSE_MIN_SECONDS) {
        this.detectedAutoPauses.pop();
        this.setPredictedStartDate(lastPause.startDate);
      } else {
        this.setPredictedStartDate(timestamp);
      }
    }

    this.lastSpeed = effectiveSpeed;
  }

  /**
   * The CMMotionActivityManager substitution: the builder feeds accelerometer magnitudes in while
   * recording, and they are consulted ONLY when the OS hands over a fix with no speed.
   */
  noteAcceleration(x: number, y: number, z: number): void {
    this.lastMotionMagnitude = Math.sqrt(x * x + y * y + z * z);
  }

  /** The builder reports whether the accelerometer subscription actually came up. */
  setMotionAvailable(available: boolean): void {
    this.motionAvailable = available;
    if (!available) {
      this.lastMotionMagnitude = null;
    }
  }

  private resolveSpeed(speed: number): number {
    if (speed >= 0) {
      return speed;
    }
    /*
     * No measured speed. Missing motion data is not evidence of standing still, so an unavailable
     * or not-yet-reporting accelerometer leaves the speed invalid and the source's own
     * `speed >= 0` guard stands the detection down — exactly as it does for CLLocation.speed == -1.
     */
    const magnitude: number | null = this.lastMotionMagnitude;
    if (!this.motionAvailable || magnitude === null) {
      return speed;
    }
    return Math.abs(magnitude - GRAVITY) >= MOTION_STILL_BAND ? MOTION_MOVING_SPEED : speed;
  }

  /** Source: `finish(with:)`. */
  finish(timestamp: Date): AutoPause[] {
    const pauses: AutoPause[] = this.getAutoPauses(timestamp);
    this.reset();
    return pauses;
  }

  /** Source: `setup(from:endDate:timestamp:)` — continue an auto-pause across a finish/continue. */
  setup(autoPauses: AutoPause[], endDate: Date, timestamp: Date): void {
    const pauses: AutoPause[] = [];
    for (const pause of autoPauses) {
      pauses.push(pause);
    }
    const last: AutoPause | null = pauses.length > 0 ? pauses[pauses.length - 1] : null;
    if (last !== null && last.endDate.getTime() === endDate.getTime()) {
      pauses.pop();
      const extended: AutoPause | null = AutoPause.create(last.startDate, timestamp);
      if (extended !== null) {
        pauses.push(extended);
      }
    }
    this.detectedAutoPauses = pauses;
  }

  /** Source: `getAutoPauses(with:)` — closes an ongoing pause without stopping detection. */
  getAutoPauses(endDate: Date): AutoPause[] {
    const pauses: AutoPause[] = [];
    for (const pause of this.detectedAutoPauses) {
      pauses.push(pause);
    }
    const predicted: Date | null = this.currentPredictedStartDate;
    if (predicted !== null && secondsBetween(predicted, endDate) > AUTO_PAUSE_MIN_SECONDS) {
      const autoPause: AutoPause | null = AutoPause.create(predicted, endDate);
      if (autoPause !== null) {
        pauses.push(autoPause);
      }
    }
    return pauses;
  }

  /** Source: `getPauseRanges(with:)`. */
  getPauseRanges(date: Date): TimeRange[] {
    const ranges: TimeRange[] = [];
    for (const pause of this.detectedAutoPauses) {
      ranges.push(pause.asRange(date));
    }
    const predicted: Date | null = this.currentPredictedStartDate;
    if (predicted !== null) {
      ranges.push(intervalRange(secondsBetween(predicted, date), secondsBetween(date, new Date())));
    }
    return ranges;
  }

  /**
   * Source: the `willSet` on `currentPredictedStartDate` — opening a prediction suggests
   * `autoPaused`, closing one suggests `recording`. ArkTS has no property observer, so every write
   * goes through here.
   */
  private setPredictedStartDate(newValue: Date | null): void {
    const builder: WorkoutBuilder | null = this.builder;
    if (!this.isManuallyPaused && builder !== null
      && workoutBuilderStatusIsActive(builder.status)) {
      const newStatus: WorkoutBuilderStatus = newValue === null
        ? WorkoutBuilderStatus.RECORDING : WorkoutBuilderStatus.AUTO_PAUSED;
      builder.suggestNewStatus(newStatus, (isValid: boolean): void => {
        if (!isValid) {
          hilog.warn(DOMAIN, TAG,
            'invalid auto-pause status transition suggested: %{public}s -> %{public}s',
            builder.status, newStatus);
        }
      });
    }
    this.currentPredictedStartDate = newValue;
  }

  /** Source: `statusChanged(from:to:timestamp:)`. */
  statusChanged(oldStatus: WorkoutBuilderStatus, newStatus: WorkoutBuilderStatus,
    timestamp: Date): void {
    if (newStatus === WorkoutBuilderStatus.PAUSED || newStatus === WorkoutBuilderStatus.RECORDING) {
      this.isManuallyPaused = newStatus === WorkoutBuilderStatus.PAUSED;
      const predicted: Date | null = this.currentPredictedStartDate;
      if (this.isManuallyPaused && predicted !== null) {
        const endDate: Date = new Date(timestamp.getTime() - 10);
        const autoPause: AutoPause | null = AutoPause.create(predicted, endDate);
        if (autoPause !== null) {
          this.detectedAutoPauses.push(autoPause);
        }
        this.currentPredictedStartDate = null;
      }
    }
  }

  /** Source: `continueWorkout(from:timestamp:)` — old pauses are already in the workout data. */
  continueWorkout(snapshot: TempWorkout, timestamp: Date): void {
    this.reset();
  }

  /** Source: `reset()`. */
  reset(): void {
    this.detectedAutoPauses = [];
    this.lastSpeed = null;
    this.currentPredictedStartDate = null;
    this.isManuallyPaused = false;
    this.lastMotionMagnitude = null;
  }
}

/**
 * Source: `WorkoutBuilder.LocationManagement`
 * (Components/WorkoutBuilder+LocationManagement.swift:26-265).
 *
 * The CLLocationManagerDelegate callback becomes the `locationChange` subscription's callback, and
 * `allowsBackgroundLocationUpdates` becomes the builder's continuous task. Everything about which
 * fixes count — the adaptive desired accuracy, the 100 m hard reject, distance accumulation only
 * while not paused, readiness from "at least one accurate fix" — is the source's logic.
 */
export class LocationManagement implements WorkoutBuilderComponent {
  builder: WorkoutBuilder | null = null;

  private locationList: geoLocationManager.Location[] = [];
  private distanceMeters: number = 0;
  private shouldRecord: boolean = false;
  private desiredAccuracy: number | null = null;
  private averageAccuracy: number = 0;
  private ready: boolean = false;
  private subscribed: boolean = false;
  private readonly callback: (location: geoLocationManager.Location) => void;

  constructor() {
    // Source: `init()` — gpsAccuracy of -1 means "do not filter", anything else is the floor.
    const configured: number | null = UserPreferences.gpsAccuracy.value;
    if (configured !== GPS_ACCURACY_DISABLED) {
      this.desiredAccuracy = configured !== null ? configured : MIN_DESIRED_ACCURACY;
    }
    this.callback = (location: geoLocationManager.Location): void => {
      this.didUpdateLocations([location]);
    };
    this.startLocationUpdates();
  }

  /** Source: `locations`. */
  get locations(): geoLocationManager.Location[] {
    return this.locationList;
  }

  /** Source: `distance` in meters. */
  get distance(): number {
    return this.distanceMeters;
  }

  /** Source: `isReady` — its `didSet` told the builder to re-evaluate readiness. */
  get isReady(): boolean {
    return this.ready;
  }

  set isReady(newValue: boolean) {
    this.ready = newValue;
    const builder: WorkoutBuilder | null = this.builder;
    if (builder !== null) {
      builder.notifyOfReadinessChange();
    }
  }

  /** Source: `startLocationUpdates()`. */
  startLocationUpdates(): void {
    if (this.subscribed) {
      return;
    }
    const request: geoLocationManager.ContinuousLocationRequest = {
      interval: LOCATION_INTERVAL_SECONDS,
      locationScenario: geoLocationManager.UserActivityScenario.SPORT
    };
    try {
      geoLocationManager.on('locationChange', request, this.callback);
      this.subscribed = true;
      /*
       * The happy path has to be observable: without this the whole recording lifecycle is silent
       * in hilog (only the error branches logged), so an armed recorder is indistinguishable from a
       * dead one on device.
       */
      hilog.info(DOMAIN, TAG, 'locationChange subscribed via geoLocationManager, interval=%{public}s s',
        `${LOCATION_INTERVAL_SECONDS}`);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'location updates could not start: %{public}s', JSON.stringify(err));
      const builder: WorkoutBuilder | null = this.builder;
      if (builder !== null) {
        builder.notifyOfInsufficientLocationPermission();
      }
    }
  }

  /** Source: `stopLocationUpdates()`. */
  stopLocationUpdates(): void {
    if (!this.subscribed) {
      return;
    }
    try {
      geoLocationManager.off('locationChange', this.callback);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'location updates could not stop: %{public}s', JSON.stringify(err));
    } finally {
      this.subscribed = false;
    }
  }

  /** Source: `locationManager(_:didUpdateLocations:)`. */
  private didUpdateLocations(locations: geoLocationManager.Location[]): void {
    this.updateDesiredAccuracy(locations);
    const builder: WorkoutBuilder | null = this.builder;

    if (this.shouldRecord) {
      for (const location of locations) {
        if (!this.checkForAppropriateAccuracy(location)) {
          continue;
        }
        const lastLocation: geoLocationManager.Location | null = this.locationList.length > 0
          ? this.locationList[this.locationList.length - 1] : null;
        if (lastLocation === null) {
          this.appendLocation(location);
          continue;
        }
        const tempDistance: number = metersBetween(lastLocation, location);
        if (builder !== null && !workoutBuilderStatusIsPaused(builder.status)) {
          this.distanceMeters = this.distanceMeters + tempDistance;
          builder.notifyOfDistanceUpdate();
        }
        this.appendLocation(location);
      }
    } else {
      const lastReceived: geoLocationManager.Location | null = locations.length > 0
        ? locations[locations.length - 1] : null;
      if (lastReceived !== null && builder !== null) {
        builder.notifyOfLocationUpdate(lastReceived);
      }
      let hasAppropriate: boolean = false;
      for (const location of locations) {
        if (this.checkForAppropriateAccuracy(location)) {
          hasAppropriate = true;
        }
      }
      if (this.ready !== hasAppropriate) {
        this.isReady = hasAppropriate;
      }
    }
  }

  /** Source: the `didSet` on `locations` — every append notifies the builder. */
  private appendLocation(location: geoLocationManager.Location): void {
    this.locationList.push(location);
    const builder: WorkoutBuilder | null = this.builder;
    if (builder !== null) {
      builder.notifyOfLocationUpdate(location);
    }
  }

  /** Source: `checkForAppropriateAccuracy(_:)`. */
  private checkForAppropriateAccuracy(location: geoLocationManager.Location): boolean {
    const desired: number | null = this.desiredAccuracy;
    if (desired === null) {
      return true;
    }
    return location.accuracy < MAX_ACCEPTABLE_ACCURACY && location.accuracy <= desired;
  }

  /** Source: `updateDesiredAccuracy(from:)` — rounded UP to the next 10 m, floored at 20 m. */
  private updateDesiredAccuracy(locations: geoLocationManager.Location[]): void {
    if (UserPreferences.gpsAccuracy.value !== null || locations.length === 0) {
      return;
    }
    let batchAverage: number = 0;
    for (let index: number = 0; index < locations.length; index++) {
      batchAverage = (batchAverage * index + locations[index].accuracy) / (index + 1);
    }
    const globalCount: number = this.locationList.length < 10 ? this.locationList.length : 9;
    const localCount: number = locations.length;
    this.averageAccuracy =
      (this.averageAccuracy * globalCount + batchAverage * localCount) / (globalCount + localCount);
    this.desiredAccuracy = batchAverage < MIN_DESIRED_ACCURACY
      ? MIN_DESIRED_ACCURACY : Math.ceil(this.averageAccuracy / 10) * 10;
  }

  /** Source: `statusChanged(from:to:timestamp:)`. */
  statusChanged(oldStatus: WorkoutBuilderStatus, newStatus: WorkoutBuilderStatus,
    timestamp: Date): void {
    this.shouldRecord = workoutBuilderStatusIsActive(newStatus);
  }

  /** Source: `continueWorkout(from:timestamp:)`. */
  continueWorkout(snapshot: TempWorkout, timestamp: Date): void {
    this.locationList = [];
    for (const sample of snapshot.locations) {
      this.locationList.push(locationFromSample(sample));
    }
    this.distanceMeters = snapshot.distance;
    this.shouldRecord = true;
    this.startLocationUpdates();
  }

  /** Source: `reset()`. */
  reset(): void {
    this.locationList = [];
    this.distanceMeters = 0;
    this.shouldRecord = false;
    this.startLocationUpdates();
  }
}

/** Great-circle distance in meters — `CLLocation.distance(from:)`. */
function metersBetween(a: geoLocationManager.Location, b: geoLocationManager.Location): number {
  const earthRadius: number = 6371000;
  const toRadians: number = Math.PI / 180;
  const lat1: number = a.latitude * toRadians;
  const lat2: number = b.latitude * toRadians;
  const deltaLat: number = lat2 - lat1;
  const deltaLon: number = (b.longitude - a.longitude) * toRadians;
  const h: number = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The source's speed-validity test, ported honestly. iOS hands over `CLLocation.speed == -1` when
 * it did not measure the speed and the source rejects that with `speed >= 0`; HarmonyOS has no such
 * sentinel — an unmeasured speed arrives as 0, which the state machine would read as "standing
 * still". `speedAccuracy` (API 12+) absent or non-positive is how the platform says the fix carries
 * no measured speed, so those fixes get the source's sentinel back.
 */
export function measuredSpeed(location: geoLocationManager.Location): number {
  const accuracy: number | undefined = location.speedAccuracy;
  if (accuracy === undefined || accuracy <= 0) {
    return NO_MEASURED_SPEED;
  }
  return location.speed;
}

/** The reverse of `TempWorkoutRouteDataSample.fromLocation`, for continuing a workout. */
function locationFromSample(sample: TempWorkoutRouteDataSample): geoLocationManager.Location {
  const location: geoLocationManager.Location = {
    latitude: sample.latitude,
    longitude: sample.longitude,
    altitude: sample.altitude,
    accuracy: sample.horizontalAccuracy,
    speed: sample.speed,
    timeStamp: sample.timestamp.getTime(),
    direction: sample.direction,
    timeSinceBoot: 0,
    altitudeAccuracy: sample.verticalAccuracy,
    speedAccuracy: 0,
    directionAccuracy: 0,
    uncertaintyOfTimeSinceBoot: 0,
    sourceType: geoLocationManager.LocationSourceType.GNSS
  };
  return location;
}

/**
 * Source: `WorkoutBuilder.StepCounter` (Components/WorkoutBuilder+StepCounter.swift:27-140).
 * `CMPedometer.startUpdates(from:)` counted from a date; SensorId.PEDOMETER reports a since-boot
 * total, so the first reading after each start becomes the baseline and the source's
 * `stepsBeforeLastPause` carry-over is applied on top of it exactly as before.
 */
export class StepCounter implements WorkoutBuilderComponent {
  builder: WorkoutBuilder | null = null;
  isReady: boolean = true;

  private stepCount: number | null = null;
  private stepsBeforeLastPause: number | null = null;
  private shouldRecord: boolean = false;
  private baseline: number | null = null;
  private subscribed: boolean = false;
  private readonly callback: (response: sensor.PedometerResponse) => void;

  constructor() {
    this.callback = (response: sensor.PedometerResponse): void => {
      if (!this.shouldRecord) {
        this.stepsBeforeLastPause = this.stepCount;
        this.stopUpdating();
        return;
      }
      if (this.baseline === null) {
        this.baseline = response.steps;
      }
      const sinceStart: number = response.steps - this.baseline;
      const previous: number | null = this.stepsBeforeLastPause;
      this.stepCount = previous !== null ? sinceStart + previous : sinceStart;
    };
  }

  /** Source: `steps`. */
  get steps(): number | null {
    return this.stepCount;
  }

  /** Source: `isDataAvailable` — `CMPedometer.isStepCountingAvailable()`. */
  async isDataAvailable(): Promise<boolean> {
    try {
      await sensor.getSingleSensor(sensor.SensorId.PEDOMETER);
      return true;
    } catch (err) {
      hilog.info(DOMAIN, TAG, 'no pedometer on this device: %{public}s', JSON.stringify(err));
      return false;
    }
  }

  /** Source: `startUpdating(from:)`. */
  private startUpdating(): void {
    if (this.subscribed) {
      return;
    }
    this.baseline = null;
    try {
      sensor.on(sensor.SensorId.PEDOMETER, this.callback);
      this.subscribed = true;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'step counting unavailable: %{public}s', JSON.stringify(err));
    }
  }

  /** Source: `pedometer.stopUpdates()`. */
  private stopUpdating(): void {
    if (!this.subscribed) {
      return;
    }
    try {
      sensor.off(sensor.SensorId.PEDOMETER, this.callback);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'step counting could not stop: %{public}s', JSON.stringify(err));
    } finally {
      this.subscribed = false;
    }
  }

  /** Source: `statusChanged(from:to:timestamp:)`. */
  statusChanged(oldStatus: WorkoutBuilderStatus, newStatus: WorkoutBuilderStatus,
    timestamp: Date): void {
    if (newStatus === WorkoutBuilderStatus.RECORDING) {
      this.shouldRecord = true;
      this.startUpdating();
    } else {
      this.shouldRecord = false;
    }
  }

  /** Source: `continueWorkout(from:timestamp:)`. */
  continueWorkout(snapshot: TempWorkout, timestamp: Date): void {
    this.stepCount = snapshot.steps;
    this.stepsBeforeLastPause = snapshot.steps;
    this.shouldRecord = true;
    this.startUpdating();
  }

  /** Source: `reset()`. */
  reset(): void {
    this.stopUpdating();
    this.stepCount = null;
    this.stepsBeforeLastPause = null;
    this.shouldRecord = false;
    this.baseline = null;
  }
}

/** One barometer reading, reduced to what the source's altimeter handed over. */
class AltitudeDataPoint {
  readonly timestamp: Date;
  readonly relativeAltitude: number;

  constructor(timestamp: Date, relativeAltitude: number) {
    this.timestamp = timestamp;
    this.relativeAltitude = relativeAltitude;
  }
}

/**
 * Source: `WorkoutBuilder.AltitudeManagement`
 * (Components/WorkoutBuilder+AltitudeManagement.swift:26-198).
 *
 * `CMAltimeter` reported relative altitude directly; the barometer reports pressure, so the first
 * reading of a recording is the reference and every later one is converted with the barometric
 * formula. `refine` keeps the source's two passes (average original altitude, then replacement) but
 * returns the route SAMPLES rather than rebuilt `Location` objects — the only caller is
 * `createSnapshot`, which needed samples anyway, and a HarmonyOS `Location` cannot be copied with
 * one field changed the way `CLLocation.replacing(altitude:)` did.
 */
export class AltitudeManagement implements WorkoutBuilderComponent {
  builder: WorkoutBuilder | null = null;
  isReady: boolean = true;

  private altitudeData: AltitudeDataPoint[] = [];
  private referencePressure: number | null = null;
  private subscribed: boolean = false;
  private readonly callback: (response: sensor.BarometerResponse) => void;

  constructor() {
    this.callback = (response: sensor.BarometerResponse): void => {
      if (this.referencePressure === null) {
        this.referencePressure = response.pressure;
        return;
      }
      this.altitudeData.push(new AltitudeDataPoint(new Date(),
        relativeAltitude(this.referencePressure, response.pressure)));
    };
  }

  /** Source: `isDataAvailable` — `CMAltimeter.isRelativeAltitudeAvailable()`. */
  async isDataAvailable(): Promise<boolean> {
    try {
      await sensor.getSingleSensor(sensor.SensorId.BAROMETER);
      return true;
    } catch (err) {
      hilog.info(DOMAIN, TAG, 'no barometer on this device: %{public}s', JSON.stringify(err));
      return false;
    }
  }

  /** Source: `refine(locations:)`. */
  refine(locations: geoLocationManager.Location[]): TempWorkoutRouteDataSample[] {
    const samples: TempWorkoutRouteDataSample[] = [];
    if (this.altitudeData.length === 0 || locations.length === 0) {
      for (const location of locations) {
        samples.push(TempWorkoutRouteDataSample.fromLocation(location));
      }
      return samples;
    }

    // determining the average original altitude
    let averageCount: number = 0;
    let averageOriginalAltitude: number = 0;
    for (const location of locations) {
      const relative: number | null = this.relativeAltitudeAt(new Date(location.timeStamp));
      if (relative !== null) {
        const originalAltitude: number = location.altitude - relative;
        averageOriginalAltitude =
          (averageCount * averageOriginalAltitude + originalAltitude) / (averageCount + 1);
        averageCount += 1;
      }
    }

    // refining
    for (const location of locations) {
      const sample: TempWorkoutRouteDataSample = TempWorkoutRouteDataSample.fromLocation(location);
      const relative: number | null = this.relativeAltitudeAt(new Date(location.timeStamp));
      if (relative === null) {
        samples.push(sample);
        continue;
      }
      const newAltitude: number = averageOriginalAltitude + relative;
      if (!Number.isFinite(newAltitude)) {
        samples.push(sample);
        continue;
      }
      samples.push(new TempWorkoutRouteDataSample(sample.uuid, sample.timestamp, sample.latitude,
        sample.longitude, newAltitude, sample.horizontalAccuracy, sample.verticalAccuracy,
        sample.speed, sample.direction));
    }
    return samples;
  }

  /** Source: `relativeAltitude(for:)` — the data point whose window contains the date. */
  private relativeAltitudeAt(date: Date): number | null {
    const target: number = date.getTime();
    for (let index: number = 0; index < this.altitudeData.length; index++) {
      const point: AltitudeDataPoint = this.altitudeData[index];
      if (index + 1 < this.altitudeData.length) {
        const next: AltitudeDataPoint = this.altitudeData[index + 1];
        if (point.timestamp.getTime() < target && next.timestamp.getTime() > target) {
          return point.relativeAltitude;
        }
      } else if (point.timestamp.getTime() < target) {
        return point.relativeAltitude;
      }
    }
    return null;
  }

  /** Source: `startUpdating()`. */
  private startUpdating(): void {
    this.reset();
    if (this.subscribed) {
      return;
    }
    try {
      sensor.on(sensor.SensorId.BAROMETER, this.callback);
      this.subscribed = true;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'altitude updates unavailable: %{public}s', JSON.stringify(err));
    }
  }

  /** Source: `statusChanged(from:to:timestamp:)`. */
  statusChanged(oldStatus: WorkoutBuilderStatus, newStatus: WorkoutBuilderStatus,
    timestamp: Date): void {
    if (workoutBuilderStatusIsActive(newStatus) && !workoutBuilderStatusIsActive(oldStatus)) {
      this.startUpdating();
    }
  }

  /** Source: `continueWorkout(from:timestamp:)` — stored locations are already refined. */
  continueWorkout(snapshot: TempWorkout, timestamp: Date): void {
    this.startUpdating();
  }

  /** Source: `reset()` — `altimeter.stopRelativeAltitudeUpdates()` plus clearing the data. */
  reset(): void {
    if (this.subscribed) {
      try {
        sensor.off(sensor.SensorId.BAROMETER, this.callback);
      } catch (err) {
        hilog.error(DOMAIN, TAG, 'altitude updates could not stop: %{public}s',
          JSON.stringify(err));
      } finally {
        this.subscribed = false;
      }
    }
    this.altitudeData = [];
    this.referencePressure = null;
  }
}

/** Barometric formula: altitude difference in meters between two pressures in hPa. */
function relativeAltitude(referencePressure: number, pressure: number): number {
  const reference: number =
    SEA_LEVEL_FACTOR * (1 - Math.pow(referencePressure / 1013.25, BAROMETRIC_EXPONENT));
  const current: number =
    SEA_LEVEL_FACTOR * (1 - Math.pow(pressure / 1013.25, BAROMETRIC_EXPONENT));
  return current - reference;
}

export class WorkoutBuilder implements ApplicationStateObserver, WorkoutContinuable {
  /** Source: `static weak var currentlyActive` — ArkTS has no weak reference, so this is strong. */
  static currentlyActive: WorkoutBuilder | null = null;

  /**
   * Source: `WorkoutBuilder+Termination.didSaveWorkoutOnTermination`, set by
   * `AppDelegate.tryToSaveRecodingWorkout()` from `applicationWillTerminate`. A force-killed
   * HarmonyOS process gets no such callback, so it is held true for as long as the builder is
   * active (see `setStatus`) and read on the next launch.
   */
  static readonly didSaveWorkoutOnTermination: BoolPreference =
    new BoolPreference('didSaveWorkoutOnTermination', false);
  /** Source: `termWorkoutSaveSuccess` — a snapshot was encoded into `termWorkoutData`. */
  static readonly termWorkoutSaveSuccess: BoolPreference =
    new BoolPreference('termWorkoutSaveSuccess', false);
  /**
   * Source: `termWorkoutData` — the encoded snapshot. With no terminate callback it is refreshed
   * every SNAPSHOT_INTERVAL_MS while active and whenever the app goes to the background, so a kill
   * loses at most that interval; a kill before the first write is the source's Lost Workout case.
   * ponytail: rewrites the whole route each time, O(route) per write; append-only if long
   * recordings make it slow.
   */
  static readonly termWorkoutData: OptionalStringPreference = new OptionalStringPreference('termWorkout');

  /** Source: `workoutType`. */
  workoutType: WorkoutType;
  /** Source: `delegate`. */
  delegate: WorkoutBuilderDelegate | null;

  /** Source: `autoPauseDetection` / `locationManagement` / `stepCounter` / `altitudeManagement`. */
  readonly autoPauseDetection: AutoPauseDetection = new AutoPauseDetection();
  readonly locationManagement: LocationManagement = new LocationManagement();
  readonly stepCounter: StepCounter = new StepCounter();
  readonly altitudeManagement: AltitudeManagement = new AltitudeManagement();

  private currentStatus: WorkoutBuilderStatus = WorkoutBuilderStatus.WAITING;
  private workoutStartDate: Date | null = null;
  private workoutEndDate: Date | null = null;
  private pauseEvents: TempWorkoutEvent[] = [];
  /** Source: `protectedShouldPerformBackgroundUpdates`. */
  private protectedShouldPerformBackgroundUpdates: boolean = true;
  /** Source: `components`. */
  private components: WorkoutBuilderComponent[] = [];
  private periodicTimer: number = -1;
  private snapshotTimer: number = -1;
  private periodicTicks: number = 0;
  private motionSubscribed: boolean = false;
  private unmeasuredSpeedLogged: boolean = false;
  private backgroundTaskRunning: boolean = false;
  private readonly context: common.UIAbilityContext | null;
  private readonly motionCallback: (response: sensor.AccelerometerResponse) => void;

  /**
   * Source: `init(workoutType:delegate:)`. The context is the addition: a continuous task needs
   * one, and it is what keeps location fixes coming while the screen is off.
   */
  constructor(workoutType: WorkoutType | null, delegate: WorkoutBuilderDelegate,
    context: common.UIAbilityContext | null = null) {
    this.workoutType = workoutType !== null
      ? workoutType : workoutTypeFromRaw(UserPreferences.standardWorkoutType.value);
    this.delegate = delegate;
    this.context = context;
    this.motionCallback = (response: sensor.AccelerometerResponse): void => {
      this.autoPauseDetection.noteAcceleration(response.x, response.y, response.z);
    };

    this.setupComponents([this.autoPauseDetection, this.locationManagement, this.stepCounter,
      this.altitudeManagement]);
    this.notifyOfReadinessChange();
    startObservingApplicationState(this);
    WorkoutBuilder.currentlyActive = this;
  }

  /** Source: `status` (private setter). */
  get status(): WorkoutBuilderStatus {
    return this.currentStatus;
  }

  /** Source: `startDate`. */
  get startDate(): Date | null {
    return this.workoutStartDate;
  }

  /** Source: `endDate`. */
  get endDate(): Date | null {
    return this.workoutEndDate;
  }

  /** Source: `manualPauseEvents`. */
  get manualPauseEvents(): TempWorkoutEvent[] {
    return this.pauseEvents;
  }

  /** Source: `shouldPerformBackgroundUpdates`. */
  get shouldPerformBackgroundUpdates(): boolean {
    return this.protectedShouldPerformBackgroundUpdates;
  }

  /** Source: the `didSet` on `status`. */
  private setStatus(newStatus: WorkoutBuilderStatus): void {
    const oldStatus: WorkoutBuilderStatus = this.currentStatus;
    this.currentStatus = newStatus;
    const isActive: boolean = workoutBuilderStatusIsActive(newStatus);
    if (isActive !== workoutBuilderStatusIsActive(oldStatus)) {
      WorkoutBuilder.didSaveWorkoutOnTermination.value = isActive;
      if (isActive) {
        this.snapshotTimer = setInterval((): void => {
          this.persistTerminationSnapshot();
        }, SNAPSHOT_INTERVAL_MS);
      } else {
        clearInterval(this.snapshotTimer);
        this.snapshotTimer = -1;
        WorkoutBuilder.termWorkoutSaveSuccess.delete();
        WorkoutBuilder.termWorkoutData.delete();
      }
    }
    const timestamp: Date = new Date();
    /* The real transition, lowercased — the recorder's lifecycle marker on device. */
    const newLabel: string = newStatus;
    const oldLabel: string = oldStatus;
    hilog.info(DOMAIN, TAG, 'status=%{public}s (from %{public}s)',
      newLabel.toLowerCase(), oldLabel.toLowerCase());
    this.performOnEveryComponent((component: WorkoutBuilderComponent): void => {
      component.statusChanged(oldStatus, newStatus, timestamp);
    });
    this.liveUpdateStatus();
  }

  // MARK: Actions

  /** Source: `startOrResume(completion:)`. */
  startOrResume(completion: (success: boolean) => void): void {
    const safeCompletion: (success: boolean) => void = this.makeClosureThreadSafe(completion);
    const timestamp: Date = new Date();

    this.validateTransition(WorkoutBuilderStatus.RECORDING, (valid: boolean): void => {
      // QA fault startFail: the start action fails underneath, as if location stopped right then.
      const success: boolean = valid && !qaFault('startFail');
      if (success) {
        if (this.workoutStartDate === null) {
          this.workoutStartDate = timestamp;
        } else {
          this.pauseEvents.push(TempWorkoutEvent.atDate(WorkoutEventType.RESUME, timestamp));
        }
        this.setStatus(WorkoutBuilderStatus.RECORDING);
        this.startPeriodicUpdates();
        this.startMotionUpdates();
        this.startBackgroundTask();
      }
      safeCompletion(success);
    });
  }

  /** Source: `pause(completion:)`. */
  pause(completion: (success: boolean) => void): void {
    const safeCompletion: (success: boolean) => void = this.makeClosureThreadSafe(completion);
    const timestamp: Date = new Date();

    this.validateTransition(WorkoutBuilderStatus.PAUSED, (success: boolean): void => {
      if (success) {
        this.pauseEvents.push(TempWorkoutEvent.atDate(WorkoutEventType.PAUSE, timestamp));
        this.setStatus(WorkoutBuilderStatus.PAUSED);
      }
      safeCompletion(success);
    });
  }

  /** Source: `finish(shouldProvideCompletionActions:completion:)`. */
  // The source defaulted `shouldProvideCompletionActions` to true; a default cannot precede a
  // required parameter here, so both are passed explicitly.
  finish(shouldProvideCompletionActions: boolean,
    completion: (success: boolean) => void): void {
    const safeCompletion: (success: boolean) => void = this.makeClosureThreadSafe(completion);
    const timestamp: Date = new Date();

    this.validateTransition(WorkoutBuilderStatus.READY, (success: boolean): void => {
      if (!success) {
        safeCompletion(false);
        return;
      }
      this.workoutEndDate = timestamp;
      const snapshot: TempWorkout | null = this.createSnapshot();
      if (snapshot !== null) {
        const handler: WorkoutCompletionActionHandler =
          new WorkoutCompletionActionHandler(snapshot, this);
        if (shouldProvideCompletionActions) {
          handler.display();
        } else {
          handler.saveWorkout();
        }
        safeCompletion(true);
      } else {
        safeCompletion(false);
      }
      this.reset();
    });
  }

  /** Source: `continueWorkout(from:)`. */
  continueWorkout(snapshot: TempWorkout): void {
    const timestamp: Date = new Date();

    this.setStatus(WorkoutBuilderStatus.RECORDING);
    this.workoutStartDate = snapshot.startDate;
    this.workoutEndDate = null;

    const events: TempWorkoutEvent[] = [];
    for (const event of snapshot.workoutEvents) {
      events.push(event);
    }
    events.push(TempWorkoutEvent.atDate(WorkoutEventType.PAUSE, snapshot.endDate));
    events.push(TempWorkoutEvent.atDate(WorkoutEventType.RESUME, timestamp));
    this.pauseEvents = events;

    this.performOnEveryComponent((component: WorkoutBuilderComponent): void => {
      component.continueWorkout(snapshot, timestamp);
    });

    this.startPeriodicUpdates();
    this.startMotionUpdates();
    this.startBackgroundTask();
  }

  /** Source: `actOnDismiss()`. */
  actOnDismiss(): void {
    this.locationManagement.stopLocationUpdates();
    this.reset();
    if (WorkoutBuilder.currentlyActive === this) {
      WorkoutBuilder.currentlyActive = null;
    }
    stopObservingApplicationState(this);
  }

  // MARK: Notifications from Components

  /** Source: `notifyOfReadinessChange()`. */
  notifyOfReadinessChange(): void {
    let allReady: boolean = true;
    for (const component of this.components) {
      if (!component.isReady) {
        allReady = false;
      }
    }
    if (this.currentStatus === WorkoutBuilderStatus.WAITING && allReady) {
      this.setStatus(WorkoutBuilderStatus.READY);
    } else if (this.currentStatus === WorkoutBuilderStatus.READY && !allReady) {
      this.setStatus(WorkoutBuilderStatus.WAITING);
    }
  }

  /** Source: `suggestNewStatus(_:closure:)`. */
  suggestNewStatus(status: WorkoutBuilderStatus, closure: (isValid: boolean) => void): void {
    this.validateTransition(status, (isValid: boolean): void => {
      if (isValid) {
        this.setStatus(status);
        if (status === WorkoutBuilderStatus.RECORDING) {
          this.startPeriodicUpdates();
        }
      }
      closure(isValid);
    });
  }

  /** Source: `notfiyOfLocationUpdate(with:)` (the source's spelling; fixed here). */
  notifyOfLocationUpdate(location: geoLocationManager.Location): void {
    this.liveUpdateLocations(location, false);
    this.liveUpdateSpeed();
    const speed: number = measuredSpeed(location);
    if (speed === NO_MEASURED_SPEED && !this.unmeasuredSpeedLogged) {
      // Once per builder, not per fix: this is what makes "auto-pause stood down" provable in hilog.
      this.unmeasuredSpeedLogged = true;
      hilog.info(DOMAIN, TAG,
        'location fixes carry no measured speed (speedAccuracy=%{public}s); auto-pause stands down',
        `${location.speedAccuracy}`);
    }
    if (workoutBuilderStatusIsActive(this.currentStatus)) {
      this.autoPauseDetection.update(new Date(location.timeStamp), this.workoutType, speed);
    }
  }

  /** The source spells this method `notfiyOfLocationUpdate`; kept as an alias for its callers. */
  notfiyOfLocationUpdate(location: geoLocationManager.Location): void {
    this.notifyOfLocationUpdate(location);
  }

  /** Source: `notifyOfDistanceUpdate()`. */
  notifyOfDistanceUpdate(): void {
    this.liveUpdateDistance();
  }

  /** Source: `notifyOfInsufficientLocationPermission()`. */
  notifyOfInsufficientLocationPermission(): void {
    this.liveUpdateInsufficientPermission();
  }

  // MARK: Snapshot

  /** Source: `createSnapshot()`. */
  createSnapshot(): TempWorkout | null {
    const start: Date | null = this.workoutStartDate;
    if (!workoutBuilderStatusIsActive(this.currentStatus) || start === null) {
      return null;
    }
    const end: Date = this.workoutEndDate !== null ? this.workoutEndDate : new Date();

    let burnedEnergy: number | null = null;
    const userWeight: number | null = UserPreferences.weight.value;
    if (userWeight !== null) {
      burnedEnergy = BurnedEnergyCalculator
        .calculateBurnedCalories(this.workoutType, this.locationManagement.distance, userWeight)
        .converting(standardUnit(Dimension.ENERGY)).value;
    }

    const events: TempWorkoutEvent[] = [];
    for (const event of this.pauseEvents) {
      events.push(event);
    }
    for (const event of AutoPause.convertToEvents(this.autoPauseDetection.getAutoPauses(end))) {
      events.push(event);
    }

    const routeData: TempWorkoutRouteDataSample[] =
      this.altitudeManagement.refine(this.locationManagement.locations);

    return new TempWorkout(null, this.workoutType as number, start, end,
      this.locationManagement.distance, this.stepCounter.steps, false, false, null, burnedEnergy,
      null, events, routeData, []);
  }

  // MARK: Protected

  /** Source: `startPeriodicUpdates()` — one tick a second while recording. */
  private startPeriodicUpdates(): void {
    this.stopPeriodicUpdates();
    this.periodicTicks = 0;
    this.periodicTimer = setInterval((): void => {
      if (this.currentStatus !== WorkoutBuilderStatus.RECORDING) {
        this.stopPeriodicUpdates();
        return;
      }
      this.liveUpdateDuration();
      this.liveUpdateBurnedEnergy();
      /*
       * A RECORDING heartbeat, every 5th tick. `status=...` is logged once per transition, and the
       * device buffer holds only ~108 s, so a long walk to the screen ages that single line out and
       * leaves "is it recording?" unanswerable from hilog even while the workout is visibly running.
       * A periodic line makes the live state observable for as long as it is true.
       */
      this.periodicTicks += 1;
      if (this.periodicTicks % 5 === 0) {
        const label: string = this.currentStatus;
        hilog.info(DOMAIN, TAG, 'status=%{public}s distance=%{public}f m',
          label.toLowerCase(), this.locationManagement.distance);
      }
    }, 1000);
  }

  private stopPeriodicUpdates(): void {
    if (this.periodicTimer !== -1) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = -1;
    }
  }

  /**
   * Source: `makeClosureThreadSafe(_:)` — the source hopped to `DispatchQueue.main.async`; the
   * equivalent here is deferring to the next turn of the event loop the UI runs on.
   */
  private makeClosureThreadSafe(closure: (value: boolean) => void): (value: boolean) => void {
    return (value: boolean): void => {
      setTimeout((): void => {
        closure(value);
      }, 0);
    };
  }

  /** Source: `reset()`. */
  private reset(): void {
    this.workoutStartDate = null;
    this.workoutEndDate = null;
    this.pauseEvents = [];
    this.stopPeriodicUpdates();
    this.stopMotionUpdates();
    this.stopBackgroundTask();
    this.setStatus(WorkoutBuilderStatus.WAITING);

    this.performOnEveryComponent((component: WorkoutBuilderComponent): void => {
      component.reset();
    });

    const delegate: WorkoutBuilderDelegate | null = this.delegate;
    if (delegate !== null) {
      delegate.resetAll();
    }

    this.notifyOfReadinessChange();
  }

  /** Source: `setupComponents(with:)`. */
  private setupComponents(components: WorkoutBuilderComponent[]): void {
    for (const component of components) {
      component.builder = this;
    }
    this.components = components;
  }

  /** Source: `performOnEveryComponent(closure:)`. */
  private performOnEveryComponent(closure: (component: WorkoutBuilderComponent) => void): void {
    for (const component of this.components) {
      closure(component);
    }
  }

  /** Source: `validateTransition(to:closure:)` — no call at all for a no-op transition. */
  private validateTransition(newStatus: WorkoutBuilderStatus,
    closure: (isValid: boolean) => void): void {
    if (this.currentStatus === newStatus) {
      return;
    }
    let isValid: boolean = false;
    switch (newStatus) {
      case WorkoutBuilderStatus.RECORDING:
        isValid = this.currentStatus !== WorkoutBuilderStatus.WAITING;
        break;
      case WorkoutBuilderStatus.PAUSED:
        isValid = this.currentStatus === WorkoutBuilderStatus.RECORDING
          || this.currentStatus === WorkoutBuilderStatus.AUTO_PAUSED;
        break;
      case WorkoutBuilderStatus.WAITING:
        isValid = this.currentStatus === WorkoutBuilderStatus.READY;
        break;
      case WorkoutBuilderStatus.READY:
        isValid = true;
        break;
      default:
        isValid = this.currentStatus === WorkoutBuilderStatus.RECORDING;
        break;
    }
    closure(isValid);
  }

  // MARK: Accelerometer (the CMMotionActivityManager substitution)

  private startMotionUpdates(): void {
    if (this.motionSubscribed) {
      return;
    }
    try {
      const options: sensor.Options = { interval: MOTION_SAMPLE_INTERVAL_NS };
      sensor.on(sensor.SensorId.ACCELEROMETER, this.motionCallback, options);
      this.motionSubscribed = true;
      this.autoPauseDetection.setMotionAvailable(true);
    } catch (err) {
      // State, not only a log line: resolveSpeed must know there is no movement evidence coming.
      this.autoPauseDetection.setMotionAvailable(false);
      hilog.error(DOMAIN, TAG, 'accelerometer unavailable: %{public}s', JSON.stringify(err));
    }
  }

  private stopMotionUpdates(): void {
    if (!this.motionSubscribed) {
      return;
    }
    try {
      sensor.off(sensor.SensorId.ACCELEROMETER, this.motionCallback);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'accelerometer could not stop: %{public}s', JSON.stringify(err));
    } finally {
      this.motionSubscribed = false;
    }
  }

  // MARK: Background running (CLLocationManager.allowsBackgroundLocationUpdates)

  private startBackgroundTask(): void {
    const context: common.UIAbilityContext | null = this.context;
    if (context === null || this.backgroundTaskRunning) {
      return;
    }
    const want: Want = {
      bundleName: context.abilityInfo.bundleName,
      abilityName: context.abilityInfo.name
    };
    const info: wantAgent.WantAgentInfo = {
      wants: [want],
      operationType: wantAgent.OperationType.START_ABILITY,
      requestCode: 0,
      wantAgentFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG]
    };
    wantAgent.getWantAgent(info).then((agent: WantAgent): void => {
      backgroundTaskManager
        .startBackgroundRunning(context, backgroundTaskManager.BackgroundMode.LOCATION, agent)
        .then((): void => {
          this.backgroundTaskRunning = true;
        })
        .catch((err: Error): void => {
          hilog.error(DOMAIN, TAG, 'continuous task refused: %{public}s', JSON.stringify(err));
        });
    }).catch((err: Error): void => {
      hilog.error(DOMAIN, TAG, 'want agent failed: %{public}s', JSON.stringify(err));
    });
  }

  private stopBackgroundTask(): void {
    const context: common.UIAbilityContext | null = this.context;
    if (context === null || !this.backgroundTaskRunning) {
      return;
    }
    backgroundTaskManager.stopBackgroundRunning(context).then((): void => {
      this.backgroundTaskRunning = false;
    }).catch((err: Error): void => {
      hilog.error(DOMAIN, TAG, 'continuous task could not stop: %{public}s', JSON.stringify(err));
      this.backgroundTaskRunning = false;
    });
  }

  // MARK: Background Suspension

  /** Source: `suspendBackgroundUpdates()`. */
  private suspendBackgroundUpdates(): void {
    this.setProtectedShouldPerformBackgroundUpdates(false);
  }

  /** Source: `resumeBackgroundUpdates()`. */
  private resumeBackgroundUpdates(): void {
    this.setProtectedShouldPerformBackgroundUpdates(true);

    this.liveUpdateStatus();
    this.liveUpdateDistance();
    const locations: geoLocationManager.Location[] = this.locationManagement.locations;
    this.liveUpdateLocations(locations.length > 0 ? locations[locations.length - 1] : null, true);
    this.liveUpdateDuration();
    this.liveUpdateSpeed();
    this.liveUpdateBurnedEnergy();
  }

  /** Source: the `didSet` on `protectedShouldPerformBackgroundUpdates`. */
  private setProtectedShouldPerformBackgroundUpdates(newValue: boolean): void {
    this.protectedShouldPerformBackgroundUpdates = newValue;
    const delegate: WorkoutBuilderDelegate | null = this.delegate;
    if (delegate !== null && delegate.onUiUpdatesSuspended !== null) {
      delegate.onUiUpdatesSuspended(!this.protectedShouldPerformBackgroundUpdates);
    }
  }

  // MARK: ApplicationStateObserver

  /** Source: `didUpdateApplicationState(to:)`. */
  didUpdateApplicationState(state: ApplicationState): void {
    if (state === ApplicationState.FOREGROUND) {
      this.resumeBackgroundUpdates();
      if (!workoutBuilderStatusIsActive(this.currentStatus)) {
        this.locationManagement.startLocationUpdates();
      }
    } else {
      this.suspendBackgroundUpdates();
      if (!workoutBuilderStatusIsActive(this.currentStatus)) {
        this.locationManagement.stopLocationUpdates();
      } else {
        // The last callback before a swipe-away kill; the source's applicationWillTerminate save.
        this.persistTerminationSnapshot();
      }
    }
  }

  /** Source: `AppDelegate.tryToSaveRecodingWorkout()` — encode the live snapshot for the next launch. */
  private persistTerminationSnapshot(): void {
    const snapshot: TempWorkout | null = this.createSnapshot();
    if (snapshot === null) {
      return;
    }
    try {
      WorkoutBuilder.termWorkoutData.value = snapshot.toJSONString();
      WorkoutBuilder.termWorkoutSaveSuccess.value = true;
    } catch (err) {
      WorkoutBuilder.termWorkoutSaveSuccess.value = false;
      hilog.error(DOMAIN, TAG, 'could not encode the termination snapshot');
    }
  }

  // MARK: Live Updates (WorkoutBuilder+LiveUpdates.swift)

  /** Source: `performIfAppropriate(closure:)`. */
  private performIfAppropriate(closure: (delegate: WorkoutBuilderDelegate) => void): void {
    const delegate: WorkoutBuilderDelegate | null = this.delegate;
    if (this.protectedShouldPerformBackgroundUpdates && delegate !== null) {
      closure(delegate);
    }
  }

  /** Source: `getPauseRanges(with:)` — manual pause/resume, auto pause/resume, plus predictions. */
  private getPauseRanges(referenceDate: Date): TimeRange[] {
    const ranges: TimeRange[] = [];
    this.collectPauseRanges(ranges, referenceDate, WorkoutEventType.PAUSE,
      WorkoutEventType.RESUME);
    // after continuing a workout there could be auto pauses among the stored events
    this.collectPauseRanges(ranges, referenceDate, WorkoutEventType.AUTO_PAUSE,
      WorkoutEventType.AUTO_RESUME);
    for (const range of this.autoPauseDetection.getPauseRanges(referenceDate)) {
      ranges.push(range);
    }
    return ranges;
  }

  private collectPauseRanges(into: TimeRange[], referenceDate: Date, openType: WorkoutEventType,
    closeType: WorkoutEventType): void {
    for (let index: number = 0; index < this.pauseEvents.length; index++) {
      const event: TempWorkoutEvent = this.pauseEvents[index];
      if (event.realEventType() !== openType || index + 1 >= this.pauseEvents.length) {
        continue;
      }
      const nextEvent: TempWorkoutEvent = this.pauseEvents[index + 1];
      if (nextEvent.realEventType() === closeType
        && event.startDate.getTime() < nextEvent.startDate.getTime()) {
        into.push(intervalRange(secondsBetween(event.startDate, referenceDate),
          secondsBetween(nextEvent.startDate, referenceDate)));
      }
    }
  }

  /** Source: `getDurationMeasurement()` — elapsed time minus every pause. */
  private getDurationMeasurement(): Measurement {
    const startDate: Date | null = this.workoutStartDate;
    if (startDate === null) {
      return new Measurement(0, Unit.SECONDS);
    }
    const end: Date = this.workoutEndDate !== null ? this.workoutEndDate : new Date();
    let duration: number = secondsBetween(startDate, end);
    for (const range of this.getPauseRanges(startDate)) {
      duration -= rangeLength(range);
    }
    return new Measurement(duration, Unit.SECONDS);
  }

  /** Source: `getDistanceMeasurement()`. */
  private getDistanceMeasurement(): Measurement {
    return new Measurement(this.locationManagement.distance, standardUnit(Dimension.LENGTH));
  }

  /** Source: `checkForPause(for:with:and:)`. */
  private checkForPause(date: Date, referenceDate: Date, ranges: TimeRange[]): boolean {
    const value: number = secondsBetween(date, referenceDate);
    for (const range of ranges) {
      if (value >= range.start && value <= range.end) {
        return true;
      }
    }
    return false;
  }

  /** Source: `getPaceMeasurementFrom(duration:distance:)`. */
  private getPaceMeasurementFrom(duration: Measurement, distance: Measurement):
    RelativeMeasurement {
    return new RelativeMeasurement(duration.converting(Unit.MINUTES),
      distance.converting(UserPreferences.distanceMeasurementType.safeValue));
  }

  /** Source: `liveUpdateStatus()`. */
  liveUpdateStatus(): void {
    this.performIfAppropriate((delegate: WorkoutBuilderDelegate): void => {
      if (delegate.onStatusUpdate !== null) {
        delegate.onStatusUpdate(this.currentStatus);
      }
    });
  }

  /** Source: `liveUpdateDistance()`. */
  liveUpdateDistance(): void {
    this.performIfAppropriate((delegate: WorkoutBuilderDelegate): void => {
      if (delegate.onDistanceUpdate !== null) {
        delegate.onDistanceUpdate(this.getDistanceMeasurement());
      }
    });
  }

  /** Source: `liveUpdateLocations(withLast:force:)`. */
  liveUpdateLocations(lastLocation: geoLocationManager.Location | null, force: boolean): void {
    this.performIfAppropriate((delegate: WorkoutBuilderDelegate): void => {
      if (delegate.onRouteDataUpdate !== null) {
        delegate.onRouteDataUpdate(this.locationManagement.locations);
      }
      if (lastLocation !== null && delegate.onCurrentLocationUpdate !== null) {
        delegate.onCurrentLocationUpdate(lastLocation, force);
      }
    });
  }

  /** Source: `liveUpdateInsufficientPermission()`. */
  liveUpdateInsufficientPermission(): void {
    this.performIfAppropriate((delegate: WorkoutBuilderDelegate): void => {
      if (delegate.onInsufficientLocationPermission !== null) {
        delegate.onInsufficientLocationPermission();
      }
    });
  }

  /** Source: `liveUpdateDuration()`. */
  liveUpdateDuration(): void {
    this.performIfAppropriate((delegate: WorkoutBuilderDelegate): void => {
      if (delegate.onDurationUpdate !== null) {
        delegate.onDurationUpdate(this.getDurationMeasurement());
      }
    });
  }

  /** Source: `liveUpdateBurnedEnergy()` — nothing is reported without a stored user weight. */
  liveUpdateBurnedEnergy(): void {
    this.performIfAppropriate((delegate: WorkoutBuilderDelegate): void => {
      const userWeight: number | null = UserPreferences.weight.value;
      if (userWeight !== null && delegate.onEnergyUpdate !== null) {
        delegate.onEnergyUpdate(BurnedEnergyCalculator.calculateBurnedCalories(this.workoutType,
          this.locationManagement.distance, userWeight));
      }
    });
  }

  /** Source: `liveUpdateSpeed()` — rolling or total, as pace or as speed, per preference. */
  liveUpdateSpeed(): void {
    // Paused = metrics frozen. HarmonyOS keeps delivering stationary fixes every second, so the
    // rolling pace would otherwise drift on GPS jitter while the workout is paused.
    if (workoutBuilderStatusIsPaused(this.currentStatus)) {
      return;
    }
    this.performIfAppropriate((delegate: WorkoutBuilderDelegate): void => {
      if (UserPreferences.displayRollingSpeed.value) {
        this.liveUpdateRollingSpeed(delegate);
      } else if (UserPreferences.usePaceForSpeedDisplay.value) {
        if (delegate.onPaceUpdate !== null) {
          delegate.onPaceUpdate(
            this.getPaceMeasurementFrom(this.getDurationMeasurement(),
              this.getDistanceMeasurement()), false);
        }
      } else if (delegate.onSpeedUpdate !== null) {
        // current speed, the last three usable values averaged
        let averageSpeed: number = 0;
        const locations: geoLocationManager.Location[] = this.locationManagement.locations;
        let counted: number = 0;
        for (let i: number = locations.length - 1; i >= 0 && counted < 3; i--) {
          const speed: number = locations[i].speed;
          if (speed > 0) {
            averageSpeed = (averageSpeed * counted + speed) / (counted + 1);
            counted += 1;
          }
        }
        delegate.onSpeedUpdate(new Measurement(averageSpeed, standardUnit(Dimension.SPEED)), false);
      }
    });
  }

  /** Source: the rolling branch of `liveUpdateSpeed()` — the last kilometre, pauses excluded. */
  private liveUpdateRollingSpeed(delegate: WorkoutBuilderDelegate): void {
    const startDate: Date | null = this.workoutStartDate;
    if (startDate === null) {
      return;
    }
    const pauseRanges: TimeRange[] = this.getPauseRanges(startDate);
    const locations: geoLocationManager.Location[] = this.locationManagement.locations;

    let tempDistance: number = 0;
    let tempDuration: number = 0;
    let lastLocation: geoLocationManager.Location | null = null;

    for (let i: number = locations.length - 1; i >= 0 && tempDistance < 1000; i--) {
      const location: geoLocationManager.Location = locations[i];
      if (this.checkForPause(new Date(location.timeStamp), startDate, pauseRanges)) {
        lastLocation = null;
        continue;
      }
      if (lastLocation !== null) {
        tempDistance += metersBetween(lastLocation, location);
        tempDuration += secondsBetween(new Date(location.timeStamp),
          new Date(lastLocation.timeStamp));
      }
      lastLocation = location;
    }

    if (tempDuration <= 0 || tempDistance <= 0) {
      return;
    }

    if (UserPreferences.usePaceForSpeedDisplay.value) {
      if (delegate.onPaceUpdate !== null) {
        delegate.onPaceUpdate(this.getPaceMeasurementFrom(
          new Measurement(tempDuration, Unit.SECONDS),
          new Measurement(tempDistance, standardUnit(Dimension.LENGTH))), true);
      }
    } else if (delegate.onSpeedUpdate !== null) {
      delegate.onSpeedUpdate(
        new Measurement(tempDistance / tempDuration, Unit.METERS_PER_SECOND), true);
    }
  }
}
