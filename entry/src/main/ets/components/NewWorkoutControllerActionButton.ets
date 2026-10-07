/*
 * S3 structure — port of `NewWorkoutControllerActionButton`
 * (OutRun/Views/Workout/NewWorkoutControllerActionButton.swift): one view holding three buttons
 * whose visibility is driven by `transition(to status:)` — the full-width Start button while the
 * builder is idle (DISABLED, titled "..." , while .waiting; enabled at .ready), and the
 * pause/continue + Stop pair while it is active, the pause icon swapping to play while paused.
 * The three source accessibilityIdentifiers are attached here.
 */
import { WorkoutBuilderStatus, workoutBuilderStatusIsActive, workoutBuilderStatusIsPaused }
  from '../model/WorkoutBuilderStatus';
import { drawing, common2D } from '@kit.ArkGraphics2D';
import { localizedString } from '../common/LocalizedStrings';

/**
 * S5 style, verbatim from NewWorkoutControllerActionButton.swift:29-38,122-133: every button is
 * cornerRadius 20 and 50pt tall, titled 18 .bold; `.gray` is UIKit's systemGray and `.lightGray`
 * its disabled title colour. The pause glyph is a black template PNG, so its white tint is a
 * SRC_IN blend filter (ArkUI's `fillColor` is SVG-only).
 */
const GRAY: string = '#8E8E93';
const LIGHT_GRAY: string = '#AEAEB2';
const WHITE: common2D.Color = { alpha: 255, red: 255, green: 255, blue: 255 };
const WHITE_TINT: drawing.ColorFilter =
  drawing.ColorFilter.createBlendModeColorFilter(WHITE, drawing.BlendMode.SRC_IN);

@Component
export struct NewWorkoutControllerActionButton {
  /** Source: `lastStatus` / `transition(to:)`. */
  @Prop status: WorkoutBuilderStatus = WorkoutBuilderStatus.WAITING;
  /** Source: `actionClosure(self, .start)`. */
  onStart?: () => void;
  /** Source: `actionClosure(self, .stop)`. */
  onStop?: () => void;
  /** Source: `actionClosure(self, .pauseOrContinue)`. */
  onPauseOrContinue?: () => void;

  build() {
    Row() {
      /** Source: the .waiting/.ready half — only startButton is visible. */
      if (!workoutBuilderStatusIsActive(this.status)) {
        Button(this.status === WorkoutBuilderStatus.READY ? localizedString('Start') : '...')
          .id('new_workout_start')
          .type(ButtonType.Normal)
          .layoutWeight(1)
          .height('100%')
          .borderRadius(20)
          /* Source: `startButton.backgroundColor = status == .waiting ? .gray : .accentColor`. */
          .backgroundColor(this.status === WorkoutBuilderStatus.READY
            ? $r('app.color.accent_color') : GRAY)
          .fontSize(18)
          .fontWeight(FontWeight.Bold)
          /* Source: `setTitleColor(.white, .normal)` / `.lightGray, .disabled`. */
          .fontColor(this.status === WorkoutBuilderStatus.READY ? Color.White : LIGHT_GRAY)
          .enabled(this.status === WorkoutBuilderStatus.READY)
          .onClick(() => {
            this.start();
          })
      } else {
        /** Source: `pauseOrContinueButton.setImage(status == .paused ? .play : .pause)`. */
        Button() {
          Image(workoutBuilderStatusIsPaused(this.status)
            ? $r('app.media.play') : $r('app.media.pause'))
            .width(20)
            .height(20)
            .objectFit(ImageFit.Contain)
            /* Source: `imageView?.tintColor = .white` over a black template PNG. */
            .colorFilter(WHITE_TINT)
        }
        .id('new_workout_pause_continue')
        .type(ButtonType.Normal)
        /* Source: `make.width.equalTo(pauseOrContinueButton.snp.height)` — a 50pt square. */
        .width(50)
        .height('100%')
        .borderRadius(20)
        .backgroundColor(GRAY)
        .margin({ right: 10 })
        .onClick(() => {
          this.pauseOrContinue();
        })
        Button(localizedString('Stop'))
          .id('new_workout_stop')
          .type(ButtonType.Normal)
          .layoutWeight(1)
          .height('100%')
          .borderRadius(20)
          /* Source: `stopButton` is built with `backgroundColor: .accentColor`. */
          .backgroundColor($r('app.color.accent_color'))
          .fontSize(18)
          .fontWeight(FontWeight.Bold)
          .fontColor(Color.White)
          .onClick(() => {
            this.stop();
          })
      }
    }
    .width('100%')
    /* Source: `actionButton.snp` — `make.height.equalTo(50)` in NewWorkoutViewController. */
    .height(50)
  }

  private start(): void {
    if (this.onStart !== undefined) {
      this.onStart();
    }
  }

  private stop(): void {
    if (this.onStop !== undefined) {
      this.onStop();
    }
  }

  private pauseOrContinue(): void {
    if (this.onPauseOrContinue !== undefined) {
      this.onPauseOrContinue();
    }
  }
}
