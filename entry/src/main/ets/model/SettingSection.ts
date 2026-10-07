/*
 * Port of `SettingSection` (OutRun/Models/Settings/SettingSection.swift:23-64).
 *
 * `Setting` (OutRun/Protocols/Setting.swift) and the section's back-reference to its model are
 * declared HERE, not in SettingsModel.ts / SettingsModelEngine.ts, to keep the imports one-way:
 * the model owns sections, sections own settings, and nothing imports back up. Swift could afford
 * the cycle; a module graph cannot.
 * `tableViewCell: UITableViewCell` is dropped — it is the iOS cell, and the ArkTS settings list
 * renders each setting from `kind` (see common/SettingsModelEngine.ts).
 */

/** The part of SettingsModel a section may call back into (source: `SettingsModel.refresh`). */
export interface SettingSectionModel {
  refresh(): void;
}

/** Port of `protocol Setting`, minus its iOS cell. */
export interface Setting {
  /** Which control this setting renders as; the settings list branches on it. */
  kind: string;
  /** Set by the owning section on construction (source: `settings.forEach { $0.section = self }`). */
  section: SettingSection | null;
  /** Source: `usesClosures` — whether this setting's value/title are recomputed on refresh. */
  usesClosures: boolean;
  runSelectAction(): void;
  updateClosures(): void;
  refresh(): void;
}

export class SettingSection {
  /** Set by SettingsModel when it takes ownership of this section. */
  model: SettingSectionModel | null = null;
  readonly title: string;
  readonly message: string | null;
  readonly settings: Setting[];

  constructor(title: string, settings: Setting[], message: string | null = null) {
    this.title = title;
    this.message = message;
    this.settings = settings;
    for (const setting of settings) {
      setting.section = this;
    }
  }

  /** Source: `count` — the section's row count. */
  count(): number {
    return this.settings.length;
  }

  /** Source: `refresh()` — a setting refreshing itself refreshes the whole model. */
  refresh(): void {
    if (this.model !== null) {
      this.model.refresh();
    }
  }

  /** Source: `subscript(_ itemIndex: Int)` — unsafe access, index assumed valid. */
  setting(itemIndex: number): Setting {
    return this.settings[itemIndex];
  }

  /** Source: `safeSetting(itemIndex:)` — null when the index is out of bounds. */
  safeSetting(itemIndex: number): Setting | null {
    if (itemIndex < 0 || itemIndex >= this.settings.length) {
      return null;
    }
    return this.settings[itemIndex];
  }
}
