/*
 * The querying half of `WorkoutStats` (OutRun/Models/Workout/Stats/WorkoutStats.swift:23-188).
 *
 * The source class both COMPUTED the aggregates in its `init(workout:)` and carried three
 * `query*` methods that asked DataQueryManager for a chart series and memoised the answer in
 * `lastQueried*Series`. The computing half is the model (model/WorkoutStats.ts — a model must not
 * import a store query, ArkTS rule 9 keeps the data layer one-directional); this module is the
 * querying half, plus the two source properties that read a user preference
 * (`pace`, `timeRelativeBurnedEnergy`) which the model takes a unit for instead.
 *
 * The memo is the source's, including its quirk: a FAILED query is memoised too
 * (`lastQueriedAltitudeSeries = (false, nil)`), so a screen does not re-query a workout whose
 * samples cannot be read.
 */
import { hilog } from '@kit.PerformanceAnalysisKit';
import { CachedStatsSeries, WorkoutStats } from '../model/WorkoutStats';
import { WorkoutStatsSeries } from '../model/WorkoutStatsSeries';
import { Workout } from '../model/Workout';
import { WorkoutRouteDataSample } from '../model/WorkoutRouteDataSample';
import { WorkoutHeartRateDataSample } from '../model/WorkoutHeartRateDataSample';
import { RelativeMeasurement } from '../model/RelativeMeasurement';
import { Unit } from './Measurement';
import { DataQueryManager, SeriesDataValue, SeriesSampleKind, WorkoutSeriesSample } from './DataQueryManager';
import { UserPreferences } from './UserPreferences';
import { QA_SLOW_STATS_MS, qaFault } from './QaHooks';

const DOMAIN: number = 0x0000;
const TAG: string = 'WorkoutStatsService';

/** Source: the `workout.startDate.value.distance(to: sample.timestamp.value)` of every dataPoint. */
function relativeTime(workout: Workout, timestamp: Date): number {
  return (timestamp.getTime() - workout.startDate.getTime()) / 1000;
}

export class WorkoutStatsService {

  /**
   * Source: `DataQueryManager.queryStats(for:completion:)` — the only place a `WorkoutStats` is
   * built, and where `workout.cachedStats` is set. Kept as the screens' entry point so they do not
   * construct stats themselves.
   */
  static async statsFor(workout: Workout): Promise<WorkoutStats | null> {
    if (qaFault('statsSlow')) {
      await new Promise<void>((resolve: () => void): void => {
        setTimeout(resolve, QA_SLOW_STATS_MS);
      });
    }
    if (qaFault('statsNull')) {
      return null;
    }
    return DataQueryManager.queryStats(workout);
  }

  /** Source: `queryAltitudes(completion:)` — metres over active time, memoised. */
  static async queryAltitudes(stats: WorkoutStats): Promise<CachedStatsSeries> {
    const memo: CachedStatsSeries | null = stats.lastQueriedAltitudeSeries;
    if (memo !== null) {
      return memo;
    }
    const series: WorkoutStatsSeries | null = await WorkoutStatsService.query(stats.workout,
      SeriesSampleKind.ROUTE,
      (workout: Workout, sample: WorkoutSeriesSample): SeriesDataValue => {
        const route: WorkoutRouteDataSample = sample as WorkoutRouteDataSample;
        return new SeriesDataValue(relativeTime(workout, route.timestamp), route.altitude,
          Unit.METERS);
      });
    const result: CachedStatsSeries = new CachedStatsSeries(series !== null, series);
    stats.lastQueriedAltitudeSeries = result;
    return result;
  }

  /** Source: `querySpeeds(completion:)` — m/s over active time, memoised. */
  static async querySpeeds(stats: WorkoutStats): Promise<CachedStatsSeries> {
    const memo: CachedStatsSeries | null = stats.lastQueriedSpeedSeries;
    if (memo !== null) {
      return memo;
    }
    const series: WorkoutStatsSeries | null = await WorkoutStatsService.query(stats.workout,
      SeriesSampleKind.ROUTE,
      (workout: Workout, sample: WorkoutSeriesSample): SeriesDataValue => {
        const route: WorkoutRouteDataSample = sample as WorkoutRouteDataSample;
        return new SeriesDataValue(relativeTime(workout, route.timestamp), route.speed,
          Unit.METERS_PER_SECOND);
      });
    const result: CachedStatsSeries = new CachedStatsSeries(series !== null, series);
    stats.lastQueriedSpeedSeries = result;
    return result;
  }

  /** Source: `queryHeartRates(completion:)` — bpm (the source's unitless `UnitCount.count`). */
  static async queryHeartRates(stats: WorkoutStats): Promise<CachedStatsSeries> {
    const memo: CachedStatsSeries | null = stats.lastQueriedHeartRateSeries;
    if (memo !== null) {
      return memo;
    }
    const series: WorkoutStatsSeries | null = await WorkoutStatsService.query(stats.workout,
      SeriesSampleKind.HEART_RATE,
      (workout: Workout, sample: WorkoutSeriesSample): SeriesDataValue => {
        const rate: WorkoutHeartRateDataSample = sample as WorkoutHeartRateDataSample;
        return new SeriesDataValue(relativeTime(workout, rate.timestamp), rate.heartRate,
          Unit.COUNT);
      });
    const result: CachedStatsSeries = new CachedStatsSeries(series !== null, series);
    stats.lastQueriedHeartRateSeries = result;
    return result;
  }

  private static async query(workout: Workout, kind: SeriesSampleKind,
    dataPoint: (workout: Workout, sample: WorkoutSeriesSample) => SeriesDataValue
  ): Promise<WorkoutStatsSeries | null> {
    try {
      return await DataQueryManager.queryStatsSeries(workout, kind, dataPoint);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to query stats series: %{public}s', JSON.stringify(err));
      return null;
    }
  }

  /**
   * Source: `WorkoutStats.pace` — active minutes per preferred distance unit. The source read
   * `UserPreferences.distanceMeasurementType.safeValue` inside the model; the unit is read here so
   * the model stays free of the settings service.
   */
  static pace(stats: WorkoutStats): RelativeMeasurement {
    return stats.pace(UserPreferences.distanceMeasurementType.safeValue);
  }

  /** Source: `WorkoutStats.timeRelativeBurnedEnergy` — preferred energy per active minute. */
  static timeRelativeBurnedEnergy(stats: WorkoutStats): RelativeMeasurement | null {
    return stats.timeRelativeBurnedEnergy(UserPreferences.energyMeasurementType.safeValue);
  }
}
