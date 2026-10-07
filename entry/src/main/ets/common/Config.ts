/*
 * Port of `Config` (OutRun/Models/Config.swift:24-88) — what KIND of build this is, and which
 * version it reports.
 *
 * The enum and the two release data tables live in model/ReleaseStatus.ts (VERSIONS, changeLogs);
 * this module re-exports them so `Config` reads like the source and holds the accessors that have
 * to ask the system:
 *   CFBundleShortVersionString      -> bundleManager.getBundleInfoForSelfSync().versionName
 *   #if DEBUG                       -> ApplicationInfo.debug (set by the build, not by a macro)
 *   targetEnvironment(simulator)    -> deviceInfo (the emulator reports an emulated model)
 *   embedded.mobileprovision        -> ApplicationInfo.appDistributionType, the nearest HarmonyOS
 *   appStoreReceiptURL == sandbox      signal for "this build did not come from the store"
 *   UITraitCollection.userInterfaceStyle -> UIAbilityContext.config.colorMode
 */
import { bundleManager, common, ConfigurationConstant } from '@kit.AbilityKit';
import { deviceInfo } from '@kit.BasicServicesKit';
import { ReleaseStatus, VERSIONS, changeLogs } from '../model/ReleaseStatus';

export { ReleaseStatus, changeLogs };

/** Distribution types that are NOT an app-store install (source: `hasMobileProvision`). */
const STORE_DISTRIBUTION: string = 'app_gallery';
/** Distribution types handed out for testing (source: `hasSanboxReceipt` -> beta). */
const TEST_DISTRIBUTION: string[] = ['internaltesting', 'crowdtesting'];
/** Model strings an emulated device reports (source: `targetEnvironment(simulator)`). */
const EMULATED_MODELS: string[] = ['emulator', 'simulator', 'virtual'];

let cachedInfo: bundleManager.BundleInfo | null = null;

function bundleInfo(): bundleManager.BundleInfo | null {
  if (cachedInfo === null) {
    try {
      cachedInfo = bundleManager.getBundleInfoForSelfSync(
        bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
    } catch (err) {
      cachedInfo = null;
    }
  }
  return cachedInfo;
}

function distributionType(): string {
  const info: bundleManager.BundleInfo | null = bundleInfo();
  return info !== null ? info.appInfo.appDistributionType : '';
}

export class Config {
  /** Source: `Config.versions`. */
  static readonly VERSIONS: string[] = VERSIONS;

  /** Source: `Config.version` — the short version string, "error" when it cannot be read. */
  static get version(): string {
    const info: bundleManager.BundleInfo | null = bundleInfo();
    return info !== null ? info.versionName : 'error';
  }

  /** Source: `Config.releaseStatus`. */
  static get releaseStatus(): ReleaseStatus {
    if (Config.isDebug || Config.isRunOnSimulator) {
      return ReleaseStatus.DEBUG;
    }
    if (Config.hasSanboxReceipt) {
      return ReleaseStatus.BETA;
    }
    return ReleaseStatus.RELEASE;
  }

  /** Source: `Config.changeLogs` — version -> changelog text. */
  static get changeLogs(): Map<string, string> {
    return changeLogs();
  }

  /** Source: `Config.isDebug`. */
  static get isDebug(): boolean {
    const info: bundleManager.BundleInfo | null = bundleInfo();
    return info !== null ? info.appInfo.debug : false;
  }

  /** Source: `Config.isRunOnSimulator`. */
  static get isRunOnSimulator(): boolean {
    const model: string = `${deviceInfo.productModel} ${deviceInfo.hardwareModel}`.toLowerCase();
    for (const marker of EMULATED_MODELS) {
      if (model.indexOf(marker) !== -1) {
        return true;
      }
    }
    return false;
  }

  /** Source: `Config.hasMobileProvision` — true for any build not installed from the store. */
  static get hasMobileProvision(): boolean {
    const type: string = distributionType();
    return type.length > 0 && type !== STORE_DISTRIBUTION;
  }

  /** Source: `Config.hasSanboxReceipt` — true for a testing build (the source's beta signal). */
  static get hasSanboxReceipt(): boolean {
    return TEST_DISTRIBUTION.indexOf(distributionType()) !== -1;
  }

  /**
   * Source: `Config.isDarkModeEnabled`. UITraitCollection.current was globally readable; the
   * HarmonyOS color mode hangs off the ability context, so the caller passes its own.
   */
  static isDarkModeEnabled(context: common.UIAbilityContext): boolean {
    return context.config.colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK;
  }
}
