/*
 * Port of `TempV3.WorkoutHeartRateDataSample` (OutRun/Models/Data/TempDataTypes.swift:123-127)
 * plus its extension (TempDataTypes.swift:322-337) and the `typealias`
 * TempWorkoutHeartRateDataSample.
 *
 * This is a PRE-PERSISTENCE staging type: WorkoutBuilder / the backup reader / the import path
 * build these, and DataManager turns them into stored rows. It holds no store reference and is
 * `Codable` in the source, so every field stays a plain value.
 * `init?<T: WorkoutSeriesDataSampleType>(sample:)` was a generic downcast from the sample
 * protocol; ArkTS has no structural typing, so the caller picks `fromSample` directly.
 */
import { WorkoutHeartRateDataSample } from './WorkoutHeartRateDataSample';

export class TempWorkoutHeartRateDataSample {
  readonly uuid: string | null;
  readonly heartRate: number;
  readonly timestamp: Date;

  constructor(uuid: string | null, heartRate: number, timestamp: Date) {
    this.uuid = uuid;
    this.heartRate = heartRate;
    this.timestamp = timestamp;
  }

  /** Source: `init(heartRateSample:)` — a stored row back into its staging form. */
  static fromSample(sample: WorkoutHeartRateDataSample): TempWorkoutHeartRateDataSample {
    return new TempWorkoutHeartRateDataSample(sample.uuid, sample.heartRate, sample.timestamp);
  }
}
