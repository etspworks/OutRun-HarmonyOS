/*
 * S3 structure — port of `WorkoutHeaderView` (OutRun/Views/Workout/WorkoutHeaderView.swift): a 30pt
 * row holding one accent-coloured title label, inset 20 from the left. Used as the header of every
 * stats card and of the comment card.
 */
@Component
export struct WorkoutHeaderView {
  @Prop title: string = '';

  build() {
    Row() {
      /** Source: `label` — systemFont 16 .bold in `color ?? .accentColor`, 20 in from the left. */
      Text(this.title)
        .fontSize(16)
        .fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.accent_color'))
        .maxLines(1)
    }
    /* S5 style, verbatim from WorkoutHeaderView.swift:26-46: a 30pt band on .backgroundColor. */
    .width('100%')
    .height(30)
    .alignItems(VerticalAlign.Center)
    .padding({ left: 20, right: 20 })
    .backgroundColor($r('app.color.background_color'))
  }
}
