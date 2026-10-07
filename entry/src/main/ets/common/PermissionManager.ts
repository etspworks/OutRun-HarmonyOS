/*
 * Port of `PermissionManager` (OutRun/Models/PermissionManager.swift:25-111).
 *
 * Three permission checks, each "report the status, asking the user once if it has never been
 * asked". The source was a CLLocationManagerDelegate singleton because CoreLocation answers
 * through a delegate callback — `locationManager`, `locationPermissionClosure` and the
 * `standard` instance existed only to carry that callback. @ohos.abilityAccessCtrl answers with a
 * Promise, so there is nothing to hold between the ask and the answer and these are static.
 *
 * The source showed its "open Settings" alert at the CALL SITES (SetupViewController,
 * AppDelegate), not in here, and that stays true: a denied result comes back as a status, and the
 * caller runs showOpenSettingsAlert() from common/AlertDialogs.ts, which is the supported
 * second-attempt route (abilityAccessCtrl.requestPermissionOnSetting) — HarmonyOS exposes no
 * generic "open my app's settings page" want.
 *
 * HEALTH: HMS Health Service Kit is not available to this build (registered platform-capability
 * substitution — `ohos.permission.READ_HEALTH_DATA` is deliberately not requested), so there is no
 * health authorization to gain. `checkHealthPermission` reports on the app's OWN local store,
 * which is what HealthStoreManager reads and writes here.
 */
import { abilityAccessCtrl, bundleManager, common, PermissionRequestResult, Permissions } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { LocationPermissionStatus } from '../model/LocationPermissionStatus';
import { DataManager } from './DataManager';

const DOMAIN: number = 0x0000;
const TAG: string = 'PermissionManager';

/** The two location permissions the manifest requests; precise implies approximate. */
const LOCATION_PERMISSIONS: Permissions[] =
  ['ohos.permission.APPROXIMATELY_LOCATION', 'ohos.permission.LOCATION'];
/** Source: `CMMotionActivityManager` / `CMPedometer` authorization. */
const MOTION_PERMISSIONS: Permissions[] = ['ohos.permission.ACTIVITY_MOTION'];

function tokenId(): number {
  const info: bundleManager.BundleInfo = bundleManager.getBundleInfoForSelfSync(
    bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
  return info.appInfo.accessTokenId;
}

async function isGranted(permission: Permissions): Promise<boolean> {
  const status: abilityAccessCtrl.GrantStatus =
    await abilityAccessCtrl.createAtManager().checkAccessToken(tokenId(), permission);
  return status === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED;
}

/** Asks for what is not granted yet; returns the granted set afterwards. */
async function request(context: common.UIAbilityContext,
  permissions: Permissions[]): Promise<string[]> {
  const result: PermissionRequestResult =
    await abilityAccessCtrl.createAtManager().requestPermissionsFromUser(context, permissions);
  const granted: string[] = [];
  for (let index: number = 0; index < result.permissions.length; index++) {
    if (result.authResults[index] === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED) {
      granted.push(result.permissions[index]);
    }
  }
  return granted;
}

export class PermissionManager {

  /**
   * Source: `checkHealthPermission(closure:)`. With no health store to authorize against, the
   * question becomes "can the app read the workouts it holds itself" — false only when the store
   * failed to open, in which case the settings switch must not be stored as enabled.
   */
  static async checkHealthPermission(): Promise<boolean> {
    try {
      DataManager.requireStore();
      return true;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'local workout store unavailable: %{public}s', JSON.stringify(err));
      return false;
    }
  }

  /**
   * Source: `checkLocationPermission(closure:)` — granted / restricted / denied, asking once when
   * the user has never been asked.
   *
   * `RESTRICTED` is the source's "usable but limited" status (its Setup screen treats it as granted
   * and then explains the limitation): here that is precise location denied while approximate
   * location is granted, which is the one partial grant HarmonyOS can return.
   */
  static async checkLocationPermission(
    context: common.UIAbilityContext): Promise<LocationPermissionStatus> {
    try {
      let precise: boolean = await isGranted('ohos.permission.LOCATION');
      let approximate: boolean = await isGranted('ohos.permission.APPROXIMATELY_LOCATION');

      if (!precise) {
        const granted: string[] = await request(context, LOCATION_PERMISSIONS);
        precise = granted.indexOf('ohos.permission.LOCATION') !== -1;
        approximate = approximate || granted.indexOf('ohos.permission.APPROXIMATELY_LOCATION') !== -1;
      }

      if (precise) {
        return LocationPermissionStatus.GRANTED;
      }
      return approximate ? LocationPermissionStatus.RESTRICTED : LocationPermissionStatus.DENIED;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'location permission check failed: %{public}s', JSON.stringify(err));
      return LocationPermissionStatus.ERROR;
    }
  }

  /** Source: `checkMotionPermission(closure:)` — the step-count permission, asked once. */
  static async checkMotionPermission(context: common.UIAbilityContext): Promise<boolean> {
    try {
      if (await isGranted('ohos.permission.ACTIVITY_MOTION')) {
        return true;
      }
      const granted: string[] = await request(context, MOTION_PERMISSIONS);
      return granted.indexOf('ohos.permission.ACTIVITY_MOTION') !== -1;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'motion permission check failed: %{public}s', JSON.stringify(err));
      return false;
    }
  }
}
