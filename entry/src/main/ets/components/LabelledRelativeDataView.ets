/*
 * S3 structure — port of `LabelledRelativeDataView`
 * (OutRun/Views/Data/LabelledRelativeDataView.swift): like LabelledDataView, except the headline is
 * `title + " - " + value.relativeUnit` (both uppercased) and the value is the RelativeMeasurement's
 * `stringRepresentation`; with no measurement the headline drops the unit and the value reads "--".
 */
@Component
export struct LabelledRelativeDataView {
  @Prop title: string = '';
  /** Source: `newValue.stringRepresentation`. */
  @Prop value: string = '';
  /** Source: `newValue.relativeUnit`. */
  @Prop relativeUnit: string = '';

  build() {
    Column() {
      /** Source: `headlineLabel` — 14 .bold, .secondaryColor, uppercased. */
      Text(this.headline())
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

  private headline(): string {
    if (this.value === '' || this.relativeUnit === '') {
      return this.title.toUpperCase();
    }
    return `${this.title} - ${this.relativeUnit}`.toUpperCase();
  }
}
