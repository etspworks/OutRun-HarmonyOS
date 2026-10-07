/*
 * Port of `SetupActionView`
 * (OutRun/Views/Setup/SetupActionViews/SetupActionView.swift), the superclass every setup row
 * derives from. ArkTS structs cannot be subclassed, so the four subclasses COMPOSE this one and
 * pass their trailing control (switch / text field / segmented control / permission button) in.
 *
 * Source branch kept verbatim: with a `buttonAction` the title is a tappable bold button, without
 * one it is a disabled label (`button.isEnabled = false`) — so the tappable half is a real
 * conditional, not styling.
 *
 * S5 style, from the source verbatim:
 *   row height 40, button pinned left, trailing control right with a 5pt gap
 *   title      systemFont 16 .bold  .accentColor  when tappable (buttonAction != nil)
 *              systemFont 16 .medium .primaryColor when it is the disabled plain label
 */
@Component
export struct SetupActionView {
  /** Source: `init(title:)` — the row's `button` title. */
  title: string = '';
  /**
   * Rule 12 slug of the source's `button`. The formalities rows set one
   * (`setup_privacy_policy_open` / `setup_terms_of_service_open`); the permission rows' info
   * buttons set none, so they are found by their visible title instead.
   */
  titleSlug: string = '';
  /** Source: `init(buttonAction:)` — nil for the plain-label rows. */
  buttonAction: (() => void) | null = null;
  /** The subclass's trailing control. */
  @BuilderParam trailing: () => void;

  build() {
    Row() {
      if (this.buttonAction !== null) {
        Text(this.title)
          .id(this.titleSlug)
          .fontSize(16)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.accent_color'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .margin({ right: 5 })
          .onClick(() => {
            const action: (() => void) | null = this.buttonAction;
            if (action !== null) {
              action();
            }
          })
      } else {
        /** Source: `button.isEnabled = false` with `setTitleColor(.primaryColor, for: .disabled)`. */
        Text(this.title)
          .fontSize(16)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.primary_color'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .margin({ right: 5 })
      }
      Blank()
      this.trailing()
    }
    .width('100%')
    .height(40)
    .alignItems(VerticalAlign.Center)
  }
}
