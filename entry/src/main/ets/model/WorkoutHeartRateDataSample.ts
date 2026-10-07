/*
 * Port of `OutRunV3.WorkoutHeartRateDataSample`
 * (OutRun/Models/Data/DataModels/Versions/OutRunV3.swift:148-159) plus the
 * `typealias WorkoutHeartRateDataSample` extension
 * (DataModels/WorkoutHeartRateDataSample.swift:25-31).
 *
 * One stored heart-rate reading of a workout. Same treatment as model/WorkoutRouteDataSample.ts:
 * no `workout` back-reference (model/Workout.ts owns the ordered `heartRates` array), source
 * initial values kept. `description` is debug output only and is not ported.
 * NOTE the store's own entity identifier is "WorkoutHeartRateSample", not the class name —
 * common/DataManager.ts keeps that table name.
 */
export class WorkoutHeartRateDataSample {
  uuid: string | null = null;
  heartRate: number = 0;
  timestamp: Date = new Date(0);
}
