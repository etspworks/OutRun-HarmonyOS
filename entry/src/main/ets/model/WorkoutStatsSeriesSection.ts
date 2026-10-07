/*
 * Port of `WorkoutStatsSeriesSection`
 * (OutRun/Models/Workout/Stats/WorkoutStatsSeriesSection.swift:22-43).
 *
 * One contiguous run of samples in a stats series, together with what kind of run it is — that is
 * what gives the altitude/speed/heart-rate diagrams their per-section colour.
 * `SectionType` was a Swift enum with an associated `Bool` on one case, so it is a class here, the
 * same shape model/WorkoutListSortType.ts uses: `kind` plus `isEven` for SEGMENT_OR_LAP.
 * `color` returned a `UIColor` (.accentColor / .secondaryColor / .accentColorSwapped). A model must
 * not resolve app theme colours, so it returns the ROLE and components/LineChart.ets maps the role
 * to the resource — which is also what keeps the diagram's colours in one place.
 * `data` was an array of `(x: NSMeasurement, y: NSMeasurement)` tuples; ArkTS has no tuple type, so
 * it is an array of SeriesDataPoint.
 */
import { Measurement } from '../common/Measurement';
import { TempWorkoutRouteDataSample } from './TempWorkoutRouteDataSample';
import { TempWorkoutHeartRateDataSample } from './TempWorkoutHeartRateDataSample';

/**
 * Source: `TempWorkoutSeriesDataSampleType` — the protocol the route and heart-rate staging types
 * both conform to. ArkTS is nominally typed and neither class declares a conformance, so the
 * protocol is a union of the two concrete types it is ever satisfied by.
 */
export type WorkoutSeriesDataSample = TempWorkoutRouteDataSample | TempWorkoutHeartRateDataSample;

export enum SectionKind {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  SEGMENT_OR_LAP = 'SEGMENT_OR_LAP'
}

/** Source: `SectionType.color` — the three theme roles the diagram draws a section in. */
export enum SectionColorRole {
  ACCENT = 'ACCENT',
  SECONDARY = 'SECONDARY',
  ACCENT_SWAPPED = 'ACCENT_SWAPPED'
}

export class SectionType {
  readonly kind: SectionKind;
  /** Source: the `segmentOrLap(Bool)` associated value — alternating segments swap the accent. */
  readonly isEven: boolean;

  constructor(kind: SectionKind, isEven: boolean) {
    this.kind = kind;
    this.isEven = isEven;
  }

  static active(): SectionType {
    return new SectionType(SectionKind.ACTIVE, false);
  }

  static paused(): SectionType {
    return new SectionType(SectionKind.PAUSED, false);
  }

  static segmentOrLap(isEven: boolean): SectionType {
    return new SectionType(SectionKind.SEGMENT_OR_LAP, isEven);
  }

  /** Source: `Equatable` — ShareManager selects `where section.type == .active` on this. */
  equals(other: SectionType): boolean {
    return this.kind === other.kind && this.isEven === other.isEven;
  }

  /** Source: `color`, as the theme ROLE rather than a resolved UIColor. */
  colorRole(): SectionColorRole {
    switch (this.kind) {
      case SectionKind.ACTIVE: return SectionColorRole.ACCENT;
      case SectionKind.PAUSED: return SectionColorRole.SECONDARY;
      default: return this.isEven ? SectionColorRole.ACCENT : SectionColorRole.ACCENT_SWAPPED;
    }
  }
}

/** Source: one `(x: NSMeasurement, y: NSMeasurement)` element of `data`. */
export class SeriesDataPoint {
  readonly x: Measurement;
  readonly y: Measurement;

  constructor(x: Measurement, y: Measurement) {
    this.x = x;
    this.y = y;
  }
}

export class WorkoutStatsSeriesSection {
  readonly type: SectionType;
  readonly data: SeriesDataPoint[];
  associatedDataSamples: WorkoutSeriesDataSample[];

  constructor(type: SectionType, data: SeriesDataPoint[],
    associatedDataSamples: WorkoutSeriesDataSample[]) {
    this.type = type;
    this.data = data;
    this.associatedDataSamples = associatedDataSamples;
  }
}
