/*
 * S3 structure — port of `LabelledTimeView` (OutRun/Views/Data/LabelledTimeView.swift): a headline
 * over a time of day; `CustomTimeFormatting.timeString` is applied by the card, and an absent date
 * renders the source's "--".
 */
@Component
export struct LabelledTimeView {
  @Prop title: string = '';
  /** Source: `timeLabel.text = CustomTimeFormatting.timeString(forDate:)`. */
  @Prop timeText: string = '';

  build() {
    Column() {
      /** Source: `headlineLabel` — 14 .bold, .secondaryColor, uppercased. */
      Text(this.title.toUpperCase())
        .fontSize(14)
        .fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.secondary_color'))
        .maxLines(1)
        .width('100%')
      /** Source: `timeLabel` — 25 .heavy in the default label colour. */
      Text(this.timeText !== '' ? this.timeText : '--')
        .fontSize(25)
        .fontWeight(900)
        .fontColor($r('app.color.primary_color'))
        .maxLines(1)
        .width('100%')
    }
    .alignItems(HorizontalAlign.Start)
    /* Source: the enclosing UIStackView is `.fillEqually`, so each tile takes an equal share. */
    .layoutWeight(1)
  }
}
