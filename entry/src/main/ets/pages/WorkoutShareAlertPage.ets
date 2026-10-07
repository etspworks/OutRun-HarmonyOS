/*
 * S3 structure — port of `WorkoutShareAlert`
 * (OutRun/Controllers/Alerts/WorkoutShareAlert.swift:25-61).
 *
 * presentation: modal (a UIAlertController `.actionSheet` presented over WorkoutViewController), so
 * it is an ArkUI overlay mounted in its host page (WorkoutViewControllerPage), not a routed page —
 * which is also how it operates on the host's CURRENT workout instead of a route param.
 *
 * Source structure: title LS["WorkoutShareAlert.Title"] + message LS["WorkoutShareAlert.Message"]
 * over exactly three options — LS["WorkoutShareAlert.OutRunBackup"] (→
 * `ShareManager.exportBackupAlertAction(forWorkouts: [workout], controller:)`),
 * LS["WorkoutShareAlert.GPXExport"] (→ `ShareManager.exportGPXAlertAction(for:on:)`) and the
 * `.cancel`-styled LS["Cancel"] whose action is nil.
 *
 * Both export paths run in the HOST (it owns the workout); they reach the system share panel through
 * common/ShareManager.ts, i.e. ShareKit with the documented clipboard+toast fallback — never a float
 * window, which a self-signed build may not open.
 *
 * The two share options carry no accessibilityIdentifier in the source alert, so the capture matched
 * them by their visible text; the plan's slugs are kept as ids so the action contract can address
 * them too.
 */
import { hilog } from '@kit.PerformanceAnalysisKit';
import { router } from '@kit.ArkUI';
import { Workout } from '../model/Workout';
import { ShareManager } from '../common/ShareManager';
import { DataManager } from '../common/DataManager';
import { localizedString } from '../common/LocalizedStrings';

const DOMAIN: number = 0x0000;
const TAG: string = 'WorkoutShareAlert';

/** Capture S0061: the sheet's cards are inset 8pt, 8pt apart, 34pt clear of the screen bottom. */
const SHEET_INSET: number = 8;
const SHEET_GAP: number = 8;
const SHEET_BOTTOM_INSET: number = 34;
/** Capture S0061: 57pt action rows and the action sheet's own corner radius. */
const SHEET_ROW_HEIGHT: number = 57;
const SHEET_RADIUS: number = 14;

@CustomDialog
export struct WorkoutShareAlertPage {
  controller?: CustomDialogController;
  /**
   * Source: `WorkoutShareAlert.workout` — the host's CURRENT workout.
   * A custom dialog's builder parameters "do not support dynamic updates", and of the decorators
   * only @Link/@Consume listen for a change — "@Prop and @ObjectLink do not apply"
   * (harmonyos-references/ts-methods-custom-dialog-box, CustomDialogController constructor +
   * `builder`). The host builds its CustomDialogController as a member initializer, before
   * `aboutToAppear` loads the workout, so this @Prop is the null snapshot taken then and stays
   * null. It is therefore only a fallback: `liveWorkout()` resolves the host page's own
   * `workoutUUID` route param and re-reads the stored workout, which is also what the exporters
   * need — a @Prop copy would arrive without the methods `pauseRanges()` is called through.
   */
  @Prop workout: Workout | null = null;
  /** Source: the host's presented flag — cleared whenever this sheet dismisses itself. */
  @Link isShown: boolean;

  build() {
    /**
     * S5 geometry, measured off the capture (S0061 `base.ui.json`): a UIAlertController
     * `.actionSheet` is TWO stacked cards inset 8pt from the screen edges — the header + options
     * card at `[8,517][382,745]` and a SEPARATE cancel card at `[8,753][382,810]`, 8pt below it,
     * 34pt clear of the bottom. Rows are 57pt (not the 44pt of an `.alert`), and the cancel card
     * is opaque .backgroundColor while the options card takes the grouped .foregroundColor.
     */
    Column({ space: SHEET_GAP }) {
      Column() {
        Column() {
          /** Source: `title: LS["WorkoutShareAlert.Title"]`. */
          Text(localizedString('WorkoutShareAlert.Title'))
            /** S6: an action sheet's header is the 13pt semibold system token. */
            .fontSize(13)
            .fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.primary_color'))
            .textAlign(TextAlign.Center)
            .width('100%')
          /** Source: `message: LS["WorkoutShareAlert.Message"]`. */
          Text(localizedString('WorkoutShareAlert.Message'))
            /** S6: the message under it — 13pt regular, wrapping to the capture's three lines. */
            .fontSize(13)
            .fontWeight(FontWeight.Normal)
            .fontColor($r('app.color.secondary_color'))
            .textAlign(TextAlign.Center)
            .width('100%')
            .margin({ top: 7 })
        }
        .width('100%')
        .padding({ left: 16, right: 16, top: 15, bottom: 16 })
        this.optionSeparator()
        Button(localizedString('WorkoutShareAlert.OutRunBackup'))
          .id('outrun_backup')
          .type(ButtonType.Normal)
          .width('100%')
          .height(SHEET_ROW_HEIGHT)
          .backgroundColor($r('app.color.foreground_color'))
          /** S6: an action-sheet row's title is 20pt, not the 16pt of an alert's. */
          .fontSize(20)
          .fontWeight(FontWeight.Normal)
          .fontColor($r('app.color.accent_color'))
          .onClick(() => {
            this.shareBackup();
          })
        this.optionSeparator()
        Button(localizedString('WorkoutShareAlert.GPXExport'))
          .id('gpx_file')
          .type(ButtonType.Normal)
          .width('100%')
          .height(SHEET_ROW_HEIGHT)
          .backgroundColor($r('app.color.foreground_color'))
          /** S6: an action-sheet row's title is 20pt, not the 16pt of an alert's. */
          .fontSize(20)
          .fontWeight(FontWeight.Normal)
          .fontColor($r('app.color.accent_color'))
          .onClick(() => {
            this.shareGpx();
          })
      }
      .width('100%')
      .backgroundColor($r('app.color.foreground_color'))
      .borderRadius(SHEET_RADIUS)
      .clip(true)
      /** Source: the `.cancel` option (action nil) — its own opaque card, title semibold. */
      Button(localizedString('Cancel'))
        .id('cancel')
        .type(ButtonType.Normal)
        .width('100%')
        .height(SHEET_ROW_HEIGHT)
        .backgroundColor($r('app.color.background_color'))
        .borderRadius(SHEET_RADIUS)
        /** S6: the cancel card's title — 20pt semibold, as the capture shows it. */
        .fontSize(20)
        .fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.accent_color'))
        .onClick(() => {
          this.close();
        })
    }
    .width('100%')
    .padding({ left: SHEET_INSET, right: SHEET_INSET, bottom: SHEET_BOTTOM_INSET })
    /* Page-identity marker: mounted inside its host's window, so its root carries its route name. */
    .id('WorkoutShareAlert')
  }

  /** The hairline UIKit draws between an action sheet's rows. */
  @Builder
  optionSeparator() {
    Divider()
      .strokeWidth(0.5)
      .color($r('app.color.table_view_separator'))
  }

  /**
   * Source: `orBackupOption` — `ShareManager.exportBackupAlertAction(forWorkouts: [workout],
   * controller:)`: BackupManager encodes this ONE workout to a .orbup file and the system share
   * panel opens on it (ShareKit, with the documented clipboard+toast fallback inside ShareManager).
   */
  private async shareBackup(): Promise<void> {
    this.close();
    const current: Workout | null = await this.liveWorkout();
    if (current === null) {
      return;
    }
    try {
      await ShareManager.exportBackupAlertAction([current]);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'backup export failed: %{public}s', JSON.stringify(err));
    }
  }

  /** Source: `gpxOption` — `ShareManager.exportGPXAlertAction(for: workout, on:)`. */
  private async shareGpx(): Promise<void> {
    this.close();
    const current: Workout | null = await this.liveWorkout();
    if (current === null) {
      return;
    }
    try {
      await ShareManager.exportGPXAlertAction(current);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'GPX export failed: %{public}s', JSON.stringify(err));
    }
  }

  /** The stored workout the host is showing — with its methods, which the exporters call. */
  private async liveWorkout(): Promise<Workout | null> {
    const uuid: string | null = this.workoutUuid();
    if (uuid === null || uuid === '') {
      hilog.warn(DOMAIN, TAG, 'no workout to export: the host page carries no workoutUUID');
      return null;
    }
    return await DataManager.workout(uuid);
  }

  /**
   * The uuid of the workout being shared: the @Prop copy's when a host ever passes a live one,
   * else the host page's own `workoutUUID` route param — the same param
   * `WorkoutViewControllerPage.aboutToAppear()` loads its workout from. This sheet is an in-page
   * dialog of that host, so `router.getParams()` is the host's params.
   */
  private workoutUuid(): string | null {
    const copy: Workout | null = this.workout;
    const fromProp: string | null = copy !== null ? copy.uuid : null;
    if (fromProp !== null && fromProp !== '') {
      return fromProp;
    }
    const params: Record<string, string> = router.getParams() as Record<string, string>;
    const fromRoute: string | undefined = params !== undefined && params !== null
      ? params['workoutUUID'] : undefined;
    return fromRoute === undefined || fromRoute === null || fromRoute === '' ? null : fromRoute;
  }

  /** Source: the cancel option / a tap outside the action sheet. */
  private close(): void {
    this.isShown = false;
    if (this.controller !== undefined) {
      this.controller.close();
    }
  }
}
