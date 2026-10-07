/*
 * Port of `OutRunV3.WorkoutRouteDataSample`
 * (OutRun/Models/Data/DataModels/Versions/OutRunV3.swift:129-146) plus the
 * `typealias WorkoutRouteDataSample` extension (DataModels/WorkoutRouteDataSample.swift:25-45).
 *
 * One stored GPS fix of a workout's route. Same treatment as model/WorkoutEvent.ts: the `workout`
 * ToOne relationship is not a field (model/Workout.ts owns the ordered `routeData` array), and the
 * source's initial values are kept because the store columns carry them (-1 for the geographic
 * values, 0 for the two accuracies).
 * `clLocation` is NOT ported: it existed so MapKit could take a CLLocation, and Map Kit takes
 * latitude/longitude directly off this type (the same decision model/TempWorkoutRouteDataSample.ts
 * records). `description` is debug output only.
 */
export class WorkoutRouteDataSample {
  uuid: string | null = null;
  timestamp: Date = new Date(0);
  latitude: number = -1;
  longitude: number = -1;
  altitude: number = -1;
  horizontalAccuracy: number = 0;
  verticalAccuracy: number = 0;
  speed: number = -1;
  direction: number = -1;
}
