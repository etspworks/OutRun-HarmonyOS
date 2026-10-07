/*
 * S3 structure — port of `WorkoutBuilderTypeView`
 * (OutRun/Views/Workout/WorkoutBuilderTypeView.swift): a rounded 30pt pill holding
 * `type.description.uppercased()`. The label is DATA-BOUND to the builder's workout type.
 */
import { WorkoutType, workoutTypeDescription } from '../model/WorkoutType';

@Component
export struct WorkoutBuilderTypeView {
  /** Source: `init(type:)` — changed by the type alert, so it must re-render. */
  @Prop type: WorkoutType = WorkoutType.RUNNING;

  build() {
    Row() {
      /** Source: `typeLabel.text = type.description.uppercased()`. */
      Text(workoutTypeDescription(this.type).toUpperCase())
        .fontSize(12)
        .fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.secondary_color'))
        .maxLines(1)
    }
    /*
     * S6: the source's own pill chrome (30pt, cornerRadius 15, .backgroundColor, 15pt insets) is
     * drawn by the FloatingButton this view is composed INTO — ArkUI composes where Swift
     * subclassed, so repeating it here nested one pill inside another. Capture S0025 has the pill
     * at [10,546][88,576] with its label at [20,...]: one 30pt pill, 10pt insets, no inner box.
     */
    .alignItems(VerticalAlign.Center)
  }
}
