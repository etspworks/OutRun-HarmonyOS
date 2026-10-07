/*
 * Port of `WorkoutStatsSeries` (OutRun/Models/Workout/Stats/WorkoutStatsSeries.swift:24-52).
 *
 * A whole stats series — altitude, speed or heart rate over time — cut into sections by what the
 * workout was doing (active vs paused). common/DataQueryManager.ts builds it; the stats screen's
 * diagram draws it.
 * `convertedForChartView` returned an array of anonymous tuples that LabelledDiagramView then
 * turned into `LineChartDataSet`s. ArkTS has no tuple type and that second step added nothing, so
 * this returns the ported `LineChartData` directly (common/ChartData.ts, the Charts port) —
 * carrying the two units as well, which is what the diagram's headline label prints.
 * The conversion itself is the source's: x to MINUTES, y to the caller's unit.
 */
import { Unit } from '../common/Measurement';
import { ChartDataEntry, LineChartData, LineChartDataSet } from '../common/ChartData';
import { WorkoutStatsSeriesSection, WorkoutSeriesDataSample, SeriesDataPoint } from './WorkoutStatsSeriesSection';

/** Source: `SectioningType` — the only sectioning the app ever asks for. */
export enum SectioningType {
  ACTIVE_AND_PAUSED = 'ACTIVE_AND_PAUSED'
}

export class WorkoutStatsSeries {
  readonly sectioningType: SectioningType;
  readonly sections: WorkoutStatsSeriesSection[];

  constructor(sectioningType: SectioningType, sections: WorkoutStatsSeriesSection[]) {
    this.sectioningType = sectioningType;
    this.sections = sections;
  }

  /** Source: `convertedForChartView(includeSamples:yUnit:)`. */
  convertedForChartView(includeSamples: boolean, yUnit: Unit): LineChartData {
    const dataSets: LineChartDataSet[] = [];
    for (const section of this.sections) {
      const entries: ChartDataEntry[] = [];
      for (let index: number = 0; index < section.data.length; index++) {
        const point: SeriesDataPoint = section.data[index];
        const sample: WorkoutSeriesDataSample | null =
          includeSamples && index < section.associatedDataSamples.length
            ? section.associatedDataSamples[index]
            : null;
        entries.push(new ChartDataEntry(point.x.converting(Unit.MINUTES).value,
          point.y.converting(yUnit).value, sample));
      }
      dataSets.push(new LineChartDataSet(entries, section.type.colorRole()));
    }
    return new LineChartData(dataSets, Unit.MINUTES, yUnit);
  }
}
