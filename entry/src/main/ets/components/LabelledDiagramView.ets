/*
 * S3 structure — port of `LabelledDiagramView` (OutRun/Views/Data/LabelledDiagramView.swift): a
 * headline over the 125pt LineChartView. The headline is the source's own:
 * `(title + "  -  " + yUnit + "-" + xUnit).uppercased()` once data has arrived, the bare title
 * before that. The chart itself is the Charts port (components/LineChart.ets); `disableSelection()`
 * is the two highlight flags the stats cards clear.
 */
import { LineChartData } from '../common/ChartData';
import { unitSymbol } from '../common/Measurement';
import { LineChart } from './LineChart';
import { WorkoutSeriesDataSample } from '../model/WorkoutStatsSeriesSection';

@Component
export struct LabelledDiagramView {
  @Prop title: string = '';
  /**
   * The series, filled when the stats query returns. @Link because LineChart takes the model by
   * reference — a @Prop copy would arrive without its methods.
   */
  @Link data: LineChartData | null;
  /** Source: `disableSelection()` — the stats cards call it, the map controller does not. */
  @Prop selectionEnabled: boolean = true;
  /** Source: `didSelect(sample:)` — the map controller moves its annotation to the picked sample. */
  onSampleSelected: ((sample: WorkoutSeriesDataSample) => void) | null = null;

  build() {
    Column() {
      /** Source: `headlineLabel` — 14 .bold, .secondaryColor, uppercased with its unit suffix. */
      Text(this.headline())
        .fontSize(14)
        .fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.secondary_color'))
        .maxLines(1)
        .width('100%')
      /** Source: `diagramView` — 125pt tall under its label. */
      LineChart({
        data: $data,
        selectionEnabled: this.selectionEnabled,
        onSampleSelected: this.onSampleSelected
      })
        .width('100%')
        .height(125)
        .margin({ top: 5 })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  /** Source: `setTitle(units:)`. */
  private headline(): string {
    const current: LineChartData | null = this.data;
    if (current === null) {
      return this.title;
    }
    return `${this.title}  -  ${unitSymbol(current.yUnit)}-${unitSymbol(current.xUnit)}`
      .toUpperCase();
  }
}
