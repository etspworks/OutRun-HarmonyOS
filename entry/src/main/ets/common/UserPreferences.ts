/*
 * UserPreferences — ported from OutRun/Models/Preferences/{UserPreference,UserPreferences,
 * MeasurementUserPreference}.swift and OutRun/Models/Data/UnitConversion.swift.
 *
 * iOS `UserDefaults` maps to `@ohos.data.preferences` (CLAUDE.md rule 10). The source getters
 * and setters are synchronous and are read from UI code on every frame, so the port uses the
 * synchronous preferences API and flushes after every write (a preferences write is not durable
 * until flush()).
 */
import { application } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { hilog } from '@kit.PerformanceAnalysisKit';
import {
  Dimension,
  Unit,
  convertValue,
  standardBigLocalUnit,
  standardBigUnit,
  standardSmallLocalUnit,
  standardUnit,
  unitDimension,
  unitSettingsLabel
} from './Measurement';
import { localizedString } from './LocalizedStrings';
import { Setting, SettingSection } from '../model/SettingSection';
import { SettingsModel } from '../model/SettingsModel';

const DOMAIN: number = 0x0000;
const STORE_NAME: string = 'outrun_user_preferences';
const INITIAL_VALUE_SUFFIX: string = '.initialValueSet';

let cachedStore: preferences.Preferences | null = null;

/** The backing preferences file, or null while no application context is available yet. */
function store(): preferences.Preferences | null {
  if (cachedStore === null) {
    try {
      const options: preferences.Options = { name: STORE_NAME };
      cachedStore = preferences.getPreferencesSync(application.getApplicationContext(), options);
    } catch (err) {
      hilog.error(DOMAIN, 'UserPreferences', 'failed to open preferences: %{public}s',
        JSON.stringify(err));
      cachedStore = null;
    }
  }
  return cachedStore;
}

function flush(target: preferences.Preferences): void {
  target.flush().catch((err: Object): void => {
    hilog.error(DOMAIN, 'UserPreferences', 'flush failed: %{public}s', JSON.stringify(err));
  });
}

function writeValue(key: string, value: preferences.ValueType): void {
  const target: preferences.Preferences | null = store();
  if (target === null) {
    return;
  }
  target.putSync(key, value);
  flush(target);
}

function removeValue(key: string): void {
  const target: preferences.Preferences | null = store();
  if (target === null) {
    return;
  }
  target.deleteSync(key);
  flush(target);
}

function hasValue(key: string): boolean {
  const target: preferences.Preferences | null = store();
  return target === null ? false : target.hasSync(key);
}

/** `UserPreference.Required<Bool>` */
export class BoolPreference {
  readonly key: string;
  readonly defaultValue: boolean;

  constructor(key: string, defaultValue: boolean) {
    this.key = key;
    this.defaultValue = defaultValue;
  }

  get value(): boolean {
    const target: preferences.Preferences | null = store();
    if (target === null || !target.hasSync(this.key)) {
      return this.defaultValue;
    }
    return target.getSync(this.key, this.defaultValue) as boolean;
  }

  set value(newValue: boolean) {
    writeValue(this.key, newValue);
  }

  delete(): void {
    removeValue(this.key);
  }
}

/** `UserPreference.Required<Int>` */
export class NumberPreference {
  readonly key: string;
  readonly defaultValue: number;

  constructor(key: string, defaultValue: number) {
    this.key = key;
    this.defaultValue = defaultValue;
  }

  get value(): number {
    const target: preferences.Preferences | null = store();
    if (target === null || !target.hasSync(this.key)) {
      return this.defaultValue;
    }
    return target.getSync(this.key, this.defaultValue) as number;
  }

  set value(newValue: number) {
    writeValue(this.key, newValue);
  }

  delete(): void {
    removeValue(this.key);
  }
}

/** `UserPreference.Optional<Double>` */
export class OptionalNumberPreference {
  readonly key: string;
  readonly defaultValue: number | null;

  constructor(key: string, defaultValue: number | null = null, initialValue: number | null = null) {
    this.key = key;
    this.defaultValue = defaultValue;
    const initialValueKey: string = key + INITIAL_VALUE_SUFFIX;
    if (initialValue !== null && !hasValue(initialValueKey)) {
      this.value = initialValue;
      writeValue(initialValueKey, true);
    }
  }

  get value(): number | null {
    const target: preferences.Preferences | null = store();
    if (target === null || !target.hasSync(this.key)) {
      return this.defaultValue;
    }
    return target.getSync(this.key, 0) as number;
  }

  set value(newValue: number | null) {
    if (newValue === null) {
      removeValue(this.key);
      return;
    }
    writeValue(this.key, newValue);
  }

  delete(): void {
    removeValue(this.key);
  }
}

/** `UserPreference.Optional<String>` */
export class OptionalStringPreference {
  readonly key: string;
  readonly defaultValue: string | null;

  constructor(key: string, defaultValue: string | null = null) {
    this.key = key;
    this.defaultValue = defaultValue;
  }

  get value(): string | null {
    const target: preferences.Preferences | null = store();
    if (target === null || !target.hasSync(this.key)) {
      return this.defaultValue;
    }
    return target.getSync(this.key, '') as string;
  }

  set value(newValue: string | null) {
    if (newValue === null) {
      removeValue(this.key);
      return;
    }
    writeValue(this.key, newValue);
  }

  delete(): void {
    removeValue(this.key);
  }
}

/**
 * One row of the unit-pick settings model. Implements the shared `Setting` contract so the
 * settings UI renders it like any other row.
 */
export class UnitPreferenceSetting implements Setting {
  kind: string;
  section: SettingSection | null = null;
  usesClosures: boolean = true;
  title: string;
  subTitle: string;
  isSelected: boolean = false;
  model: SettingsModel | null = null;
  private readonly selectAction: () => void;
  private readonly selectedState: () => boolean;
  private readonly subTitleProvider: () => string;

  constructor(kind: string, title: string, selectAction: () => void,
    selectedState: () => boolean, subTitleProvider: () => string,
    model: SettingsModel | null = null) {
    this.kind = kind;
    this.title = title;
    this.selectAction = selectAction;
    this.selectedState = selectedState;
    this.subTitleProvider = subTitleProvider;
    this.model = model;
    this.subTitle = subTitleProvider();
    this.isSelected = selectedState();
  }

  runSelectAction(): void {
    this.selectAction();
    this.updateClosures();
    this.refresh();
  }

  updateClosures(): void {
    this.isSelected = this.selectedState();
    this.subTitle = this.subTitleProvider();
  }

  refresh(): void {
    if (this.section !== null) {
      this.section.refresh();
    }
  }
}

/**
 * `MeasurementUserPreference<UnitType>` — stores the INDEX of the chosen unit inside
 * `possibleValues`, exactly like the source, so an out-of-range stored index falls back to the
 * locale's standard unit.
 */
export class MeasurementUserPreference {
  private readonly userPreference: OptionalNumberPreference;
  readonly possibleValues: Unit[];
  readonly key: string;
  readonly bigUnits: boolean;

  constructor(key: string, possibleValues: Unit[], bigUnits: boolean = true) {
    this.userPreference = new OptionalNumberPreference(key);
    this.possibleValues = possibleValues;
    this.key = key;
    this.bigUnits = bigUnits;
  }

  private dimension(): Dimension {
    return unitDimension(this.possibleValues[0]);
  }

  get value(): Unit | null {
    const raw: number | null = this.userPreference.value;
    const index: number = raw !== null ? raw : -1;
    if (index < 0 || index >= this.possibleValues.length) {
      return null;
    }
    return this.possibleValues[index];
  }

  set value(newValue: Unit | null) {
    if (newValue === null) {
      this.userPreference.value = this.userPreference.defaultValue;
      return;
    }
    const index: number = this.possibleValues.indexOf(newValue);
    this.userPreference.value = index >= 0 ? index : this.userPreference.defaultValue;
  }

  get safeValue(): Unit {
    const chosen: Unit | null = this.value;
    if (chosen !== null) {
      return chosen;
    }
    const local: Unit | null = this.standardLocalValue;
    return local !== null ? local : this.possibleValues[0];
  }

  get standardValue(): Unit | null {
    const dim: Dimension = this.dimension();
    return this.bigUnits ? standardBigUnit(dim) : standardUnit(dim);
  }

  get standardLocalValue(): Unit | null {
    const dim: Dimension = this.dimension();
    return this.bigUnits ? standardBigLocalUnit(dim) : standardSmallLocalUnit(dim);
  }

  /** Converts between the stored standard unit and the user's preferred unit. */
  convert(value: number, toPrefered: boolean, rounded: boolean = true): number {
    const standard: Unit | null = this.standardValue;
    if (standard === null) {
      return -1;
    }
    const prefered: Unit = this.safeValue;
    const sourceUnit: Unit = toPrefered ? standard : prefered;
    const targetUnit: Unit = toPrefered ? prefered : standard;
    const converted: number = convertValue(value, sourceUnit, targetUnit);
    return rounded ? Math.round(converted * 100) / 100 : converted;
  }

  /** The unit-pick row shown in the settings list, plus the model its tap opens. */
  setting(title: string): Setting {
    const selections: Setting[] = [];
    const local: Unit | null = this.standardLocalValue;
    if (local !== null) {
      selections.push(new UnitPreferenceSetting(
        'selection',
        `${localizedString('Standard')} (${unitSettingsLabel(local)})`,
        (): void => {
          this.value = null;
        },
        (): boolean => this.value === null,
        (): string => ''
      ));
    }
    for (const unit of this.possibleValues) {
      selections.push(new UnitPreferenceSetting(
        'selection',
        unitSettingsLabel(unit),
        (): void => {
          this.value = unit;
        },
        (): boolean => this.value === unit,
        (): string => ''
      ));
    }
    const section: SettingSection = new SettingSection(
      localizedString('Settings.UnitPick.Headline'),
      selections,
      localizedString('Settings.UnitPick.Message')
    );
    const model: SettingsModel = new SettingsModel([section], title);
    return new UnitPreferenceSetting(
      'titleSubTitle',
      title,
      (): void => {
      },
      (): boolean => false,
      (): string => unitSettingsLabel(this.safeValue),
      model
    );
  }

  delete(): void {
    this.userPreference.delete();
  }
}

/**
 * The app's stored settings — one entry per `UserDefaults` key the source declares.
 * Exposed as a single instance (`UserPreferences`) rather than a static class because a
 * static member called `name` collides with `Function.name`.
 */
class UserPreferencesStore {
  /** saves if app is set up */
  readonly isSetUp: BoolPreference = new BoolPreference('isSetUp', false);

  /** saves the users name */
  readonly name: OptionalStringPreference = new OptionalStringPreference('name');
  /** saves the users weight in kg */
  readonly weight: OptionalNumberPreference = new OptionalNumberPreference('weight');

  readonly standardWorkoutType: NumberPreference =
    new NumberPreference('standardWorkoutType', 0);
  readonly shouldShowMap: BoolPreference = new BoolPreference('shouldShowMap', true);
  readonly gpsAccuracy: OptionalNumberPreference =
    new OptionalNumberPreference('gpsAccuracy', null, null);
  readonly usePaceForSpeedDisplay: BoolPreference =
    new BoolPreference('usesPaceForRecording', true);
  readonly displayRollingSpeed: BoolPreference =
    new BoolPreference('makeSpeedDisplayRolling', true);

  readonly synchronizeWorkoutsWithAppleHealth: BoolPreference =
    new BoolPreference('savesToAppleHealth', false);
  readonly synchronizeWeightWithAppleHealth: BoolPreference =
    new BoolPreference('synchronizeWeightWithAppleHealth', false);
  readonly automaticallyImportNewHealthWorkouts: BoolPreference =
    new BoolPreference('automaticallyImportNewHealthWorkouts', false);

  readonly distanceMeasurementType: MeasurementUserPreference =
    new MeasurementUserPreference('distanceMeasurementType', [Unit.KILOMETERS, Unit.MILES]);
  readonly altitudeMeasurementType: MeasurementUserPreference =
    new MeasurementUserPreference('altitudeMeasurementType', [Unit.METERS, Unit.FEET], false);
  readonly speedMeasurementType: MeasurementUserPreference =
    new MeasurementUserPreference('speedMeasurementType',
      [Unit.KILOMETERS_PER_HOUR, Unit.MILES_PER_HOUR]);
  readonly energyMeasurementType: MeasurementUserPreference =
    new MeasurementUserPreference('energyMeasurementType', [Unit.KILOJOULES, Unit.KILOCALORIES]);
  readonly weightMeasurementType: MeasurementUserPreference =
    new MeasurementUserPreference('weightMeasurementType', [Unit.KILOGRAMS, Unit.POUNDS]);

  /** `UserDefaults.removePersistentDomain` — wipes every stored setting. */
  reset(): void {
    const target: preferences.Preferences | null = store();
    if (target === null) {
      return;
    }
    target.clearSync();
    flush(target);
  }
}

export const UserPreferences: UserPreferencesStore = new UserPreferencesStore();
