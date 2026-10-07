/*
 * Port of `struct LS` (OutRun/Models/LS.swift) — the app-wide localization accessor.
 *
 * Source behaviour kept:
 *  - key lookup in the current locale, falling back when the key is not localized,
 *  - the en-GB trademark rewrite: "OutRun" -> "Out-Run" when the system region is GB.
 *
 * Source behaviour dropped on purpose: the `LSSourceType` table selector. iOS read three
 * .strings tables (Localizable / InfoPlist / Changelog); the assets pass flattened all three
 * into one `element/string.json` per locale, so there is exactly one table to read here.
 * Source keys are dotted ("Settings.SyncAll.Error"); resource names cannot hold a dot, so the
 * assets pass wrote them with underscores and this function translates the key the same way.
 *
 * Missing key: iOS returned the literal "NIL"; we return the key, which reads better for the
 * few keys the source never localized at all (LS["Error"], LS["Info"]).
 */
import { application } from '@kit.AbilityKit';
import { i18n, resourceManager } from '@kit.LocalizationKit';

let cachedManager: resourceManager.ResourceManager | null = null;
let regionChecked: boolean = false;
let rewriteAppName: boolean = false;

function resources(): resourceManager.ResourceManager | null {
  if (cachedManager === null) {
    try {
      cachedManager = application.getApplicationContext().resourceManager;
    } catch (err) {
      cachedManager = null;
    }
  }
  return cachedManager;
}

function applyTrademark(value: string): string {
  if (!regionChecked) {
    regionChecked = true;
    try {
      rewriteAppName = i18n.System.getSystemRegion().toLowerCase() === 'gb';
    } catch (err) {
      rewriteAppName = false;
    }
  }
  return rewriteAppName ? value.split('OutRun').join('Out-Run') : value;
}

/**
 * The resource name the assets pass wrote for a source key, by the rule it recorded in
 * `resources/rawfile/string-key-map.json`: every character a resource name cannot hold becomes
 * '_'. Folding only '.' left every other illegal character unmapped — `LS["Loading-DoNotClose"]`
 * looked up a name that does not exist and rendered the raw key on screen.
 */
function resourceName(key: string): string {
  let out: string = '';
  for (const ch of key) {
    const ok: boolean = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
      || (ch >= '0' && ch <= '9') || ch === '_';
    out += ok ? ch : '_';
  }
  return out;
}

/** The localized string for a source `LS[key]`, or the key itself when it is not localized. */
export function localizedString(key: string): string {
  const manager: resourceManager.ResourceManager | null = resources();
  if (manager === null) {
    return key;
  }
  try {
    return applyTrademark(manager.getStringByNameSync(resourceName(key)));
  } catch (err) {
    return key;
  }
}

/**
 * The changelog text for an app version (source: `Config.changeLogs`, keyed `Changelog_<version>`).
 * Returns '' when this version ships no changelog — the caller shows nothing, as the source did.
 */
export function localizedChangeLog(version: string): string {
  const manager: resourceManager.ResourceManager | null = resources();
  if (manager === null) {
    return '';
  }
  try {
    return applyTrademark(manager.getStringByNameSync(resourceName('Changelog.' + version)));
  } catch (err) {
    return '';
  }
}
