/*
 * Port of `TempV3.Workout` (OutRun/Models/Data/TempDataTypes.swift:88-103) plus its extension
 * (TempDataTypes.swift:139-209) and the `typealias TempWorkout`.
 *
 * PRE-PERSISTENCE staging type (see TempWorkoutHeartRateDataSample.ts): WorkoutBuilder's snapshot,
 * a backup's workout entry and an import candidate are all this type, and DataManager is what
 * turns one into stored rows. It carries its own samples by value — no store reference.
 * `workoutType` stays the raw Int that goes into the store; `realWorkoutType()` is the typed read.
 * `init(fromV1:)` / `init(fromV2:)` are NOT ported: those read V1/V2 backup envelopes, which
 * model/BackupV3.ts already dropped (no old HarmonyOS backups exist to read).
 * `healthKitUUID` is kept because it is a persisted column carried through backups, but nothing
 * writes it — HMS Health Service Kit is unavailable to this build.
 */
import { Workout } from './Workout';
import { WorkoutType, workoutTypeFromRaw } from './WorkoutType';
import { TempWorkoutEvent } from './TempWorkoutEvent';
import { TempWorkoutRouteDataSample } from './TempWorkoutRouteDataSample';
import { TempWorkoutHeartRateDataSample } from './TempWorkoutHeartRateDataSample';

export class TempWorkout {
  readonly uuid: string | null;
  readonly workoutType: number;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly distance: number;
  readonly steps: number | null;
  readonly isRace: boolean;
  readonly isUserModified: boolean;
  readonly comment: string | null;
  readonly burnedEnergy: number | null;
  readonly healthKitUUID: string | null;
  readonly workoutEvents: TempWorkoutEvent[];
  readonly locations: TempWorkoutRouteDataSample[];
  readonly heartRates: TempWorkoutHeartRateDataSample[];

  constructor(uuid: string | null, workoutType: number, startDate: Date, endDate: Date,
    distance: number, steps: number | null, isRace: boolean, isUserModified: boolean,
    comment: string | null, burnedEnergy: number | null, healthKitUUID: string | null,
    workoutEvents: TempWorkoutEvent[], locations: TempWorkoutRouteDataSample[],
    heartRates: TempWorkoutHeartRateDataSample[]) {
    this.uuid = uuid;
    this.workoutType = workoutType;
    this.startDate = startDate;
    this.endDate = endDate;
    this.distance = distance;
    this.steps = steps;
    this.isRace = isRace;
    this.isUserModified = isUserModified;
    this.comment = comment;
    this.burnedEnergy = burnedEnergy;
    this.healthKitUUID = healthKitUUID;
    this.workoutEvents = workoutEvents;
    this.locations = locations;
    this.heartRates = heartRates;
  }

  /** Source: `init(workout:)` — a stored workout and all its samples back into staging form. */
  static fromWorkout(workout: Workout): TempWorkout {
    const events: TempWorkoutEvent[] = [];
    for (const event of workout.workoutEvents) {
      events.push(TempWorkoutEvent.fromEvent(event));
    }
    const locations: TempWorkoutRouteDataSample[] = [];
    for (const sample of workout.routeData) {
      locations.push(TempWorkoutRouteDataSample.fromSample(sample));
    }
    const heartRates: TempWorkoutHeartRateDataSample[] = [];
    for (const sample of workout.heartRates) {
      heartRates.push(TempWorkoutHeartRateDataSample.fromSample(sample));
    }
    return new TempWorkout(workout.uuid, workout.workoutType, workout.startDate, workout.endDate,
      workout.distance, workout.steps, workout.isRace, workout.isUserModified, workout.comment,
      workout.burnedEnergy, workout.healthKitUUID, events, locations, heartRates);
  }

  /** Source: `realWorkoutType` — UNKNOWN for a raw value no case covers. */
  realWorkoutType(): WorkoutType {
    return workoutTypeFromRaw(this.workoutType);
  }

  /** Source: `JSONEncoder().encode(snapshot)` — the termination backup (dates as epoch ms). */
  toJSONString(): string {
    const encoded: EncodedTempWorkout = {
      type: this.workoutType, start: this.startDate.getTime(), end: this.endDate.getTime(),
      distance: this.distance, steps: this.steps, isRace: this.isRace,
      isUserModified: this.isUserModified, comment: this.comment, burnedEnergy: this.burnedEnergy,
      events: this.workoutEvents.map((e: TempWorkoutEvent): EncodedEvent =>
        ({ type: e.eventType, start: e.startDate.getTime(), end: e.endDate.getTime() })),
      locations: this.locations.map((s: TempWorkoutRouteDataSample): EncodedLocation =>
        ({ time: s.timestamp.getTime(), lat: s.latitude, lon: s.longitude, alt: s.altitude,
          hAcc: s.horizontalAccuracy, vAcc: s.verticalAccuracy, speed: s.speed, dir: s.direction })),
      heartRates: this.heartRates.map((h: TempWorkoutHeartRateDataSample): EncodedHeartRate =>
        ({ bpm: h.heartRate, time: h.timestamp.getTime() }))
    };
    return JSON.stringify(encoded);
  }

  /** Source: `JSONDecoder().decode(TempWorkout.self, from:)` — null when the data is unreadable. */
  static fromJSONString(text: string): TempWorkout | null {
    try {
      const d: EncodedTempWorkout = JSON.parse(text) as EncodedTempWorkout;
      return new TempWorkout(null, d.type, new Date(d.start), new Date(d.end), d.distance, d.steps,
        d.isRace, d.isUserModified, d.comment, d.burnedEnergy, null,
        d.events.map((e: EncodedEvent): TempWorkoutEvent =>
          new TempWorkoutEvent(null, e.type, new Date(e.start), new Date(e.end))),
        d.locations.map((s: EncodedLocation): TempWorkoutRouteDataSample =>
          new TempWorkoutRouteDataSample(null, new Date(s.time), s.lat, s.lon, s.alt, s.hAcc, s.vAcc,
            s.speed, s.dir)),
        d.heartRates.map((h: EncodedHeartRate): TempWorkoutHeartRateDataSample =>
          new TempWorkoutHeartRateDataSample(null, h.bpm, new Date(h.time))));
    } catch (err) {
      return null;
    }
  }
}

interface EncodedEvent {
  type: number;
  start: number;
  end: number;
}

interface EncodedLocation {
  time: number;
  lat: number;
  lon: number;
  alt: number;
  hAcc: number;
  vAcc: number;
  speed: number;
  dir: number;
}

interface EncodedHeartRate {
  bpm: number;
  time: number;
}

interface EncodedTempWorkout {
  type: number;
  start: number;
  end: number;
  distance: number;
  steps: number | null;
  isRace: boolean;
  isUserModified: boolean;
  comment: string | null;
  burnedEnergy: number | null;
  events: EncodedEvent[];
  locations: EncodedLocation[];
  heartRates: EncodedHeartRate[];
}
