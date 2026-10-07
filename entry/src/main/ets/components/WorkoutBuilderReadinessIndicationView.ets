/*
 * S3 structure — port of `WorkoutBuilderReadinessIndicationView`
 * (OutRun/Views/Workout/WorkoutBuilderReadinessIndicationView.swift): a rounded 30pt pill holding an
 * 8pt status dot and `status.title.uppercased()`, both bound to the builder's status. The whole view
 * carries a tap recogniser (`displayIndicationAlert`), hence its source identifier lives here.
 */
import { WorkoutBuilderStatus, workoutBuilderStatusTitle, workoutBuilderStatusColor }
  from '../model/WorkoutBuilderStatus';

@Component
export struct WorkoutBuilderReadinessIndicationView {
  /** Source: `status` — its didSet re-renders the dot and the label. */
  @Prop status: WorkoutBuilderStatus = WorkoutBuilderStatus.WAITING;
  /** Source: `UITapGestureRecognizer(target: self, action: #selector(displayIndicationAlert))`. */
  onTap?: () => void;

  build() {
    Row() {
      /** Source: `statusIndicator` — 8x8, cornerRadius 4, filled with `status.color`. */
      Row()
        .width(8)
        .height(8)
        .borderRadius(4)
        .backgroundColor(workoutBuilderStatusColor(this.status))
      /** Source: `statusLabel.text = status.title.uppercased()`, 8pt right of the dot. */
      Text(workoutBuilderStatusTitle(this.status).toUpperCase())
        .fontSize(12)
        .fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.secondary_color'))
        .maxLines(1)
        .margin({ left: 8 })
    }
    /*
     * S5 style, verbatim from WorkoutBuilderReadinessIndicationView.swift:44-66: a 30pt pill on
     * .backgroundColor with cornerRadius 15, the dot 10 in from the left and the label 10 from
     * the right.
     */
    .height(30)
    .alignItems(VerticalAlign.Center)
    .padding({ left: 10, right: 10 })
    .backgroundColor($r('app.color.background_color'))
    .borderRadius(15)
    .id('new_workout_readiness')
    .onClick(() => {
      this.tapped();
    })
  }

  private tapped(): void {
    if (this.onTap !== undefined) {
      this.onTap();
    }
  }
}
