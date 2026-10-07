/*
 * Port of the shared alert helpers in OutRun/Extensions/UIViewController.swift:70-123
 * (displayDismissableAlert / displayError / displayInfoAlert / displayOpenSettingsAlert).
 * One copy for the whole app, over promptAction.showDialog.
 *
 * Button colors are the source app's own accent/destructive colors (resources/base/element/color.json);
 * a .ts module cannot use $r(), so the literals are the same values that file holds.
 */
import { promptAction } from '@kit.ArkUI';
import { abilityAccessCtrl, common, Permissions } from '@kit.AbilityKit';
import { localizedString } from './LocalizedStrings';

const ACCENT_COLOR: string = '#FF9200';
const DESTRUCTIVE_COLOR: string = '#FFE84026';

/** displayDismissableAlert: title + message + a single "Okay" button. */
export async function showDismissableAlert(title: string, message: string): Promise<void> {
  const options: promptAction.ShowDialogOptions = {
    title: title,
    message: message,
    buttons: [{ text: localizedString('Okay'), color: ACCENT_COLOR }]
  };
  try {
    await promptAction.showDialog(options);
  } catch (err) {
    // The dialog could not be shown (no UI context, or the user dismissed it); nothing to report.
  }
}

/** displayError(withMessage:) — 18 callers in the source. */
export function showErrorAlert(message: string): Promise<void> {
  return showDismissableAlert(localizedString('Error'), message);
}

/** displayInfoAlert(withMessage:) — 4 callers in the source. */
export function showInfoAlert(message: string): Promise<void> {
  return showDismissableAlert(localizedString('Info'), message);
}

/**
 * The source's two-button confirmation alerts (Settings.DeleteAll, workout deletion, ...):
 * a confirm button plus Cancel. Resolves true only when the confirm button was pressed.
 */
export async function showConfirmAlert(title: string, message: string, confirmLabel: string,
  destructive: boolean = true): Promise<boolean> {
  const options: promptAction.ShowDialogOptions = {
    title: title,
    message: message,
    buttons: [
      { text: confirmLabel, color: destructive ? DESTRUCTIVE_COLOR : ACCENT_COLOR },
      { text: localizedString('Cancel'), color: ACCENT_COLOR }
    ]
  };
  try {
    const response: promptAction.ShowDialogSuccessResponse = await promptAction.showDialog(options);
    return response.index === 0;
  } catch (err) {
    return false;
  }
}

/**
 * displayOpenSettingsAlert: Cancel / Open, where Open took the user to the app's settings page
 * to grant a permission it had already been denied.
 *
 * HarmonyOS exposes no generic "open my app's settings page" want — the supported route for a
 * second authorization attempt is abilityAccessCtrl.requestPermissionOnSetting (it opens the
 * system permission-setting dialog for the listed permissions). Resolves true only when every
 * requested permission came back granted.
 */
export async function showOpenSettingsAlert(title: string, message: string,
  context: common.UIAbilityContext, permissions: Permissions[]): Promise<boolean> {
  const options: promptAction.ShowDialogOptions = {
    title: title,
    message: message,
    buttons: [
      { text: localizedString('Cancel'), color: ACCENT_COLOR },
      { text: localizedString('Open'), color: ACCENT_COLOR }
    ]
  };
  try {
    const response: promptAction.ShowDialogSuccessResponse = await promptAction.showDialog(options);
    if (response.index !== 1) {
      return false;
    }
    const statuses: abilityAccessCtrl.GrantStatus[] =
      await abilityAccessCtrl.createAtManager().requestPermissionOnSetting(context, permissions);
    for (const status of statuses) {
      if (status !== abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED) {
        return false;
      }
    }
    return statuses.length > 0;
  } catch (err) {
    return false;
  }
}
