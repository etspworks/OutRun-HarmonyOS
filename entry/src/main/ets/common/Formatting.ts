/*
 * Port of the app's four formatting helpers plus `UnitConversion`:
 *   OutRun/Models/Formatting/CustomMeasurementFormatting.swift
 *   OutRun/Models/Formatting/CustomNumberFormatting.swift
 *   OutRun/Models/Formatting/CustomTimeFormatting.swift
 *   OutRun/Models/Formatting/CustomByteFormatting.swift
 *   OutRun/Models/Data/UnitConversion.swift  (+ the Date helpers in OutRun/Extensions/Date.swift)
 *
 * Foundation's NumberFormatter / MeasurementFormatter / DateFormatter / DateComponentsFormatter /
 * ByteCountFormatter map to `@ohos.intl` (intl.NumberFormat / intl.DateTimeFormat). The two things
 * intl cannot do — an arbitrary date PATTERN ("yyyyMMdd", "yyyyMMdd-HHmmss") and a byte count —
 * are built from the date/number components directly.
 *
 * The class shape mirrors the source (static members on CustomXFormatting) because every call site
 * in the app reads that way; Swift's overloaded `string(...)` members become one named member each,
 * ArkTS having no overloads.
 * `dayIdentifier` is NOT re-derived here: DataModelValueGetters.dayIdentifier already owns it.
 */
import { i18n, intl } from '@kit.LocalizationKit';
import { Dimension, Measurement, Unit, convertValue, unitDimension, unitSymbol } from './Measurement';
import { UserPreferences } from './UserPreferences';
import { localizedString } from './LocalizedStrings';
import { DataModelValueGetters } from './DataManager';

/** Source: `CustomMeasurementFormatting.FormattingMeasurementType`. */
export enum FormattingMeasurementType {
  CLOCK = 'CLOCK',
  TIME = 'TIME',
  DISTANCE = 'DISTANCE',
  ALTITUDE = 'ALTITUDE',
  SPEED = 'SPEED',
  ENERGY = 'ENERGY',
  WEIGHT = 'WEIGHT',
  AUTO = 'AUTO'
}

/** Source: `CustomMeasurementFormatting.FormattingRoundingType`. */
export enum FormattingRoundingType {
  WHOLE_NUMBERS = 'WHOLE_NUMBERS',
  ONE_DIGIT = 'ONE_DIGIT',
  TWO_DIGITS = 'TWO_DIGITS',
  FOUR_DIGITS = 'FOUR_DIGITS',
  NONE = 'NONE'
}

function currentLocale(): string {
  try {
    return i18n.System.getSystemLocale();
  } catch (err) {
    return 'en-US';
  }
}

/** `NumberFormatter.maximumFractionDigits` for a rounding increment (1, 0.1, 0.01, 0.0001). */
function fractionDigits(rounding: FormattingRoundingType): number {
  switch (rounding) {
    case FormattingRoundingType.WHOLE_NUMBERS: return 0;
    case FormattingRoundingType.ONE_DIGIT: return 1;
    case FormattingRoundingType.TWO_DIGITS: return 2;
    case FormattingRoundingType.FOUR_DIGITS: return 4;
    default: return 10;
  }
}

function pad(value: number, length: number): string {
  let text: string = `${Math.trunc(Math.abs(value))}`;
  while (text.length < length) {
    text = `0${text}`;
  }
  return text;
}

/** Source: `UnitConversion`. */
export class UnitConversion {
  /** Source: `conversion(of:from:to:)`. */
  static conversion(value: number, from: Unit, to: Unit): number {
    return convertValue(value, from, to);
  }
}

/** Source: `CustomNumberFormatting`. */
export class CustomNumberFormatting {
  /**
   * Source: `number(from:)` — NumberFormatter parsing a user-typed value. The source formatter was
   * locale aware, so a decimal comma is accepted as well as a point.
   */
  static number(text: string | null): number | null {
    if (text === null) {
      return null;
    }
    const cleaned: string = text.trim().split(',').join('.');
    if (cleaned.length === 0) {
      return null;
    }
    // Number() rejects the whole string on any stray character ("6.0.5" -> NaN), where parseFloat
    // would silently take the "6." prefix. Matches NumberFormatter returning nil.
    const value: number = Number(cleaned);
    return Number.isNaN(value) ? null : value;
  }

  /** Source: `string(from:fractionDigits:)`. */
  static string(value: number, digits: number = 2): string | null {
    try {
      const formatter: intl.NumberFormat =
        new intl.NumberFormat(currentLocale(), { style: 'decimal', maximumFractionDigits: digits });
      return formatter.format(value);
    } catch (err) {
      return `${value}`;
    }
  }
}

/** Source: `CustomByteFormatting`. */
export class CustomByteFormatting {
  private static readonly UNITS: string[] = ['KB', 'MB', 'GB', 'TB'];

  /** Source: `string(for:)` — ByteCountFormatter, decimal (base 1000) like its default. */
  static string(bytes: number): string {
    if (bytes < 1000) {
      return `${Math.round(bytes)} bytes`;
    }
    let value: number = bytes / 1000;
    let index: number = 0;
    while (value >= 1000 && index + 1 < CustomByteFormatting.UNITS.length) {
      value = value / 1000;
      index += 1;
    }
    const text: string | null = CustomNumberFormatting.string(value, 1);
    return `${text !== null ? text : value} ${CustomByteFormatting.UNITS[index]}`;
  }
}

/** Source: `CustomTimeFormatting` (+ the private `Date` comparison helpers it relies on). */
export class CustomTimeFormatting {
  /** Source: `dayIDFormat`. */
  static readonly DAY_ID_FORMAT: string = 'yyyyMMdd';

  /** Source: `Date.isSameDay(to:)` — same calendar day, time of day ignored. */
  private static isSameDay(date: Date, compare: Date): boolean {
    return date.getFullYear() === compare.getFullYear() && date.getMonth() === compare.getMonth()
      && date.getDate() === compare.getDate();
  }

  /** Whole days between the two dates' midnights, always positive (source: `compareDaysOnly`). */
  private static dayDistance(date: Date, compare: Date): number {
    const left: number = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const right: number =
      new Date(compare.getFullYear(), compare.getMonth(), compare.getDate()).getTime();
    return Math.round(Math.abs(left - right) / 86400000);
  }

  /** Source: `dayString(forDate:)`. */
  static dayString(date: Date): string {
    const now: Date = new Date();
    if (CustomTimeFormatting.isSameDay(date, now)) {
      return localizedString('Today');
    }
    const distance: number = CustomTimeFormatting.dayDistance(date, now);
    if (distance === 1) {
      return localizedString('Yesterday');
    }
    try {
      if (distance <= 7) {
        return new intl.DateTimeFormat(currentLocale(), { weekday: 'long' }).format(date);
      }
      return new intl.DateTimeFormat(currentLocale(), { dateStyle: 'medium' }).format(date);
    } catch (err) {
      return CustomTimeFormatting.fullDateString(date);
    }
  }

  /** Source: `dayString(forIdentifier:)` — null when the identifier is not a "yyyyMMdd" day. */
  static dayStringForIdentifier(dayIdentifier: string): string | null {
    if (dayIdentifier.length !== 8) {
      return null;
    }
    const year: number = Number.parseInt(dayIdentifier.substring(0, 4), 10);
    const month: number = Number.parseInt(dayIdentifier.substring(4, 6), 10);
    const day: number = Number.parseInt(dayIdentifier.substring(6, 8), 10);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
      return null;
    }
    const date: Date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    return CustomTimeFormatting.dayString(date);
  }

  /** Source: `dayIdentifier(forDate:)` — the one implementation lives in DataManager. */
  static dayIdentifier(date: Date): string {
    return DataModelValueGetters.dayIdentifier(date);
  }

  /** Source: `timeString(forDate:)` — short time of day. */
  static timeString(date: Date): string {
    try {
      return new intl.DateTimeFormat(currentLocale(), { timeStyle: 'short' }).format(date);
    } catch (err) {
      return `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}`;
    }
  }

  /** Source: `backupTimeCode(forDate:)` — "yyyyMMdd-HHmmss", a file-name component. */
  static backupTimeCode(date: Date): string {
    return `${DataModelValueGetters.dayIdentifier(date)}-${pad(date.getHours(), 2)}`
      + `${pad(date.getMinutes(), 2)}${pad(date.getSeconds(), 2)}`;
  }

  /** Source: `fullDateString(forDate:)` — short date and short time. */
  static fullDateString(date: Date): string {
    try {
      return new intl.DateTimeFormat(currentLocale(),
        { dateStyle: 'short', timeStyle: 'short' }).format(date);
    } catch (err) {
      return `${pad(date.getDate(), 2)}.${pad(date.getMonth() + 1, 2)}.${date.getFullYear()} `
        + `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}`;
    }
  }
}

/** Source: `CustomMeasurementFormatting`. */
export class CustomMeasurementFormatting {
  /** Source: `FormattingMeasurementType.init(for:asClock:asAltitude:)`. */
  static typeForUnit(unit: Unit, asClock: boolean = false,
    asAltitude: boolean = false): FormattingMeasurementType {
    switch (unitDimension(unit)) {
      case Dimension.DURATION:
        return asClock ? FormattingMeasurementType.CLOCK : FormattingMeasurementType.TIME;
      case Dimension.LENGTH:
        return asAltitude ? FormattingMeasurementType.ALTITUDE : FormattingMeasurementType.DISTANCE;
      case Dimension.SPEED:
        return FormattingMeasurementType.SPEED;
      case Dimension.ENERGY:
        return FormattingMeasurementType.ENERGY;
      case Dimension.MASS:
        return FormattingMeasurementType.WEIGHT;
      default:
        return FormattingMeasurementType.AUTO;
    }
  }

  /** The unit the user chose for this kind of value, or null when the type has no preference. */
  private static preferredUnit(type: FormattingMeasurementType): Unit | null {
    switch (type) {
      case FormattingMeasurementType.DISTANCE:
        return UserPreferences.distanceMeasurementType.safeValue;
      case FormattingMeasurementType.ALTITUDE:
        return UserPreferences.altitudeMeasurementType.safeValue;
      case FormattingMeasurementType.SPEED:
        return UserPreferences.speedMeasurementType.safeValue;
      case FormattingMeasurementType.ENERGY:
        return UserPreferences.energyMeasurementType.safeValue;
      case FormattingMeasurementType.WEIGHT:
        return UserPreferences.weightMeasurementType.safeValue;
      default:
        return null;
    }
  }

  /** Source: `string(forMeasurement:type:rounding:)`. */
  static string(measurement: Measurement, type: FormattingMeasurementType = FormattingMeasurementType.AUTO,
    rounding: FormattingRoundingType = FormattingRoundingType.TWO_DIGITS): string {
    if (type === FormattingMeasurementType.CLOCK) {
      const seconds: number = Math.round(measurement.converting(Unit.SECONDS).value);
      const hours: number = Math.trunc(seconds / 3600);
      const minutes: number = Math.trunc((seconds % 3600) / 60);
      return `${hours}:${pad(minutes, 2)}:${pad(seconds % 60, 2)}`;
    }
    const preferred: Unit | null = CustomMeasurementFormatting.preferredUnit(type);
    const shown: Measurement = preferred !== null ? measurement.converting(preferred) : measurement;
    const value: string | null =
      CustomNumberFormatting.string(shown.value, fractionDigits(rounding));
    const symbol: string = unitSymbol(shown.unit);
    const text: string = value !== null ? value : `${shown.value}`;
    return symbol.length > 0 ? `${text} ${symbol}` : text;
  }

  /** Source: `string(forUnit:short:)` — the unit on its own, symbol or spelled out. */
  static stringForUnit(unit: Unit, short: boolean = false): string {
    const symbol: string = unitSymbol(unit);
    if (short) {
      return symbol;
    }
    const name: string = localizedString(`Unit.${unit}`);
    return name === `Unit.${unit}` ? symbol : name;
  }
}
