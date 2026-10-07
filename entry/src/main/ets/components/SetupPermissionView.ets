/*
 * Port of `SetupPermissionView`
 * (OutRun/Views/Setup/SetupActionViews/SetupPermissionView.swift). The whole body of that class is
 * "hold the row's `permissionButton` and constrain it centre-right at 24pt", so that is all this
 * component does: the superclass half is `SetupActionView`, the button itself is `PermissionButton`,
 * and the page composes the three.
 */
@Component
export struct SetupPermissionView {
  /** Source: `permissionButton` — the `PermissionButton` this row carries. */
  @BuilderParam permissionButton: () => void;

  build() {
    Row() {
      this.permissionButton()
    }
    .height(24)
    .alignItems(VerticalAlign.Center)
    .justifyContent(FlexAlign.End)
  }
}
