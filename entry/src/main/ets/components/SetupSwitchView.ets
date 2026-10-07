/*
 * Port of `SetupSwitchView`
 * (OutRun/Views/Setup/SetupActionViews/SetupSwitchView.swift). Swift subclassing has no ArkTS
 * equivalent, so the inheritance is split into composition: `SetupActionView` renders the half the
 * SUPERCLASS owns (the title button), and this component renders the only subview THIS class adds —
 * the UISwitch and its `valueChanged` wiring. The owning page composes the two.
 *
 * S5 style: `swit.onTintColor = .accentColor` on the stock 51x31 UISwitch.
 */
@Component
export struct SetupSwitchView {
  /** Source: `init(isOn:)` — page-owned, so the page can force it off (toggleAutoImportOption). */
  @Prop isOn: boolean;
  /** Rule 12 slug of the source's `switch`. */
  switchSlug: string = '';
  /** Source: `switchActionClosure`, fired from `switchActionSelector(sender:)`. */
  switchAction: (on: boolean) => void = (on: boolean): void => {
  };

  build() {
    Toggle({ type: ToggleType.Switch, isOn: this.isOn })
      .id(this.switchSlug)
      .width(51)
      .height(31)
      .selectedColor($r('app.color.accent_color'))
      .onChange((on: boolean) => {
        this.switchAction(on);
      })
  }
}
