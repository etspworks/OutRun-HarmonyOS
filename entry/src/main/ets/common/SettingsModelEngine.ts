/*
 * Port of the settings CONTENT of `SettingsModel` (OutRun/Models/Settings/SettingsModel.swift:
 * 80-613) plus the setting kinds it builds from (OutRun/Models/Settings/Setting Models/*.swift,
 * OutRun/Protocols/Setting.swift).
 *
 * model/SettingsModel.ts + model/SettingSection.ts own the TABLE (title, sections, indexed access);
 * everything here reads UserPreferences / DataManager / the health+backup services or raises an
 * alert, which is service work — hence this module, which the settings page imports.
 *
 * Two things the source got from UIKit and this layer cannot:
 *   - `selectAction(setting, controller, cell)` had the presenting view controller. A .ts module
 *     cannot push a page, so a row that leaves the settings list writes a NAVIGATION REQUEST into
 *     AppStorage (SETTINGS_NAVIGATION_KEY, value "<screenId>" or "<screenId>:<param>") and the
 *     settings page routes it; a row that opens a nested settings TABLE carries its `model`, like
 *     UserPreferences' unit rows already do.
 *   - UIApplication.open(url) needs an ability context: the page/ability registers one through
 *     `setSettingsContext` and links open over UIAbilityContext.openLink.
 * Rendering is by `kind` ('title' | 'titleSubTitle' | 'switch' | 'selection' | 'button' |
 * 'textInput'), matching the kinds UserPreferences.UnitPreferenceSetting already emits.
 *
 * The four managers the rows reach (health store, permissions, backup, share) are NOT imported
 * here: each needs the page's UI context, so the page passes them in as `SettingsActions`.
 *
 * Apple Health: HMS Health Service Kit is not available to this build (registered
 * platform-capability substitution), so the section stays and its sync actions run against the
 * app's OWN local store through HealthStoreManager. `HealthObserver.setupObservers` is declared
 * out of scope in the plan (no HKAnchoredObjectQuery equivalent), so the source's calls to it are
 * deliberately absent.
 */
import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { qaFault } from './QaHooks';
import { Setting, SettingSection } from '../model/SettingSection';
import { SettingsModel } from '../model/SettingsModel';
import { Contributor } from '../model/Contributor';
import { WorkoutType, workoutTypeAllCases, workoutTypeDescription, workoutTypeFromRaw }
  from '../model/WorkoutType';
import { Measurement, Unit, unitSymbol } from './Measurement';
import { UserPreferences } from './UserPreferences';
import { localizedString } from './LocalizedStrings';
import { CustomNumberFormatting } from './Formatting';
import { Config } from './Config';
import { Contribution } from './Contribution';
import { DataManager } from './DataManager';
import { showConfirmAlert, showErrorAlert, showInfoAlert } from './AlertDialogs';
import { hideLoadingOverlay, showLoadingOverlay } from './LoadingOverlay';

/**
 * The manager calls the settings rows make. Supplied by the settings PAGE, because every one of
 * them needs the UI/UIAbility context a pure .ts module does not have: the system share sheet
 * (ShareManager), the document picker (BackupManager), the permission request (PermissionManager)
 * and the health store the first two write through (HealthStoreManager). The rows, their order,
 * their alerts and the loading overlay stay here; only the manager invocation is the caller's.
 */
export interface SettingsActions {
  /** Source: the weight row's `HealthStoreManager.syncWeight(...)`. */
  syncWeight: (weight: Measurement) => Promise<boolean>;
  /** Source: the health switches' `PermissionManager.checkHealthPermission()`. */
  requestHealthPermission: () => Promise<boolean>;
  /** Source: the SyncAll button. `null` means the sync failed. */
  syncAllWorkouts: () => Promise<boolean | null>;
  /** Source: the CreateBackup row's `ShareManager.exportBackupAlertAction(nil)`. */
  createBackup: () => Promise<void>;
  /** Source: the ImportBackupData row's `BackupManager.importBackup()`. */
  importBackup: () => Promise<boolean>;
  /** Source: the DeleteAllData button's health half. */
  deleteAllHealthWorkouts: () => Promise<boolean>;
}

const DOMAIN: number = 0x0000;
const TAG: string = 'SettingsModelEngine';

/** A page leaving the settings list is requested through this AppStorage key. */
export const SETTINGS_NAVIGATION_KEY: string = 'settingsNavigationRequest';

/* Team decision 2026-10-07: View Source Code opens the HarmonyOS port's own repository. */
const SOURCE_CODE_URL: string = 'https://github.com/etspworks/OutRun-HarmonyOS';

let abilityContext: common.UIAbilityContext | null = null;

/** Registered by the settings page (or EntryAbility) so link rows can open a URL. */
export function setSettingsContext(context: common.UIAbilityContext): void {
  abilityContext = context;
}

/**
 * Source: `controller.show(...)` / `showDetailViewController(...)` — the row asks for a page.
 * The settings page maps the screen id to its route.
 */
export function requestNavigation(screenId: string, param: string | null = null): void {
  AppStorage.setOrCreate<string>(SETTINGS_NAVIGATION_KEY,
    param === null ? screenId : `${screenId}:${param}`);
}

/** Source: `UIApplication.shared.open(url) { success in ... }`. */
async function openUrl(url: string, errorMessageKey: string): Promise<void> {
  const context: common.UIAbilityContext | null = abilityContext;
  if (context === null) {
    await showErrorAlert(localizedString(errorMessageKey));
    return;
  }
  try {
    const isMail: boolean = url.startsWith('mailto:');
    if ((qaFault('noMailHandler') && isMail) || (qaFault('noUrlHandler') && !isMail)) {
      // QA fault: behave as a device with no app registered for this link (mail app / browser).
      throw new Error('QA fault: no app handles ' + url);
    }
    await context.openLink(url);
  } catch (err) {
    hilog.error(DOMAIN, TAG, 'failed to open %{public}s', url);
    await showErrorAlert(localizedString(errorMessageKey));
  }
}

function report(err: Object): void {
  hilog.error(DOMAIN, TAG, 'settings action failed: %{public}s', JSON.stringify(err));
}

/** Shared behaviour of every setting kind (source: `protocol Setting` + its `extension`). */
abstract class BaseSetting implements Setting {
  kind: string;
  section: SettingSection | null = null;
  usesClosures: boolean;
  title: string;
  isEnabled: boolean;
  private readonly titleProvider: () => string;
  private readonly enabledProvider: () => boolean;

  constructor(kind: string, titleProvider: () => string, usesClosures: boolean = true,
    enabledProvider: () => boolean = (): boolean => true) {
    this.kind = kind;
    this.titleProvider = titleProvider;
    this.enabledProvider = enabledProvider;
    this.usesClosures = usesClosures;
    this.title = titleProvider();
    this.isEnabled = enabledProvider();
  }

  runSelectAction(): void {
  }

  /** Source: `updateClosures()` — recompute what the closures produce; skipped for static rows. */
  updateClosures(): void {
    if (!this.usesClosures) {
      return;
    }
    this.title = this.titleProvider();
    this.isEnabled = this.enabledProvider();
  }

  /** Source: the `Setting` extension's `refresh()`. */
  refresh(): void {
    if (this.section !== null) {
      this.section.refresh();
    }
  }
}

/** Source: `TitleSetting` — a tappable row; `doesRedirect` draws the chevron. */
export class TitleSetting extends BaseSetting {
  readonly doesRedirect: boolean;
  protected readonly selectAction: (() => void) | null;

  constructor(titleProvider: () => string, selectAction: (() => void) | null = null,
    doesRedirect: boolean = false, usesClosures: boolean = true,
    enabledProvider: () => boolean = (): boolean => true, kind: string = 'title') {
    super(kind, titleProvider, usesClosures, enabledProvider);
    this.selectAction = selectAction;
    this.doesRedirect = doesRedirect;
  }

  /** Source: `runSelectAction(controller:)`, gated on `isEnabled` as `ButtonSetting` was. */
  runSelectAction(): void {
    if (this.isEnabled && this.selectAction !== null) {
      this.selectAction();
    }
  }
}

/** Source: `TitleSubTitleSetting` — a row with a secondary value, optionally opening a submodel. */
export class TitleSubTitleSetting extends TitleSetting {
  subTitle: string;
  readonly model: SettingsModel | null;
  private readonly subTitleProvider: () => string;

  constructor(titleProvider: () => string, subTitleProvider: () => string,
    selectAction: (() => void) | null = null, doesRedirect: boolean = false,
    model: SettingsModel | null = null, usesClosures: boolean = true) {
    super(titleProvider, selectAction, doesRedirect, usesClosures,
      (): boolean => true, 'titleSubTitle');
    this.subTitleProvider = subTitleProvider;
    this.subTitle = subTitleProvider();
    this.model = model;
  }

  updateClosures(): void {
    super.updateClosures();
    if (this.usesClosures) {
      this.subTitle = this.subTitleProvider();
    }
  }
}

/** Source: `ButtonSetting` — a title styled as a button, destructive when the source used .red. */
export class ButtonSetting extends TitleSetting {
  readonly destructive: boolean;

  constructor(titleProvider: () => string, selectAction: (() => void) | null = null,
    destructive: boolean = false,
    enabledProvider: () => boolean = (): boolean => true) {
    super(titleProvider, selectAction, false, true, enabledProvider, 'button');
    this.destructive = destructive;
  }
}

/** Source: `SwitchSetting`. */
export class SwitchSetting extends BaseSetting {
  value: boolean;
  private readonly valueProvider: () => boolean;
  private readonly toggleAction: (newValue: boolean) => void;

  constructor(titleProvider: () => string, valueProvider: () => boolean,
    toggleAction: (newValue: boolean) => void,
    enabledProvider: () => boolean = (): boolean => true) {
    super('switch', titleProvider, true, enabledProvider);
    this.valueProvider = valueProvider;
    this.toggleAction = toggleAction;
    this.value = valueProvider();
  }

  /** Source: `switchToggleAction` — what the UI calls when the user flips the switch. */
  set(newValue: boolean): void {
    this.value = newValue;
    this.toggleAction(newValue);
  }

  updateClosures(): void {
    super.updateClosures();
    this.value = this.valueProvider();
  }
}

/** Source: `SelectionSetting` — one option inside a pick list. */
export class SelectionSetting extends BaseSetting {
  subTitle: string;
  isSelected: boolean;
  private readonly selectedProvider: () => boolean;
  private readonly selectAction: () => void;

  constructor(titleProvider: () => string, selectedProvider: () => boolean, selectAction: () => void,
    subTitle: string = '') {
    super('selection', titleProvider, true);
    this.selectedProvider = selectedProvider;
    this.selectAction = selectAction;
    this.subTitle = subTitle;
    this.isSelected = selectedProvider();
  }

  runSelectAction(): void {
    this.selectAction();
    this.updateClosures();
    this.refresh();
  }

  updateClosures(): void {
    super.updateClosures();
    this.isSelected = this.selectedProvider();
  }
}

/** Source: `TextInputSetting` — a row holding an editable value. */
export class TextInputSetting extends BaseSetting {
  value: string;
  readonly placeholder: string;
  /** Source: `keyboardType` — 'decimal' for the weight row, 'default' otherwise. */
  readonly keyboardType: string;
  /** Source: `textBehindTextField` — the unit shown after the field. */
  textBehind: string;
  private readonly valueProvider: () => string;
  private readonly textBehindProvider: () => string;
  private readonly valueAction: (newValue: string) => void;

  constructor(titleProvider: () => string, valueProvider: () => string, placeholder: string,
    valueAction: (newValue: string) => void, keyboardType: string = 'default',
    textBehindProvider: () => string = (): string => '') {
    super('textInput', titleProvider, true);
    this.valueProvider = valueProvider;
    this.valueAction = valueAction;
    this.placeholder = placeholder;
    this.keyboardType = keyboardType;
    this.textBehindProvider = textBehindProvider;
    this.value = valueProvider();
    this.textBehind = textBehindProvider();
  }

  /** Source: `textFieldValueAction` — called when editing ends. */
  set(newValue: string): void {
    this.valueAction(newValue);
  }

  updateClosures(): void {
    super.updateClosures();
    this.value = this.valueProvider();
    this.textBehind = this.textBehindProvider();
  }
}

/** Source: the weight row's value action, including its optional health sync. */
function applyWeight(text: string, setting: Setting, actions: SettingsActions): void {
  const parsed: number | null = CustomNumberFormatting.number(text);
  if (parsed === null) {
    setting.refresh();
    return;
  }
  const weight: number = UserPreferences.weightMeasurementType.convert(parsed, false);
  UserPreferences.weight.value = weight;
  setting.refresh();
  if (UserPreferences.synchronizeWeightWithAppleHealth.value) {
    actions.syncWeight(new Measurement(weight, Unit.KILOGRAMS))
      .then((success: boolean): void => {
        if (!success) {
          hilog.warn(DOMAIN, TAG, 'failed to sync weight with the health store');
        }
      })
      .catch(report);
  }
}

/** Source: the health switches — the value is only stored once permission came back granted. */
function applyHealthSwitch(newValue: boolean, target: string, setting: Setting,
  actions: SettingsActions): void {
  if (!newValue) {
    storeHealthFlag(target, false);
    setting.refresh();
    return;
  }
  actions.requestHealthPermission()
    .then((granted: boolean): void => {
      storeHealthFlag(target, granted);
      setting.refresh();
    })
    .catch(report);
}

function storeHealthFlag(target: string, value: boolean): void {
  if (target === 'workouts') {
    UserPreferences.synchronizeWorkoutsWithAppleHealth.value = value;
  } else if (target === 'weight') {
    UserPreferences.synchronizeWeightWithAppleHealth.value = value;
  } else {
    UserPreferences.automaticallyImportNewHealthWorkouts.value = value;
  }
}

/** Source: the SyncAll button. `null` from the service means the sync failed. */
async function syncAllWorkouts(actions: SettingsActions): Promise<void> {
  showLoadingOverlay();
  let allSyncedAlready: boolean | null = null;
  try {
    allSyncedAlready = await actions.syncAllWorkouts();
  } finally {
    hideLoadingOverlay();
  }
  if (allSyncedAlready === null) {
    await showErrorAlert(localizedString('Settings.SyncAll.Error'));
    return;
  }
  await showInfoAlert(localizedString(allSyncedAlready
    ? 'Settings.SyncAll.AllSyncedAlready' : 'Settings.SyncAll.Success'));
}

/** Source: the ImportBackupData row — pick a .orbup file and insert what it holds. */
async function importBackup(actions: SettingsActions): Promise<void> {
  let success: boolean = false;
  showLoadingOverlay();
  try {
    success = await actions.importBackup();
  } finally {
    hideLoadingOverlay();
  }
  await (success
    ? showInfoAlert(localizedString('Settings.ImportBackupData.Success'))
    : showErrorAlert(localizedString('Settings.ImportBackupData.Error')));
}

/** Source: the inner `deleteData` closure of the DeleteAllData button. */
async function deleteAllAppData(): Promise<boolean> {
  let success: boolean = false;
  showLoadingOverlay();
  try {
    success = await DataManager.deleteAll();
    if (success) {
      UserPreferences.reset();
    }
  } finally {
    hideLoadingOverlay();
  }
  if (!success) {
    await showErrorAlert(localizedString('Settings.DeleteAll.Error.Message'));
    return false;
  }
  // Source: the app returns to the start screen once its data is gone.
  requestNavigation('screen_start');
  return true;
}

/** Source: the DeleteAllData button — confirm, then ask whether the health copies go too. */
async function deleteAllData(actions: SettingsActions): Promise<void> {
  const confirmed: boolean = await showConfirmAlert(
    localizedString('Settings.DeleteAll.Confirmation.Title'),
    localizedString('Settings.DeleteAll.Confirmation.Message'),
    localizedString('Delete'));
  if (!confirmed) {
    return;
  }
  // The source's second alert offered Delete / Keep, both of which delete the app's own data;
  // showConfirmAlert's Cancel is that "Keep".
  const alsoHealth: boolean = await showConfirmAlert(
    localizedString('Settings.DeleteAll.AppleHealth.Title'),
    localizedString('Settings.DeleteAll.AppleHealth.Message'),
    localizedString('Delete'));
  const deleted: boolean = await deleteAllAppData();
  if (!deleted || !alsoHealth) {
    return;
  }
  const healthDeleted: boolean = await actions.deleteAllHealthWorkouts();
  if (!healthDeleted) {
    await showErrorAlert(localizedString('Settings.DeleteAll.AppleHealth.Error.Message'));
  }
}

export class SettingsModelEngine {
  /** Source: `SettingsModel.main`. */
  static main(actions: SettingsActions): SettingsModel {
    return new SettingsModel([
      SettingsModelEngine.userSettings(actions),
      SettingsModelEngine.unitPreferences,
      SettingsModelEngine.recordingPreferences,
      SettingsModelEngine.appleHealthPreferences(actions),
      SettingsModelEngine.dataPreferences(actions),
      // Team decision 2026-10-07: the source's Support section (Terms, Privacy, Email) is dropped.
      SettingsModelEngine.appInfo
    ]);
  }

  /** Source: `SettingsModel.userSettings`. */
  static userSettings(actions: SettingsActions): SettingSection {
    const nameSetting: TextInputSetting = new TextInputSetting(
      (): string => localizedString('Settings.Name'),
      (): string => {
        const stored: string | null = UserPreferences.name.value;
        return stored !== null ? stored : '';
      },
      localizedString('Settings.Name'),
      (newValue: string): void => {
        UserPreferences.name.value = newValue;
      });
    const weightSetting: TextInputSetting = new TextInputSetting(
      (): string => localizedString('Settings.Weight'),
      (): string => {
        const stored: number | null = UserPreferences.weight.value;
        if (stored === null) {
          return '';
        }
        const shown: number = UserPreferences.weightMeasurementType.convert(stored, true);
        const text: string | null = CustomNumberFormatting.string(shown, 2);
        return text !== null ? text : '';
      },
      localizedString('Settings.Weight'),
      (newValue: string): void => {
        applyWeight(newValue, weightSetting, actions);
      },
      'decimal',
      (): string => unitSymbol(UserPreferences.weightMeasurementType.safeValue));
    return new SettingSection(localizedString('Settings.UserSettings'),
      [nameSetting, weightSetting], localizedString('Settings.UserSettings.Description'));
  }

  /** Source: `SettingsModel.unitPreferences` — each row is the preference's own pick list. */
  static get unitPreferences(): SettingSection {
    const settings: Setting[] = [
      UserPreferences.distanceMeasurementType.setting(localizedString('Settings.DistanceUnit')),
      UserPreferences.altitudeMeasurementType.setting(localizedString('Settings.AltitudeUnit')),
      UserPreferences.speedMeasurementType.setting(localizedString('Settings.SpeedUnit')),
      UserPreferences.energyMeasurementType.setting(localizedString('Settings.EnergyUnit')),
      UserPreferences.weightMeasurementType.setting(localizedString('Settings.WeightUnit'))
    ];
    return new SettingSection(localizedString('Settings.UnitPreferences'), settings);
  }

  /** Source: `SettingsModel.recordingPreferences`. */
  static get recordingPreferences(): SettingSection {
    const workoutTypes: Setting[] = [];
    for (const type of workoutTypeAllCases()) {
      workoutTypes.push(new SelectionSetting(
        (): string => workoutTypeDescription(type),
        (): boolean => UserPreferences.standardWorkoutType.value === type.valueOf(),
        (): void => {
          UserPreferences.standardWorkoutType.value = type.valueOf();
        }));
    }
    const workoutTypeModel: SettingsModel = new SettingsModel(
      [new SettingSection(localizedString('Workout.Type'), workoutTypes,
        localizedString('Settings.StandardWorkoutType.Message'))],
      localizedString('Settings.StandardWorkoutType'));

    const accuracySettings: Setting[] = [
      SettingsModelEngine.accuracySetting(localizedString('Settings.GPSAccuracy.Standard'), null),
      SettingsModelEngine.accuracySetting(localizedString('Settings.GPSAccuracy.High'), 20),
      SettingsModelEngine.accuracySetting(localizedString('Settings.GPSAccuracy.Acceptable'), 30),
      SettingsModelEngine.accuracySetting(localizedString('Settings.GPSAccuracy.LastResort'), 50),
      SettingsModelEngine.accuracySetting(localizedString('Settings.GPSAccuracy.Off'), -1)
    ];
    const accuracyModel: SettingsModel = new SettingsModel(
      [new SettingSection(localizedString('Settings.GPSAccuracy.Title'), accuracySettings,
        localizedString('Settings.GPSAccuracy.Text'))],
      localizedString('Settings.GPSAccuracy'));

    const mapSetting: SwitchSetting = new SwitchSetting(
      (): string => localizedString('Settings.MapVisibility'),
      (): boolean => UserPreferences.shouldShowMap.value,
      (newValue: boolean): void => {
        UserPreferences.shouldShowMap.value = newValue;
      });
    const paceSetting: SwitchSetting = new SwitchSetting(
      (): string => localizedString('Settings.DisplayPace'),
      (): boolean => UserPreferences.usePaceForSpeedDisplay.value,
      (newValue: boolean): void => {
        UserPreferences.usePaceForSpeedDisplay.value = newValue;
      });
    const rollingSetting: SwitchSetting = new SwitchSetting(
      (): string => localizedString('Settings.DisplayRollingSpeed'),
      (): boolean => UserPreferences.displayRollingSpeed.value,
      (newValue: boolean): void => {
        UserPreferences.displayRollingSpeed.value = newValue;
      });

    const settings: Setting[] = [
      new TitleSubTitleSetting(
        (): string => localizedString('Settings.StandardWorkoutType'),
        (): string => {
          const type: WorkoutType = workoutTypeFromRaw(UserPreferences.standardWorkoutType.value);
          return workoutTypeDescription(type);
        },
        null, true, workoutTypeModel),
      mapSetting,
      new TitleSubTitleSetting(
        (): string => localizedString('Settings.GPSAccuracy'),
        (): string => SettingsModelEngine.accuracyDescription(),
        null, true, accuracyModel),
      paceSetting,
      rollingSetting
    ];
    return new SettingSection(localizedString('Settings.RecordingPreferences'), settings,
      localizedString('Settings.RecordingPreferences.Message'));
  }

  /** Source: the `selectionSetting(withTitle:value:)` helper inside `recordingPreferences`. */
  private static accuracySetting(title: string, value: number | null): Setting {
    const subTitle: string =
      value !== null && value > 0 ? SettingsModelEngine.accuracyMeters(value) : '';
    return new SelectionSetting(
      (): string => title,
      (): boolean => UserPreferences.gpsAccuracy.value === value,
      (): void => {
        UserPreferences.gpsAccuracy.value = value;
      },
      subTitle);
  }

  /** Source: the GPS-accuracy row's subtitle expression. */
  private static accuracyDescription(): string {
    const stored: number | null = UserPreferences.gpsAccuracy.value;
    if (stored === null) {
      return localizedString('Settings.GPSAccuracy.Standard');
    }
    return stored === -1 ? localizedString('Settings.GPSAccuracy.Off')
      : SettingsModelEngine.accuracyMeters(stored);
  }

  /**
   * The source interpolates a `CLLocationDistance` (a `Double`), so Swift always renders one
   * fractional digit: "20.0 m". A TS number interpolates as "20 m", so fix the digit count here.
   */
  private static accuracyMeters(value: number): string {
    return `${value.toFixed(1)} m`;
  }

  /**
   * Source: `SettingsModel.appleHealthPreferences`. The section is kept: with HMS Health Service
   * Kit unavailable, HealthStoreManager syncs against the app's own local store instead.
   */
  static appleHealthPreferences(actions: SettingsActions): SettingSection {
    const workoutsSetting: SwitchSetting = new SwitchSetting(
      (): string => localizedString('Settings.SynchronizeWorkoutsWithAppleHealth'),
      (): boolean => UserPreferences.synchronizeWorkoutsWithAppleHealth.value,
      (newValue: boolean): void => {
        applyHealthSwitch(newValue, 'workouts', workoutsSetting, actions);
      });
    const weightSetting: SwitchSetting = new SwitchSetting(
      (): string => localizedString('Settings.SynchronizeWeightWithAppleHealth'),
      (): boolean => UserPreferences.synchronizeWeightWithAppleHealth.value,
      (newValue: boolean): void => {
        applyHealthSwitch(newValue, 'weight', weightSetting, actions);
      });
    const autoImportSetting: SwitchSetting = new SwitchSetting(
      (): string => localizedString('Settings.AutoImportHealthWorkouts'),
      (): boolean => UserPreferences.synchronizeWorkoutsWithAppleHealth.value
        ? UserPreferences.automaticallyImportNewHealthWorkouts.value : false,
      (newValue: boolean): void => {
        applyHealthSwitch(newValue, 'autoImport', autoImportSetting, actions);
      },
      (): boolean => UserPreferences.synchronizeWorkoutsWithAppleHealth.value);
    const settings: Setting[] = [
      workoutsSetting,
      weightSetting,
      autoImportSetting,
      new TitleSetting(
        (): string => localizedString('Settings.ImportFromAppleHealth'),
        (): void => {
          requestNavigation('screen_hk_import');
        },
        true),
      new ButtonSetting(
        (): string => localizedString('Settings.SyncAll'),
        (): void => {
          syncAllWorkouts(actions).catch(report);
        },
        false,
        (): boolean => UserPreferences.synchronizeWorkoutsWithAppleHealth.value)
    ];
    return new SettingSection(localizedString('Settings.AppleHealthPreferences'), settings,
      localizedString('Settings.AppleHealthPreferences.Message'));
  }

  /** Source: `SettingsModel.dataPreferences`. */
  static dataPreferences(actions: SettingsActions): SettingSection {
    const settings: Setting[] = [
      new TitleSetting(
        (): string => localizedString('Settings.CreateBackup'),
        (): void => {
          actions.createBackup().catch(report);
        },
        true),
      new TitleSetting(
        (): string => localizedString('Settings.ImportBackupData'),
        (): void => {
          importBackup(actions).catch(report);
        },
        true),
      new ButtonSetting(
        (): string => localizedString('Settings.DeleteAllData'),
        (): void => {
          deleteAllData(actions).catch(report);
        },
        true)
    ];
    return new SettingSection(localizedString('Settings.DataPreferences'), settings,
      localizedString('Settings.DataPreferences.Message'));
  }

  /** Source: `SettingsModel.appInfo`. */
  static get appInfo(): SettingSection {
    const settings: Setting[] = [
      new TitleSubTitleSetting(
        (): string => localizedString('Settings.Contribution'),
        (): string => '',
        null, true, SettingsModelEngine.contributors),
      new TitleSubTitleSetting(
        (): string => localizedString('Settings.SourceCode'),
        (): string => 'github.com',
        (): void => {
          openUrl(SOURCE_CODE_URL, 'Settings.SourceCode.Error').catch(report);
        },
        true),
      /* Team decision 2026-10-07: the source's Release Status row is dropped. */
      new TitleSubTitleSetting(
        (): string => localizedString('Settings.AppVersion'),
        (): string => Config.version)
    ];
    return new SettingSection(localizedString('Settings.AppInfo'), settings,
      'ⓒ 2020 Tim Fraedrich\n\n');
  }

  /** Source: `SettingsModel.contributors` — the three credit lists, each row opening a URL. */
  static get contributors(): SettingsModel {
    return new SettingsModel([
      new SettingSection(localizedString('Settings.Contribution.Maintainers'),
        SettingsModelEngine.contributorSettings(Contribution.maintainers)),
      new SettingSection(localizedString('Settings.Contribution.CodeContributors'),
        SettingsModelEngine.contributorSettings(Contribution.contributors)),
      new SettingSection(localizedString('Settings.Contribution.Translators'),
        SettingsModelEngine.contributorSettings(Contribution.translators))
    ], localizedString('Settings.Contribution'));
  }

  private static contributorSettings(people: Contributor[]): Setting[] {
    const settings: Setting[] = [];
    for (const person of people) {
      settings.push(new TitleSubTitleSetting(
        (): string => person.name,
        (): string => '',
        (): void => {
          openUrl(person.url, 'Settings.SourceCode.Error').catch(report);
        },
        true));
    }
    return settings;
  }
}
