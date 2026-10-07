/*
 * Rule-11 PORT of the Charts 3.6.0 LineChartView path (plan port `port_charts`), from the vendored
 * pod source at input/source/OutRun-1.3/Pods/Charts/Source/Charts:
 *   - Data/Implementations/Standard/ChartDataEntry.swift       -> ChartDataEntry
 *   - Data/Implementations/Standard/ChartDataSet.swift         -> LineChartDataSet.calcMinMax
 *   - Data/Implementations/Standard/LineChartDataSet.swift     -> LineChartDataSet defaults
 *   - Renderers/AxisRendererBase.swift:computeAxisValues       -> axisValues
 *   - Utils/ChartUtils.swift:roundedToNextSignficant           -> roundedToNextSignificant
 *   - Utils/Transformer.swift + ViewPortHandler                -> PlotArea.pixelForValues
 *   - Highlight/ChartHighlighter.swift:closestSelectionDetailByPixel -> closestSelection
 * All of it is pure math, so it lives in `.ts`; components/LineChart.ets draws it on an ArkUI
 * Canvas. (`.ts` cannot import `.ets`, and the dependency only runs that way round.)
 *
 * The PORT SCOPE is what the one app call site uses — OutRun/Views/Data/LabelledDiagramView.swift:
 * multi-dataset line sections, one colour per section, tap-to-select an entry carrying its sample
 * (the stats map screen moves a marker from the selected entry), no circles, no value labels, no
 * legend, no description, the x axis labelled along the bottom and the y axis on the right.
 * The defaults below are that view's: `lineWidth = 3`, `lineCap = round`, circles and values off.
 *
 * DELIBERATELY out of scope, because the app never reaches it: every other chart type (bar, pie,
 * radar, candle, bubble, scatter, horizontal bar), fills/gradients, cubic and stepped line modes,
 * animations, markers, the legend renderer, and pinch/drag zoom-pan — LabelledDiagramView raises
 * `viewPortHandler` max scale to 100 but the diagram is a 125pt-high strip whose only interaction
 * is highlight-on-tap, so the port keeps the highlight and drops the zoom transform. Charts'
 * accessibility layer is also out of scope: ArkUI surfaces that through the component, not here.
 */
import { SectionColorRole, WorkoutSeriesDataSample } from '../model/WorkoutStatsSeriesSection';
import { Unit } from './Measurement';

/** Charts' `minSelectionDistance` for a line chart (`maxHighlightDistance`, in vp). */
const MAX_HIGHLIGHT_DISTANCE: number = 500;
/** Charts' `AxisBase.labelCount` default. */
const DEFAULT_LABEL_COUNT: number = 6;

/** Source: `ChartDataEntry` — an x/y pair plus the opaque `data` payload the selection hands back. */
export class ChartDataEntry {
  readonly x: number;
  readonly y: number;
  /** Source: `ChartDataEntry.data` — the sample this point was built from, or null. */
  readonly sample: WorkoutSeriesDataSample | null;

  constructor(x: number, y: number, sample: WorkoutSeriesDataSample | null) {
    this.x = x;
    this.y = y;
    this.sample = sample;
  }
}

/** Source: `LineChartDataSet`, reduced to the properties LabelledDiagramView sets. */
export class LineChartDataSet {
  readonly entries: ChartDataEntry[];
  readonly colorRole: SectionColorRole;
  lineWidth: number = 3;
  drawCirclesEnabled: boolean = false;
  drawValuesEnabled: boolean = false;
  /** Source: `set.lineCapType = .round`. */
  lineCap: string = 'round';

  xMin: number = 0;
  xMax: number = 0;
  yMin: number = 0;
  yMax: number = 0;

  constructor(entries: ChartDataEntry[], colorRole: SectionColorRole) {
    this.entries = entries;
    this.colorRole = colorRole;
    this.calcMinMax();
  }

  /** Source: `ChartDataSet.calcMinMax()` — the four bounds, left untouched when the set is empty. */
  calcMinMax(): void {
    if (this.entries.length === 0) {
      return;
    }
    let xMin: number = this.entries[0].x;
    let xMax: number = this.entries[0].x;
    let yMin: number = this.entries[0].y;
    let yMax: number = this.entries[0].y;
    for (const entry of this.entries) {
      if (entry.x < xMin) {
        xMin = entry.x;
      }
      if (entry.x > xMax) {
        xMax = entry.x;
      }
      if (entry.y < yMin) {
        yMin = entry.y;
      }
      if (entry.y > yMax) {
        yMax = entry.y;
      }
    }
    this.xMin = xMin;
    this.xMax = xMax;
    this.yMin = yMin;
    this.yMax = yMax;
  }

  /**
   * Source: `ChartDataSet.entryIndex(x:closestToY:rounding:)` reduced to `.closest` with no y
   * tie-break, which is what the highlighter asks of a line set: the index nearest in x, -1 when
   * the set is empty.
   */
  closestEntryIndex(x: number): number {
    let best: number = -1;
    let bestDistance: number = Number.MAX_VALUE;
    for (let i: number = 0; i < this.entries.length; i++) {
      const distance: number = Math.abs(this.entries[i].x - x);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return best;
  }
}

/** Source: `LineChartData` — the sets plus the two units the headline label prints. */
export class LineChartData {
  readonly dataSets: LineChartDataSet[];
  readonly xUnit: Unit;
  readonly yUnit: Unit;

  xMin: number = 0;
  xMax: number = 0;
  yMin: number = 0;
  yMax: number = 0;

  constructor(dataSets: LineChartDataSet[], xUnit: Unit, yUnit: Unit) {
    this.dataSets = dataSets;
    this.xUnit = xUnit;
    this.yUnit = yUnit;
    this.calcMinMax();
  }

  /** Source: `ChartData.calcMinMax()` — the union of the sets' bounds. */
  calcMinMax(): void {
    let seen: boolean = false;
    let xMin: number = 0;
    let xMax: number = 0;
    let yMin: number = 0;
    let yMax: number = 0;
    for (const set of this.dataSets) {
      if (set.entries.length === 0) {
        continue;
      }
      if (!seen) {
        seen = true;
        xMin = set.xMin;
        xMax = set.xMax;
        yMin = set.yMin;
        yMax = set.yMax;
        continue;
      }
      xMin = Math.min(xMin, set.xMin);
      xMax = Math.max(xMax, set.xMax);
      yMin = Math.min(yMin, set.yMin);
      yMax = Math.max(yMax, set.yMax);
    }
    this.xMin = xMin;
    this.xMax = xMax;
    this.yMin = yMin;
    this.yMax = yMax;
  }

  /** Source: `ChartData.entryCount` — `noDataText` is drawn when this is 0. */
  entryCount(): number {
    let count: number = 0;
    for (const set of this.dataSets) {
      count += set.entries.length;
    }
    return count;
  }
}

export class PlotPoint {
  readonly x: number;
  readonly y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

/**
 * Source: `ViewPortHandler` + `Transformer.pixelForValues(x:y:)`, without the zoom/pan matrix —
 * LabelledDiagramView sets `minOffset = 0`, so the content rectangle is the whole canvas less the
 * room the axis labels need, and the value range maps onto it linearly. y is inverted because
 * canvas y grows downward.
 */
export class PlotArea {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;

  constructor(left: number, top: number, width: number, height: number, xMin: number, xMax: number,
    yMin: number, yMax: number) {
    this.left = left;
    this.top = top;
    this.width = width;
    this.height = height;
    this.xMin = xMin;
    this.xMax = xMax;
    this.yMin = yMin;
    this.yMax = yMax;
  }

  pixelForValues(x: number, y: number): PlotPoint {
    const xRange: number = this.xMax - this.xMin;
    const yRange: number = this.yMax - this.yMin;
    const xFraction: number = xRange === 0 ? 0.5 : (x - this.xMin) / xRange;
    const yFraction: number = yRange === 0 ? 0.5 : (y - this.yMin) / yRange;
    return new PlotPoint(this.left + xFraction * this.width,
      this.top + this.height - yFraction * this.height);
  }

  /** The value an x pixel stands for — the highlighter needs the touch in value space. */
  valueForPixelX(pixelX: number): number {
    if (this.width === 0) {
      return this.xMin;
    }
    return this.xMin + ((pixelX - this.left) / this.width) * (this.xMax - this.xMin);
  }
}

/** Source: `Highlight` — which entry the tap picked. */
export class ChartSelection {
  readonly dataSetIndex: number;
  readonly entryIndex: number;
  readonly entry: ChartDataEntry;

  constructor(dataSetIndex: number, entryIndex: number, entry: ChartDataEntry) {
    this.dataSetIndex = dataSetIndex;
    this.entryIndex = entryIndex;
    this.entry = entry;
  }
}

/**
 * Source: `ChartHighlighter.getHighlight` + `closestSelectionDetailByPixel` — take each set's entry
 * closest in x, then keep the one whose PIXEL distance to the touch is smallest, rejecting
 * everything beyond `maxDistance`.
 */
export function closestSelection(data: LineChartData, touchX: number, touchY: number,
  plot: PlotArea, maxDistance: number = MAX_HIGHLIGHT_DISTANCE): ChartSelection | null {
  const touchValueX: number = plot.valueForPixelX(touchX);
  let best: ChartSelection | null = null;
  let bestDistance: number = maxDistance;

  for (let setIndex: number = 0; setIndex < data.dataSets.length; setIndex++) {
    const set: LineChartDataSet = data.dataSets[setIndex];
    const entryIndex: number = set.closestEntryIndex(touchValueX);
    if (entryIndex < 0) {
      continue;
    }
    const entry: ChartDataEntry = set.entries[entryIndex];
    const pixel: PlotPoint = plot.pixelForValues(entry.x, entry.y);
    const dx: number = touchX - pixel.x;
    const dy: number = touchY - pixel.y;
    const distance: number = Math.sqrt(dx * dx + dy * dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = new ChartSelection(setIndex, entryIndex, entry);
    }
  }
  return best;
}

/** Source: `Double.roundedToNextSignficant()` (Utils/ChartUtils.swift:83-96), spelling fixed. */
function roundedToNextSignificant(value: number): number {
  if (!isFinite(value) || isNaN(value) || value === 0) {
    return value;
  }
  const d: number = Math.ceil(Math.log10(value < 0 ? -value : value));
  const magnitude: number = Math.pow(10, 1 - Math.trunc(d));
  return Math.round(value * magnitude) / magnitude;
}

/**
 * Source: `AxisRendererBase.computeAxisValues(min:max:)`, the branch this app takes (no forced
 * label count, no centered labels, no granularity): a "nice" interval, then every multiple of it
 * inside the range.
 */
export function axisValues(min: number, max: number,
  labelCount: number = DEFAULT_LABEL_COUNT): number[] {
  const range: number = Math.abs(max - min);
  if (labelCount === 0 || range <= 0 || !isFinite(range)) {
    return [];
  }

  let interval: number = roundedToNextSignificant(range / labelCount);
  const intervalMagnitude: number = roundedToNextSignificant(Math.pow(10, Math.trunc(Math.log10(interval))));
  const intervalSigDigit: number = Math.trunc(interval / intervalMagnitude);
  if (intervalSigDigit > 5) {
    // one order of magnitude higher, to avoid intervals like 0.9 or 90
    const floored: number = Math.floor(10 * intervalMagnitude);
    interval = floored === 0 ? interval : floored;
  }
  if (interval === 0) {
    return [0];
  }

  const first: number = Math.ceil(min / interval) * interval;
  const last: number = Math.floor(max / interval) * interval;
  const entries: number[] = [];
  for (let value: number = first; value <= last + interval * 0.5; value += interval) {
    entries.push(value);
  }
  return entries;
}
