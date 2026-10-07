/*
 * Port of `ShareManager` (OutRun/Models/Data/ShareManager.swift:24-130).
 *
 * SHARE: the source presents the iOS system activity sheet for a file in the temporary directory.
 * The HarmonyOS counterpart is Share Kit's `systemShare.ShareController.show`, which offers the
 * same choice of "save to Files" or "send to another app". An earlier pass recorded that this SDK
 * ships no `@kit.ShareKit`; it does, under `<sdk>/default/hms/ets/kits/`, which is the half that
 * was not checked.
 * Share Kit needs a UIAbilityContext, so where no ability registered one — or where the share
 * panel itself fails — the `@ohos.file.picker` `DocumentViewPicker.save()` export stands in, which
 * still hands the user the file at a destination they choose. It NEVER silently no-ops: with both
 * routes gone the `pasteboard` + toast fallback runs, as the reference requires; a user CANCEL is
 * not a failure and stays silent, as dismissing the iOS share sheet is.
 * `completionWithItemsHandler` (the source's only use of it is the delete-after-share) becomes the
 * `shouldDelete` unlink once the picker returns.
 *
 * The presenting `UIViewController` is gone: errors go to common/AlertDialogs.ts and the progress
 * alert to common/LoadingOverlay.ts (AppStorage the page renders), so these actions are callable
 * from a .ts service. The ability context the picker and the temp directory need is the one
 * registered through BackupManager.setFileContext().
 */
import { fileIo as fs, fileUri, picker } from '@kit.CoreFileKit';
import { systemShare } from '@kit.ShareKit';
import { common } from '@kit.AbilityKit';
import { pasteboard } from '@kit.BasicServicesKit';
import { promptAction } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BackupManager, fileContext, uiAbilityContext } from './BackupManager';
import { DataQueryManager, SampleSection, SeriesSampleKind } from './DataQueryManager';
import { GpxMetadata, GpxRoot, GpxTrack, GpxTrackPoint, GpxTrackSegment } from './GpxWriter';
import { CustomTimeFormatting } from './Formatting';
import { localizedString } from './LocalizedStrings';
import { showErrorAlert } from './AlertDialogs';
import { hideLoadingOverlay, showProgressOverlay } from './LoadingOverlay';
import { Workout } from '../model/Workout';
import { SectionKind, WorkoutSeriesDataSample } from '../model/WorkoutStatsSeriesSection';
import { TempWorkoutRouteDataSample } from '../model/TempWorkoutRouteDataSample';

const DOMAIN: number = 0x0000;
const TAG: string = 'ShareManager';

/** Source: the GPX metadata description the app stamps on every exported file. */
const GPX_CREATOR: string = 'OutRun';
const GPX_DESCRIPTION: string = 'This GPX-File was created by OutRun';

/** A file bigger than this is not copied into the clipboard by the fallback — its path is. */
const CLIPBOARD_CONTENT_LIMIT: number = 256 * 1024;

function fileName(filePath: string): string {
  const index: number = filePath.lastIndexOf('/');
  return index === -1 ? filePath : filePath.substring(index + 1);
}

function suffixOf(name: string): string {
  const index: number = name.lastIndexOf('.');
  return index === -1 ? '' : name.substring(index);
}

/** The reference's required no-silent-no-op fallback: clipboard + toast. */
async function clipboardFallback(filePath: string): Promise<void> {
  let text: string = filePath;
  try {
    if (fs.statSync(filePath).size <= CLIPBOARD_CONTENT_LIMIT) {
      text = fs.readTextSync(filePath);
    }
  } catch (err) {
    hilog.error(DOMAIN, TAG, 'fallback could not read %{public}s: %{public}s', filePath,
      JSON.stringify(err));
  }
  try {
    await pasteboard.getSystemPasteboard().setData(pasteboard.createPlainTextData(text));
    const options: promptAction.ShowToastOptions = {
      message: localizedString('Share.CopiedToClipboard'),
      duration: 2000
    };
    promptAction.showToast(options);
  } catch (err) {
    hilog.error(DOMAIN, TAG, 'clipboard fallback failed: %{public}s', JSON.stringify(err));
  }
}

/** Share Kit's type for "some file", the only record kind these exports produce. */
const SHARED_FILE_TYPE: string = 'general.file';

/**
 * The source's activity sheet: Share Kit's panel, which can save the file or hand it to another
 * app. Returns false when there is no ability context or the panel refuses, so the caller can fall
 * back to the save picker.
 */
async function shareKitMenu(filePath: string, name: string): Promise<boolean> {
  const context: common.UIAbilityContext | null = uiAbilityContext();
  if (context === null) {
    return false;
  }
  try {
    const record: systemShare.SharedRecord = {
      utd: SHARED_FILE_TYPE,
      uri: fileUri.getUriFromPath(filePath),
      title: name
    };
    const controller: systemShare.ShareController =
      new systemShare.ShareController(new systemShare.SharedData(record));
    await controller.show(context, {
      selectionMode: systemShare.SelectionMode.SINGLE,
      previewMode: systemShare.SharePreviewMode.DEFAULT
    });
    return true;
  } catch (err) {
    hilog.error(DOMAIN, TAG, 'share panel failed: %{public}s', JSON.stringify(err));
    return false;
  }
}

/**
 * Source: the delete-after-share. With no completion callback that fires after the receiving app
 * has read the file, the previous exports (same directory, .orbup / .gpx) are removed when the next
 * export starts, so the temp directory holds at most the file currently being shared.
 */
function removeEarlierExports(currentPath: string): void {
  const dir: string = currentPath.substring(0, currentPath.lastIndexOf('/'));
  try {
    for (const entry of fs.listFileSync(dir)) {
      const path: string = `${dir}/${entry}`;
      if (path !== currentPath && (entry.endsWith('.orbup') || entry.endsWith('.gpx'))) {
        fs.unlinkSync(path);
      }
    }
  } catch (err) {
    hilog.error(DOMAIN, TAG, 'could not clean earlier exports in %{public}s', dir);
  }
}

export class ShareManager {

  /**
   * Source: `displayShareMenu(forFileAt:on:shouldDeleteFileAfter:)`. `filePath` is a sandbox path
   * (the source's temporary-directory URL); a null path returns without doing anything, as the
   * source's `guard let url` does.
   */
  static async displayShareMenu(filePath: string | null,
    shouldDelete: boolean = true): Promise<void> {
    if (filePath === null) {
      return;
    }
    const name: string = fileName(filePath);
    removeEarlierExports(filePath);
    let exported: boolean = await shareKitMenu(filePath, name);
    // Share Kit's `show()` resolves when the panel APPEARS; the chosen target (Save as, Notepad,
    // ...) reads the file through its uri afterwards. Deleting it here made every target fail with
    // "No such file or directory", so a shared export is left in place and removed by the next one.
    const keepForTarget: boolean = exported;
    let cancelled: boolean = false;
    if (!exported) {
      try {
        const documentPicker: picker.DocumentViewPicker = new picker.DocumentViewPicker(
          fileContext());
        const options: picker.DocumentSaveOptions = {
          newFileNames: [name],
          fileSuffixChoices: [suffixOf(name)]
        };
        const uris: string[] = await documentPicker.save(options);
        if (uris.length === 0) {
          cancelled = true;
        } else {
          ShareManager.copyFile(filePath, uris[0]);
          exported = true;
        }
      } catch (err) {
        hilog.error(DOMAIN, TAG, 'document picker save failed: %{public}s', JSON.stringify(err));
      }
    }
    if (!exported && !cancelled) {
      await clipboardFallback(filePath);
    }
    if (shouldDelete && !keepForTarget) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        hilog.error(DOMAIN, TAG, 'deletion of (%{public}s) failed', filePath);
      }
    }
  }

  /** The picker hands back a destination uri; `fileIo` writes the temp file into it. */
  private static copyFile(sourcePath: string, destinationUri: string): void {
    const source: fs.File = fs.openSync(sourcePath, fs.OpenMode.READ_ONLY);
    try {
      const destination: fs.File = fs.openSync(destinationUri,
        fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
      try {
        fs.copyFileSync(source.fd, destination.fd);
      } finally {
        fs.closeSync(destination);
      }
    } finally {
      fs.closeSync(source);
    }
  }

  /**
   * Source: `createGPXFile(for:completion:)` — the active sections of the route series become one
   * GPX track, written to the temp directory under the workout's backup time code. Returns the
   * written path, or null where the source called back `(false, nil)`.
   */
  static async createGPXFile(workout: Workout): Promise<string | null> {
    const sections: SampleSection[] = await DataQueryManager.querySectionedSeriesSamples(
      workout, SeriesSampleKind.ROUTE);
    if (sections.length === 0) {
      return null;
    }

    const root: GpxRoot = new GpxRoot(GPX_CREATOR);

    const metadata: GpxMetadata = new GpxMetadata();
    metadata.desc = GPX_DESCRIPTION;
    metadata.time = new Date();

    root.metadata = metadata;

    const track: GpxTrack = new GpxTrack();

    for (const section of sections) {
      if (section.type.kind !== SectionKind.ACTIVE) {
        continue;
      }
      const trackPoints: GpxTrackPoint[] = [];
      for (const sample of section.samples) {
        const route: TempWorkoutRouteDataSample | null = ShareManager.routeSample(sample);
        if (route === null) {
          continue;
        }
        const trackPoint: GpxTrackPoint = new GpxTrackPoint();
        trackPoint.latitude = route.latitude;
        trackPoint.longitude = route.longitude;
        trackPoint.elevation = route.altitude;
        trackPoint.time = route.timestamp;
        trackPoints.push(trackPoint);
      }
      const trackSegment: GpxTrackSegment = new GpxTrackSegment();
      trackSegment.trackpoints = trackPoints;
      track.add(trackSegment);
    }

    root.add(track);

    try {
      return root.outputToFile(fileContext().tempDir,
        CustomTimeFormatting.backupTimeCode(workout.startDate));
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to save GPX file: %{public}s', JSON.stringify(err));
      return null;
    }
  }

  private static routeSample(sample: WorkoutSeriesDataSample): TempWorkoutRouteDataSample | null {
    if (sample instanceof TempWorkoutRouteDataSample) {
      return sample as TempWorkoutRouteDataSample;
    }
    return null;
  }

  /**
   * Source: `exportGPXAlertAction(for:on:)`. The source reads LS["ShareManager.GPX.Error"], which
   * is not a key in any Localizable.strings (the localized key is "ShareManager.GPXError"), so the
   * source shows the raw key; the real string is used here.
   */
  static async exportGPXAlertAction(workout: Workout): Promise<void> {
    const filePath: string | null = await ShareManager.createGPXFile(workout);
    if (filePath !== null) {
      await ShareManager.displayShareMenu(filePath);
    } else {
      await showErrorAlert(localizedString('ShareManager.GPXError'));
    }
  }

  /**
   * Source: `exportBackupAlertAction(forWorkouts:controller:)` — the progress alert, the backup,
   * then the share menu or the error. `null` workouts means "everything in the store", as the
   * source's default argument does. (Same localization note as above for the error string.)
   */
  static async exportBackupAlertAction(workouts: Workout[] | null): Promise<void> {
    const updateProgress: (progress: number, message?: string) => void = showProgressOverlay(
      localizedString('Loading'));
    updateProgress(0, localizedString('Settings.ExportBackupData.Message'));
    let filePath: string | null = null;
    try {
      filePath = await BackupManager.createBackup(workouts, (fraction: number): void => {
        updateProgress(fraction);
      });
    } finally {
      hideLoadingOverlay();
    }
    if (filePath !== null) {
      await ShareManager.displayShareMenu(filePath);
    } else {
      await showErrorAlert(localizedString('ShareManager.BackupError'));
    }
  }
}
