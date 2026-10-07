/*
 * S3 structure — port of `LabelledDataView` (OutRun/Views/Data/LabelledDataView.swift): a headline
 * over one big value. `value` is the measurement already run through svc_formatting by the screen
 * (CustomMeasurementFormatting.string), and an absent measurement renders the source's "--".
 */
@Component
export struct LabelledDataView {
  /** Source: `headlineLabel.text = title.uppercased()`. */
  @Prop title: string = '';
  /** Source: `informationLabel.text` — the formatted measurement, or "--" when there is none. */
  @Prop value: string = '';

  build() {
    Column() {
      /** Source: `headlineLabel` — 14 .bold, .secondaryColor, uppercased. */
      Text(this.title.toUpperCase())
        .fontSize(14)
        .fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.secondary_color'))
        .maxLines(1)
        .width('100%')
      /** Source: `informationLabel` — 25 .heavy in the default label colour. */
      Text(this.value !== '' ? this.value : '--')
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
