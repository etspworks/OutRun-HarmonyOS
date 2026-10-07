/*
 * Port of `SettingsModel` (OutRun/Models/Settings/SettingsModel.swift:24-76) — the settings
 * TABLE: a title, its ordered sections, and indexed access into them.
 *
 * `Setting`, `SettingSection` and `SettingSectionModel` are declared in model/SettingSection.ts so
 * the imports stay one-way (model -> sections -> settings); this class implements
 * `SettingSectionModel`, which is the back-reference a setting refreshes through.
 * The three `subscript` overloads collapse to two named reads: Swift distinguished them by
 * IndexPath, ArkTS has no subscripts and no overloads.
 * The section CONTENT — `main`, `userSettings`, `unitPreferences`, `recordingPreferences`,
 * `appleHealthPreferences`, `dataPreferences`, `support`, `appInfo`, `contributors`
 * (SettingsModel.swift:80-613) — is NOT built here: every one of those closures reads
 * UserPreferences / HealthStoreManager / BackupManager and raises alerts, so they belong to
 * common/SettingsModelEngine.ts (plan service `svc_settings_model`, whose `sourceSymbols` are
 * exactly SettingsModel + SettingSection + Setting). A model that built them would have to import
 * the services that import it.
 */
import { Setting, SettingSection, SettingSectionModel } from './SettingSection';
import { localizedString } from '../common/LocalizedStrings';

export class SettingsModel implements SettingSectionModel {
  readonly title: string;
  readonly sections: SettingSection[];

  /** Source: `init(title:sections:)` — the model takes ownership of every section it is given. */
  constructor(sections: SettingSection[], title: string = localizedString('Settings')) {
    this.title = title;
    this.sections = sections;
    for (const section of sections) {
      section.model = this;
    }
  }

  /** Source: `refresh()` — recompute every setting's closures (title, value, enabled). */
  refresh(): void {
    for (const section of this.sections) {
      for (const setting of section.settings) {
        setting.updateClosures();
      }
    }
  }

  /** Source: `subscript(_ sectionIndex:)` — unsafe access, index assumed valid. */
  section(sectionIndex: number): SettingSection {
    return this.sections[sectionIndex];
  }

  /** Source: `subscript(_ sectionIndex:_ itemIndex:)` / `subscript(indexPath:)` — unsafe. */
  setting(sectionIndex: number, itemIndex: number): Setting {
    return this.sections[sectionIndex].setting(itemIndex);
  }

  /** Source: `safeSection(sectionIndex:)` — null when the index is out of bounds. */
  safeSection(sectionIndex: number): SettingSection | null {
    if (sectionIndex < 0 || sectionIndex >= this.sections.length) {
      return null;
    }
    return this.sections[sectionIndex];
  }

  /** Source: `safeSetting(_:_:)` / `safeSetting(indexPath:)` — null for either index. */
  safeSetting(sectionIndex: number, itemIndex: number): Setting | null {
    const section: SettingSection | null = this.safeSection(sectionIndex);
    if (section === null) {
      return null;
    }
    return section.safeSetting(itemIndex);
  }
}
