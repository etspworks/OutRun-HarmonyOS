/*
 * Port of UIViewController.startLoading / endLoading (OutRun/Extensions/UIViewController.swift:24-68):
 * the app-wide modal loading alert, and its progress variant whose return value is the closure the
 * caller drives (`(Double, String?) -> Void`).
 *
 * UIKit presented and later dismissed a UIAlertController. A HarmonyOS system dialog
 * (promptAction.showDialog) cannot be dismissed programmatically, and openCustomDialog needs a
 * ComponentContent, which only a .ets file can build — so the overlay is app state here: these
 * functions set the three AppStorage keys below and each page renders the overlay from them
 * (@StorageLink). That keeps the one shared control point the source had.
 *
 * Progress of -1 means indeterminate (the spinner variant); 0..1 means the progress-bar variant.
 */
import { localizedString } from './LocalizedStrings';

export const LOADING_VISIBLE_KEY: string = 'loadingOverlayVisible';
export const LOADING_MESSAGE_KEY: string = 'loadingOverlayMessage';
export const LOADING_PROGRESS_KEY: string = 'loadingOverlayProgress';

const INDETERMINATE: number = -1;

/** startLoading() — the spinner variant. */
export function showLoadingOverlay(message?: string): void {
  AppStorage.setOrCreate<string>(LOADING_MESSAGE_KEY,
    message !== undefined ? message : localizedString('Loading'));
  AppStorage.setOrCreate<number>(LOADING_PROGRESS_KEY, INDETERMINATE);
  AppStorage.setOrCreate<boolean>(LOADING_VISIBLE_KEY, true);
}

/** endLoading(). */
export function hideLoadingOverlay(): void {
  AppStorage.setOrCreate<boolean>(LOADING_VISIBLE_KEY, false);
  AppStorage.setOrCreate<number>(LOADING_PROGRESS_KEY, INDETERMINATE);
}

/**
 * startLoading(asProgress: true) — the progress variant. Returns the update closure the source
 * returned: call it with the new progress (0..1) and, optionally, a new message.
 */
export function showProgressOverlay(title?: string): (progress: number, message?: string) => void {
  AppStorage.setOrCreate<string>(LOADING_MESSAGE_KEY,
    title !== undefined ? title : localizedString('Loading'));
  AppStorage.setOrCreate<number>(LOADING_PROGRESS_KEY, 0);
  AppStorage.setOrCreate<boolean>(LOADING_VISIBLE_KEY, true);
  return (progress: number, message?: string): void => {
    AppStorage.setOrCreate<number>(LOADING_PROGRESS_KEY, progress);
    if (message !== undefined) {
      AppStorage.setOrCreate<string>(LOADING_MESSAGE_KEY, message);
    }
  };
}
