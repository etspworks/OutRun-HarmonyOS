/*
 * Port of `RelativeMeasurement` (OutRun/Models/Data/RelativeMeasurement.swift:24-70) — a value
 * per unit (pace min/km, speed km/h, energy kcal/km).
 *
 * Formatter objects do not survive the port: Swift configured a DateComponentsFormatter
 * (positional, zero-padded, minutes+seconds) and a NumberFormatter (decimal, 2 fraction digits).
 * The first has no equivalent at all — mm:ss is built here — and the second is intl.NumberFormat.
 * The measurement type and its unit table are the Foundation NSMeasurement port
 * (common/Measurement.ts).
 */
import { i18n, intl } from '@kit.LocalizationKit';
import { Measurement, Unit, unitSymbol, isDurationUnit, convertValue } from '../common/Measurement';

const FRACTION_DIGITS: number = 2;

function decimalString(value: number): string {
  const options: intl.NumberOptions = { style: 'decimal', maximumFractionDigits: FRACTION_DIGITS };
  return new intl.NumberFormat(i18n.System.getSystemLocale(), options).format(value);
}

/** DateComponentsFormatter(.positional, .pad, [.minute, .second]) — "05:30". */
function positionalDuration(seconds: number): string {
  const total: number = Math.floor(Math.abs(seconds));
  const minutes: number = Math.floor(total / 60);
  const rest: number = total % 60;
  const mm: string = minutes < 10 ? `0${minutes}` : `${minutes}`;
  const ss: string = rest < 10 ? `0${rest}` : `${rest}`;
  return `${mm}:${ss}`;
}

export class RelativeMeasurement {
  private primaryMeasurement: Measurement;
  private dividingMeasurement: Measurement;

  constructor(primary: Measurement, dividing: Measurement) {
    this.primaryMeasurement = primary;
    this.dividingMeasurement = dividing;
  }

  /** Source: `convenience init(value:primaryUnit:dividingUnit:)` — divide by one dividing unit. */
  static of(value: number, primaryUnit: Unit, dividingUnit: Unit): RelativeMeasurement {
    return new RelativeMeasurement(new Measurement(value, primaryUnit), new Measurement(1, dividingUnit));
  }

  /** Source: `value` — 0 rather than inf/NaN when the dividing measurement is 0. */
  value(): number {
    const value: number = this.primaryMeasurement.value / this.dividingMeasurement.value;
    return isFinite(value) ? value : 0;
  }

  /** Source: `stringRepresentation` — mm:ss for a duration, else a 2-digit decimal; "--" never happens now (both formatters are total), so the source's fallback is unreachable and dropped. */
  stringRepresentation(): string {
    if (isDurationUnit(this.primaryMeasurement.unit)) {
      const seconds: number = convertValue(this.value(), this.primaryMeasurement.unit, Unit.SECONDS);
      return positionalDuration(seconds);
    }
    return decimalString(this.value());
  }

  /** Source: `stringRepresentationWithUnit`. */
  stringRepresentationWithUnit(): string {
    return `${this.stringRepresentation()} ${this.relativeUnit()}`;
  }

  /** Source: `relativeUnit` — MeasurementFormatter(.providedUnit) on both units, joined by "/". */
  relativeUnit(): string {
    return `${unitSymbol(this.primaryMeasurement.unit)}/${unitSymbol(this.dividingMeasurement.unit)}`;
  }
}
