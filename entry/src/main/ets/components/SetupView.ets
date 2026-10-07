/*
 * Port of `SetupView` (OutRun/Views/Setup/SetupView.swift).
 *
 * One wizard page: titleLabel, textLabel and the `customViewClosure`'s subtree. The closure is a
 * slot, so it becomes a @BuilderParam the owning page fills with that page's own rows.
 *
 * S5 style, transcribed from the source's own fonts/constraints (not measured off the capture):
 *   titleLabel  .primaryColor   / systemFont 24 .bold,   centered, top of the page
 *   textLabel   .secondaryColor / systemFont 14 .medium, centered, title.bottom + 10
 *   custom view textLabel.bottom + 20, and every page insets its rows by 10 each side
 * UILabel sizes to the font's own line height (28.6pt / 16.7pt in the capture), which ArkUI does
 * not do by default — both are pinned with lineHeight().
 */
@Component
export struct SetupView {
  /** Source: `init(title:)`. */
  title: string = '';
  /** Source: `init(text:)`. */
  text: string = '';
  /** Source: `customViewClosure` — the rows this page carries. */
  @BuilderParam customView: () => void;

  build() {
    Column() {
      Text(this.title)
        .fontSize(24)
        .fontWeight(FontWeight.Bold)
        .lineHeight(29)
        .fontColor($r('app.color.primary_color'))
        .textAlign(TextAlign.Center)
        .width('100%')
      Text(this.text)
        .fontSize(14)
        .fontWeight(FontWeight.Medium)
        .lineHeight(17)
        .fontColor($r('app.color.secondary_color'))
        .textAlign(TextAlign.Center)
        .width('100%')
        .margin({ top: 10 })
      Column() {
        this.customView()
      }
      .width('100%')
      .margin({ top: 20 })
      .padding({ left: 10, right: 10 })
    }
    .width('100%')
  }
}
