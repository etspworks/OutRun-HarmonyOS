/*
 * Rule-11 PORT of Charts 3.6.0's LineChartView, rendering half (plan port `port_charts`) — the
 * drawing and gesture side of what common/ChartData.ts computes:
 *   - Charts/LineChartView.swift + BarLineChartViewBase -> the plot area, axes and no-data text
 *   - Renderers/LineChartRenderer.swift                 -> the per-dataset polyline stroke
 *   - Renderers/{XAxisRenderer,YAxisRenderer}.swift      -> the labels and grid lines
 *   - Highlight-on-tap                                   -> closestSelection, via onTouch
 *
 * This is a @Component, NEVER an @Entry page: it is the diagram inside the stats screen, the port
 * of OutRun/Views/Data/LabelledDiagramView.swift. That view's configuration IS the specification
 * here — `leftAxis.enabled = false` (so the value labels sit on the RIGHT), x labels along the
 * bottom, no legend, no chart description, `minOffset = 0`, and `noDataTextColor = .secondaryColor`.
 * The headline label it pairs the chart with is the stats screen's, not this component's.
 *
 * All the geometry and selection MATH is in common/ChartData.ts — a `.ts` cannot import an `.ets`,
 * so the dependency only runs this way, and every computation stays unit-testable outside ArkUI.
 * The three `SectionColorRole`s are resolved to the app's own theme colours here, which is the one
 * place in the port that knows what a colour is.
 *
 * Out of scope, as in common/ChartData.ts: zoom/pan (LabelledDiagramView raises the max scale but
 * the diagram is a 125vp strip whose only interaction is highlight-on-tap), animations, markers,
 * fills, circles and value labels.
 */
import { LineChartData, LineChartDataSet, ChartDataEntry, ChartSelection, PlotArea, PlotPoint,
  axisValues, closestSelection } from '../common/ChartData';
import { SectionColorRole, WorkoutSeriesDataSample } from '../model/WorkoutStatsSeriesSection';
import { localizedString } from '../common/LocalizedStrings';

/** Source: `LabelledDiagramView.diagram`'s fixed height. */
const CHART_HEIGHT: number = 125;
/** Room for the right-hand value labels and the bottom x labels. */
const LABEL_FONT_SIZE: number = 10;
const RIGHT_LABEL_WIDTH: number = 34;
const BOTTOM_LABEL_HEIGHT: number = 14;
/** Charts' `Highlight` line width, and the radius it draws the selected point at. */
const HIGHLIGHT_LINE_WIDTH: number = 1;
const HIGHLIGHT_RADIUS: number = 4;

@Component
export struct LineChart {
  /**
   * The ported chart model — `WorkoutStatsSeries.convertedForChartView` builds it. @Link, not @Prop:
   * @Prop deep-copies, and a copied LineChartData would arrive without its methods; the parent sets
   * this once its series query returns, so the reference must be shared, not duplicated.
   */
  @Link @Watch('onDataChanged') data: LineChartData | null;
  /** Source: `highlightPerTapEnabled` / `highlightPerDragEnabled`, which `disableSelection()` clears. */
  @Prop selectionEnabled: boolean = true;
  /** Source: `LabelledDiagramViewDelegate.didSelect(sample:)` — null where the source has no delegate. */
  onSampleSelected: ((sample: WorkoutSeriesDataSample) => void) | null = null;

  @State private selection: ChartSelection | null = null;

  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);

  /** A new series replaces the whole model, so the canvas has to be repainted by hand. */
  onDataChanged(): void {
    this.selection = null;
    this.draw();
  }

  build() {
    Canvas(this.context)
      .width('100%')
      .height(CHART_HEIGHT)
      .backgroundColor($r('app.color.background_color'))
      .onReady(() => {
        this.draw();
      })
      .onTouch((event: TouchEvent) => {
        this.handleTouch(event);
      })
  }

  /** Source: `SectionType.color` — the three theme roles resolved to this app's colours. */
  private colorFor(role: SectionColorRole): string {
    switch (role) {
      case SectionColorRole.ACCENT: return '#FF9200';
      case SectionColorRole.ACCENT_SWAPPED: return '#FF6D00';
      default: return '#767676';
    }
  }

  /** Source: `ViewPortHandler.contentRect` with `minOffset = 0`, less the two label gutters. */
  private plotArea(data: LineChartData): PlotArea {
    return new PlotArea(0, 0, this.context.width - RIGHT_LABEL_WIDTH,
      this.context.height - BOTTOM_LABEL_HEIGHT, data.xMin, data.xMax, data.yMin, data.yMax);
  }

  private handleTouch(event: TouchEvent): void {
    if (!this.selectionEnabled || event.type !== TouchType.Down) {
      return;
    }
    const data: LineChartData | null = this.data;
    if (data === null || data.entryCount() === 0) {
      return;
    }
    const touch: TouchObject = event.touches[0];
    const picked: ChartSelection | null =
      closestSelection(data, touch.x, touch.y, this.plotArea(data));
    if (picked === null) {
      return;
    }
    this.selection = picked;
    this.draw();
    const sample: WorkoutSeriesDataSample | null = picked.entry.sample;
    const callback: ((sample: WorkoutSeriesDataSample) => void) | null = this.onSampleSelected;
    if (sample !== null && callback !== null) {
      callback(sample);
    }
  }

  /** Source: `ChartViewBase.draw(_:)` — no-data text, then the axes, then each dataset. */
  private draw(): void {
    if (this.context.width === 0 || this.context.height === 0) {
      return; // not laid out yet — onReady() draws the first frame
    }
    this.context.clearRect(0, 0, this.context.width, this.context.height);

    const data: LineChartData | null = this.data;
    if (data === null || data.entryCount() === 0) {
      this.drawNoDataText();
      return;
    }

    const plot: PlotArea = this.plotArea(data);
    this.drawAxes(data, plot);
    for (const set of data.dataSets) {
      this.drawDataSet(set, plot);
    }
    this.drawHighlight(plot);
  }

  /** Source: `ChartViewBase.noDataText`, in `noDataTextColor = .secondaryColor`. */
  private drawNoDataText(): void {
    this.context.fillStyle = '#767676';
    this.context.font = `${LABEL_FONT_SIZE}px sans-serif`;
    this.context.textAlign = 'center';
    this.context.fillText(localizedString('NoDataAvailable'), this.context.width / 2,
      this.context.height / 2);
    this.context.textAlign = 'left';
  }

  /**
   * Source: `YAxisRenderer`/`XAxisRenderer` for the one configuration LabelledDiagramView uses —
   * the left axis is disabled, so the y labels are on the right, and the x labels are at the bottom.
   */
  private drawAxes(data: LineChartData, plot: PlotArea): void {
    this.context.fillStyle = '#767676';
    this.context.strokeStyle = '#40808080';
    this.context.lineWidth = 0.5;
    this.context.font = `${LABEL_FONT_SIZE}px sans-serif`;

    for (const value of axisValues(data.yMin, data.yMax)) {
      const point: PlotPoint = plot.pixelForValues(data.xMin, value);
      this.context.beginPath();
      this.context.moveTo(plot.left, point.y);
      this.context.lineTo(plot.left + plot.width, point.y);
      this.context.stroke();
      this.context.fillText(`${Math.round(value)}`, plot.left + plot.width + 2,
        point.y + LABEL_FONT_SIZE / 3);
    }

    for (const value of axisValues(data.xMin, data.xMax)) {
      const point: PlotPoint = plot.pixelForValues(value, data.yMin);
      this.context.fillText(`${Math.round(value)}`, point.x,
        plot.top + plot.height + BOTTOM_LABEL_HEIGHT - 2);
    }
  }

  /** Source: `LineChartRenderer.drawLinear` — one stroked polyline per dataset, no circles, no values. */
  private drawDataSet(set: LineChartDataSet, plot: PlotArea): void {
    if (set.entries.length === 0) {
      return;
    }
    this.context.strokeStyle = this.colorFor(set.colorRole);
    this.context.lineWidth = set.lineWidth;
    this.context.lineCap = set.lineCap === 'round' ? 'round' : 'butt';
    this.context.beginPath();
    for (let index: number = 0; index < set.entries.length; index++) {
      const entry: ChartDataEntry = set.entries[index];
      const point: PlotPoint = plot.pixelForValues(entry.x, entry.y);
      if (index === 0) {
        this.context.moveTo(point.x, point.y);
      } else {
        this.context.lineTo(point.x, point.y);
      }
    }
    this.context.stroke();
  }

  /** Source: the highlight indicator — the vertical line plus a dot on the selected entry. */
  private drawHighlight(plot: PlotArea): void {
    const picked: ChartSelection | null = this.selection;
    if (picked === null) {
      return;
    }
    const point: PlotPoint = plot.pixelForValues(picked.entry.x, picked.entry.y);
    this.context.strokeStyle = '#767676';
    this.context.lineWidth = HIGHLIGHT_LINE_WIDTH;
    this.context.beginPath();
    this.context.moveTo(point.x, plot.top);
    this.context.lineTo(point.x, plot.top + plot.height);
    this.context.stroke();

    this.context.fillStyle = '#FF9200';
    this.context.beginPath();
    this.context.arc(point.x, point.y, HIGHLIGHT_RADIUS, 0, Math.PI * 2);
    this.context.fill();
  }
}
