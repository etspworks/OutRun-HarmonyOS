/*
 * Port of `TempV3.WorkoutRouteDataSample` (OutRun/Models/Data/TempDataTypes.swift:112-122) plus
 * its extension (TempDataTypes.swift:250-320) and the `typealias TempWorkoutRouteDataSample`.
 *
 * PRE-PERSISTENCE staging type (see TempWorkoutHeartRateDataSample.ts).
 * `CLLocation` maps to `geoLocationManager.Location` (Rule 10 capability mapping): its
 * `accuracy` is CoreLocation's horizontalAccuracy, `altitudeAccuracy` the vertical one (optional
 * on the HarmonyOS type, 0 when absent — the same value the source's own V1 converter used), and
 * `timeStamp` is epoch milliseconds, not a Date.
 * `init(fromV1:)` / `init(fromV2:)` are NOT ported: V1/V2 backups exist only so the iOS
 * BackupManager can read an old file, and model/BackupV3.ts already dropped those envelopes.
 * The reverse `clLocation` getter is not ported either — Map Kit takes LatLng, so
 * common/WorkoutMapViewManager.ts reads latitude/longitude straight off this type.
 */
import { geoLocationManager } from '@kit.LocationKit';
import { WorkoutRouteDataSample } from './WorkoutRouteDataSample';

export class TempWorkoutRouteDataSample {
  readonly uuid: string | null;
  readonly timestamp: Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly altitude: number;
  readonly horizontalAccuracy: number;
  readonly verticalAccuracy: number;
  readonly speed: number;
  readonly direction: number;

  constructor(uuid: string | null, timestamp: Date, latitude: number, longitude: number,
    altitude: number, horizontalAccuracy: number, verticalAccuracy: number, speed: number,
    direction: number) {
    this.uuid = uuid;
    this.timestamp = timestamp;
    this.latitude = latitude;
    this.longitude = longitude;
    this.altitude = altitude;
    this.horizontalAccuracy = horizontalAccuracy;
    this.verticalAccuracy = verticalAccuracy;
    this.speed = speed;
    this.direction = direction;
  }

  /** Source: `init(routeSample:)` — a stored row back into its staging form. */
  static fromSample(sample: WorkoutRouteDataSample): TempWorkoutRouteDataSample {
    return new TempWorkoutRouteDataSample(sample.uuid, sample.timestamp, sample.latitude,
      sample.longitude, sample.altitude, sample.horizontalAccuracy, sample.verticalAccuracy,
      sample.speed, sample.direction);
  }

  /** Source: `init(clLocation:)` — one GPS fix from the location stream. */
  static fromLocation(location: geoLocationManager.Location): TempWorkoutRouteDataSample {
    const verticalAccuracy: number =
      location.altitudeAccuracy !== undefined ? location.altitudeAccuracy : 0;
    return new TempWorkoutRouteDataSample(null, new Date(location.timeStamp), location.latitude,
      location.longitude, location.altitude, location.accuracy, verticalAccuracy, location.speed,
      location.direction);
  }
}
