/*
 * S3 structure — port of `WorkoutCompletionBanner`
 * (OutRun/Views/Workout/WorkoutCompletionBanner.swift): the CONTENT of an ORBaseBanner
 * (isDismissable: false) — ArkUI composes where Swift subclassed, so the screen renders the base
 * banner around this. The content is the title, a Continue/Discard row and a full-width Save button beneath them. Each
 * button runs the matching `WorkoutCompletionActionHandler` action and then dismisses the banner —
 * here those actions are the queued banner's own `BannerAction`s, keyed by the source's
 * accessibilityIdentifiers, so the handler's didPerformAction guard still owns the behaviour.
 */
import { Banner, BannerAction } from '../common/BannerQueue';
import { localizedString } from '../common/LocalizedStrings';

/**
 * S5 style, verbatim from WorkoutCompletionBanner.swift:26-72,104-134: a 24 .bold .primaryColor
 * title, then Continue and Discard side by side and Save below, all 40pt tall with cornerRadius 10
 * and a 10pt gap — Save on .accentColor with a white title, the other two on .foregroundColor with
 * `.gray` titles.
 */
const GRAY: string = '#8E8E93';

@Component
export struct WorkoutCompletionBanner {
  banner: Banner | null = null;

  build() {
    Column() {
        /** Source: `titleLabel` — 24 .bold, .primaryColor, one line. */
        Text(localizedString('NewWorkoutCompletion.Title'))
          .fontSize(24)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.primary_color'))
          .maxLines(1)
          .width('100%')
        Row({ space: 10 }) {
          /** Source: `continueButton` -> handler.continueWorkout() then dismiss(). */
          Button(localizedString('Continue'))
            .id('workout_completion_continue')
            .type(ButtonType.Normal)
            .layoutWeight(1)
            .height(40)
            .borderRadius(10)
            .backgroundColor($r('app.color.foreground_color'))
            .fontSize(16)
            .fontWeight(FontWeight.Bold)
            .fontColor(GRAY)
            .onClick(() => {
              this.run('workout_completion_continue');
            })
          /** Source: `discardButton` -> handler.discardWorkout() then dismiss(). */
          Button(localizedString('Discard'))
            .id('workout_completion_discard')
            .type(ButtonType.Normal)
            .layoutWeight(1)
            .height(40)
            .borderRadius(10)
            .backgroundColor($r('app.color.foreground_color'))
            .fontSize(16)
            .fontWeight(FontWeight.Bold)
            .fontColor(GRAY)
            .onClick(() => {
              this.run('workout_completion_discard');
            })
        }
        .width('100%')
        .margin({ top: 10, bottom: 10 })
        /** Source: `saveButton` -> handler.saveWorkout() then dismiss(). */
        Button(localizedString('Save'))
          .id('workout_completion_save')
          .type(ButtonType.Normal)
          .width('100%')
          .height(40)
          .borderRadius(10)
          .backgroundColor($r('app.color.accent_color'))
          .fontSize(16)
          .fontWeight(FontWeight.Bold)
          .fontColor(Color.White)
          .onClick(() => {
            this.run('workout_completion_save');
          })
    }
    .width('100%')
  }

  /** Source: each button's selector — the handler's action, then `dismiss()`. */
  private run(actionId: string): void {
    const current: Banner | null = this.banner;
    if (current === null) {
      return;
    }
    const actions: BannerAction[] = current.actions;
    for (const action of actions) {
      if (action.id === actionId) {
        action.run();
      }
    }
    current.dismiss();
  }
}
