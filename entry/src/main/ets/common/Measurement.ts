/*
 * Rule-11 PORT of Foundation's measurement stack (plan port
 * `port_foundation_measurementformatter_numberformatter_dateformatter`, the `NSMeasurement` /
 * `Unit` half) plus the app's own `UnitConversion` (OutRun/Models/Data/UnitConversion.swift),
 * `UnitCount` (OutRun/Extensions/UnitCount.swift) and the `StandardizedUnit` protocol
 * (OutRun/Extensions/Units.swift:24-133).
 *
 * WHY a port and not `intl`: `NSMeasurement` is a first-class MODEL type in this app — every
 * `WorkoutStats` field, `LabelledDataView.value` and `RelativeMeasurement` operand is one — and
 * `intl.NumberFormat` has no unit-aware value type at all. So the value+unit pair and the
 * conversion table are ported here; only the *string* side goes over `intl`, in common/Formatting.ts.
 *
 * The unit table is Foundation's: every unit converts through its dimension's SI base
 * (metre, second, metre/second, joule, kilogram) by a constant coefficient, which is what
 * `Unit.converter` holds for every unit this app uses. `UnitSpeed(symbol: "ft/s", ...)`
 * (Units.swift:81) is a unit the source CONSTRUCTS rather than names, so it is in the table too.
 *
 * Deliberately NOT ported: Foundation's `UnitConverter` subclassing (only linear converters are
 * reachable from this app), `Measurement` arithmetic operators (unused), and `MeasurementFormatter`
 * — that is common/Formatting.ts (plan-assigned to a later batch), over `intl.NumberFormat`.
 *
 * `UnitEnergy.standardUnit` is KILOCALORIES, not the SI base joule (Units.swift:85-89): the app's
 * "standard" unit is its own storage choice per dimension, a separate notion from the conversion
 * base, so both live here side by side.
 */
import { i18n } from '@kit.LocalizationKit';

/** Source: the `Unit` subclasses this app names — `UnitLength`, `UnitDuration`, `UnitSpeed`, `UnitEnergy`, `UnitMass`, `UnitCount`. */
export enum Dimension {
  LENGTH = 'LENGTH',
  DURATION = 'DURATION',
  SPEED = 'SPEED',
  ENERGY = 'ENERGY',
  MASS = 'MASS',
  COUNT = 'COUNT'
}

/** Source: every `Unit` constant this app references, flattened into one enum. */
export enum Unit {
  METERS = 'METERS',
  KILOMETERS = 'KILOMETERS',
  FEET = 'FEET',
  MILES = 'MILES',
  SECONDS = 'SECONDS',
  MINUTES = 'MINUTES',
  HOURS = 'HOURS',
  METERS_PER_SECOND = 'METERS_PER_SECOND',
  KILOMETERS_PER_HOUR = 'KILOMETERS_PER_HOUR',
  MILES_PER_HOUR = 'MILES_PER_HOUR',
  FEET_PER_SECOND = 'FEET_PER_SECOND',
  JOULES = 'JOULES',
  CALORIES = 'CALORIES',
  KILOCALORIES = 'KILOCALORIES',
  KILOJOULES = 'KILOJOULES',
  KILOGRAMS = 'KILOGRAMS',
  GRAMS = 'GRAMS',
  POUNDS = 'POUNDS',
  OUNCES = 'OUNCES',
  COUNT = 'COUNT'
}

/** One row of Foundation's unit table: the dimension, the symbol, and the coefficient to the SI base. */
class UnitSpec {
  readonly dimension: Dimension;
  readonly symbol: string;
  readonly coefficient: number;

  constructor(dimension: Dimension, symbol: string, coefficient: number) {
    this.dimension = dimension;
    this.symbol = symbol;
    this.coefficient = coefficient;
  }
}

const SPECS: Map<Unit, UnitSpec> = new Map<Unit, UnitSpec>([
  [Unit.METERS, new UnitSpec(Dimension.LENGTH, 'm', 1)],
  [Unit.KILOMETERS, new UnitSpec(Dimension.LENGTH, 'km', 1000)],
  [Unit.FEET, new UnitSpec(Dimension.LENGTH, 'ft', 0.3048)],
  [Unit.MILES, new UnitSpec(Dimension.LENGTH, 'mi', 1609.344)],
  [Unit.SECONDS, new UnitSpec(Dimension.DURATION, 's', 1)],
  [Unit.MINUTES, new UnitSpec(Dimension.DURATION, 'min', 60)],
  [Unit.HOURS, new UnitSpec(Dimension.DURATION, 'h', 3600)],
  [Unit.METERS_PER_SECOND, new UnitSpec(Dimension.SPEED, 'm/s', 1)],
  [Unit.KILOMETERS_PER_HOUR, new UnitSpec(Dimension.SPEED, 'km/h', 0.2777777777777778)],
  [Unit.MILES_PER_HOUR, new UnitSpec(Dimension.SPEED, 'mph', 0.44704)],
  [Unit.FEET_PER_SECOND, new UnitSpec(Dimension.SPEED, 'ft/s', 0.3048)],
  [Unit.JOULES, new UnitSpec(Dimension.ENERGY, 'J', 1)],
  [Unit.CALORIES, new UnitSpec(Dimension.ENERGY, 'cal', 4.184)],
  [Unit.KILOCALORIES, new UnitSpec(Dimension.ENERGY, 'kcal', 4184)],
  [Unit.KILOJOULES, new UnitSpec(Dimension.ENERGY, 'kJ', 1000)],
  [Unit.KILOGRAMS, new UnitSpec(Dimension.MASS, 'kg', 1)],
  [Unit.GRAMS, new UnitSpec(Dimension.MASS, 'g', 0.001)],
  [Unit.POUNDS, new UnitSpec(Dimension.MASS, 'lb', 0.45359237)],
  [Unit.OUNCES, new UnitSpec(Dimension.MASS, 'oz', 0.028349523125)],
  [Unit.COUNT, new UnitSpec(Dimension.COUNT, '', 1)]
]);

function spec(unit: Unit): UnitSpec {
  const found: UnitSpec | undefined = SPECS.get(unit);
  if (found === undefined) {
    throw new Error(`Measurement: no unit table entry for ${unit}`);
  }
  return found;
}

/** Source: `Unit.symbol` — what `MeasurementFormatter(.providedUnit)` prints after the value. */
export function unitSymbol(unit: Unit): string {
  return spec(unit).symbol;
}

/**
 * The spelling the SETTINGS list uses for a unit, which is not always the symbol the stats
 * tiles use: the source's own capture shows "Altitude Unit / meters" and "Speed Unit / km/hour"
 * beside "Distance Unit / km", "Energy Unit / kcal" and "Weight Unit / kg", while the workout
 * detail tiles show "5 m". Only those two differ in anything the capture recorded, so only those
 * two are overridden here; every other unit keeps its symbol.
 * ponytail: capture-derived, two entries. Extend it if a later capture shows another long form.
 */
const SETTINGS_LABELS: Map<Unit, string> = new Map<Unit, string>([
  [Unit.METERS, 'meters'],
  [Unit.KILOMETERS_PER_HOUR, 'km/hour']
]);

/** The unit label a settings row shows. Falls back to the symbol. */
export function unitSettingsLabel(unit: Unit): string {
  const label: string | undefined = SETTINGS_LABELS.get(unit);
  return label !== undefined ? label : unitSymbol(unit);
}

/** The dimension a unit belongs to; only units of one dimension convert into each other. */
export function unitDimension(unit: Unit): Dimension {
  return spec(unit).dimension;
}

/** True for `UnitDuration` — `RelativeMeasurement` formats those as mm:ss instead of a decimal. */
export function isDurationUnit(unit: Unit): boolean {
  return spec(unit).dimension === Dimension.DURATION;
}

/** Source: `UnitConversion.conversion(of:from:to:)`. */
export function convertValue(value: number, from: Unit, to: Unit): number {
  const source: UnitSpec = spec(from);
  const target: UnitSpec = spec(to);
  if (source.dimension !== target.dimension) {
    throw new Error(`Measurement: cannot convert ${from} to ${to} (${source.dimension} vs ${target.dimension})`);
  }
  if (from === to) {
    return value;
  }
  return (value * source.coefficient) / target.coefficient;
}

/** Source: `Locale.current.usesMetricSystem` — the three regions that are not metric. */
const IMPERIAL_REGIONS: string[] = ['US', 'LR', 'MM'];

function usesMetricSystem(): boolean {
  try {
    return IMPERIAL_REGIONS.indexOf(i18n.System.getSystemRegion().toUpperCase()) === -1;
  } catch (err) {
    return true;
  }
}

/** Source: `StandardizedUnit.standardUnit` (Units.swift) — the unit each dimension is STORED in. */
export function standardUnit(dimension: Dimension): Unit {
  switch (dimension) {
    case Dimension.LENGTH: return Unit.METERS;
    case Dimension.DURATION: return Unit.SECONDS;
    case Dimension.SPEED: return Unit.METERS_PER_SECOND;
    case Dimension.ENERGY: return Unit.KILOCALORIES;
    case Dimension.MASS: return Unit.KILOGRAMS;
    default: return Unit.COUNT;
  }
}

/** Source: `StandardizedUnit.standardBigUnit`. */
export function standardBigUnit(dimension: Dimension): Unit {
  switch (dimension) {
    case Dimension.LENGTH: return Unit.KILOMETERS;
    case Dimension.SPEED: return Unit.KILOMETERS_PER_HOUR;
    default: return standardUnit(dimension);
  }
}

/** Source: `StandardizedUnit.standardBigLocalUnit` — the imperial variant where the locale is imperial. */
export function standardBigLocalUnit(dimension: Dimension): Unit {
  const metric: boolean = usesMetricSystem();
  switch (dimension) {
    case Dimension.LENGTH: return metric ? Unit.KILOMETERS : Unit.MILES;
    case Dimension.SPEED: return metric ? Unit.KILOMETERS_PER_HOUR : Unit.MILES_PER_HOUR;
    case Dimension.MASS: return metric ? Unit.KILOGRAMS : Unit.POUNDS;
    default: return standardUnit(dimension);
  }
}

/** Source: `StandardizedUnit.standardSmallLocalUnit`. */
export function standardSmallLocalUnit(dimension: Dimension): Unit {
  const metric: boolean = usesMetricSystem();
  switch (dimension) {
    case Dimension.LENGTH: return metric ? Unit.METERS : Unit.FEET;
    case Dimension.SPEED: return metric ? Unit.METERS_PER_SECOND : Unit.FEET_PER_SECOND;
    case Dimension.ENERGY: return Unit.CALORIES;
    case Dimension.MASS: return metric ? Unit.GRAMS : Unit.OUNCES;
    default: return Unit.COUNT;
  }
}

/** Source: `NSMeasurement` — a value in a unit. Immutable, exactly as the source uses it. */
export class Measurement {
  readonly value: number;
  readonly unit: Unit;

  constructor(value: number, unit: Unit) {
    this.value = value;
    this.unit = unit;
  }

  /** Source: `NSMeasurement.converting(to:)`. */
  converting(to: Unit): Measurement {
    return new Measurement(convertValue(this.value, this.unit, to), to);
  }

  /** Source: `NSMeasurement.doubleValue`. */
  doubleValue(): number {
    return this.value;
  }
}
