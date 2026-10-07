/*
 * Port of `StartScreenFeatureView` (OutRun/Views/Setup/StartScreenFeatureView.swift).
 *
 * Source tree: a UIView holding an imageView (60pt square, scaleAspectFit, pinned left/top
 * inset 5) and two stacked labels to its right — titleLabel above textLabel (offset 5), both
 * 15pt to the right of the image. One static feature card; the source sets all three values
 * once at init, and the parent supplies them, so each is @Prop.
 *
 * S5 style, taken from the source verbatim (not eyeballed off the capture):
 *   titleLabel  .primaryColor   / systemFont 14 .bold
 *   textLabel   .secondaryColor / systemFont 14 .medium
 *   imageView   .alwaysTemplate — tinted to .accentColor
 */

/**
 * `imageView.image?.withRenderingMode(.alwaysTemplate)` — the bundled glyphs are black
 * template PNGs, so ArkUI's `fillColor` (SVG-only) cannot tint them. This 4x5 matrix drives
 * R/G/B from the ALPHA column, which reproduces accent_color (#FF9200 = 1.0, 0.573, 0.0) on
 * the opaque pixels and leaves fully transparent ones at zero.
 */
const ACCENT_TEMPLATE_TINT: ColorFilter = new ColorFilter([
  0, 0, 0, 1.000, 0,
  0, 0, 0, 0.573, 0,
  0, 0, 0, 0.000, 0,
  0, 0, 0, 1, 0
]);

@Component
export struct StartScreenFeatureView {
  /** Source: `titleLabel.text` — LS["Setup.Feature.*.Title"]. */
  @Prop title: string = '';
  /** Source: `textLabel.text` — LS["Setup.Feature.*.Message"]. */
  @Prop description: string = '';
  /** Source: `imageView.image` — the bundled .setupRoute / .setupChart / .setupLock asset. */
  @Prop image: Resource | null = null;

  build() {
    Row({ space: 15 }) {
      if (this.image !== null) {
        Image(this.image)
          .width(60)
          .height(60)
          .objectFit(ImageFit.Contain)
          .colorFilter(ACCENT_TEMPLATE_TINT)
          .margin({ top: 5 })
      }
      Column() {
        Text(this.title)
          .fontSize(14)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.primary_color'))
          .lineHeight(17)
          .width('100%')
        Text(this.description)
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.secondary_color'))
          .lineHeight(17)
          .width('100%')
          .margin({ top: 5 })
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)
    }
    .width('100%')
    .alignItems(VerticalAlign.Top)
  }
}
