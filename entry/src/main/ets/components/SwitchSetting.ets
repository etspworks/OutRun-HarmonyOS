/*
 * S3 structure — port of `SwitchSetting`'s cell
 * (OutRun/Models/Settings/Setting Models/SwitchSetting.swift:50-77): a title label with a trailing
 * `UISwitch`; the whole cell is `isUserInteractionEnabled = isEnabled()` and its content alpha is
 * 0.5 while disabled (the Auto Import row while workout sync is off). The switch itself carries the
 * row's identifier, because the switch is the control the replay taps.
 *
 * S5 style, from the source cell (SwitchSetting.swift:39-75): titleLabel .preferredFont(.body)
 * (17pt -> 16fp) in .primaryColor, `switchView.onTintColor = .accentColor`, a UISwitch's own
 * 51x31pt, the whole contentView at alpha 0.5 while disabled, 44pt row, 16pt margins, hairline.
 */
@Component
export struct SwitchSetting {
  @Prop title: string = '';
  /** Source: `switchView.isOn = isOnClosure()` — bound to the stored preference. */
  @Prop isOn: boolean = false;
  /** Source: `cell.isUserInteractionEnabled = isEnabledClosure()`. */
  @Prop isEnabled: boolean = true;
  @Prop rowId: string = 'settings_itemroot';
  /**
   * S6: a grouped UITableView closes each SECTION with an edge-to-edge rule and separates the
   * rows inside it with the inset one. Style only — the divider itself is unchanged.
   */
  @Prop lastInSection: boolean = false;
  /** Source: `switchToggleAction(sender.isOn, self)`. */
  onToggle?: (newValue: boolean) => void;

  build() {
    Column() {
      Row() {
        Text(this.title)
          .fontSize(16)
          .fontColor($r('app.color.primary_color'))
          .layoutWeight(1)
          /** S6: UITableViewCell's textLabel truncates its tail — a long localized title
           * must not wrap the 44pt row. */
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Blank()
        Toggle({ type: ToggleType.Switch, isOn: this.isOn })
          .id(this.rowId)
          /**
           * Source parity, not decoration: in the source's own element tree the `UISwitch` node
           * carries the row's title as its accessibility label (capture S0037: `Switch text='Race'`
           * beside the `StaticText 'Race'`), which is why a label-matched tap there lands on the
           * SWITCH. The ArkUI `Toggle` renders no text of its own, so without this the title Text
           * is the only node carrying the label — and it is correctly NOT tappable
           * (`SwitchSetting.swift:53-56`: `selectionStyle = .none`, `runSelectAction` returns), so
           * such a tap does nothing at all.
           */
          .accessibilityText(this.title)
          .width(51)
          .height(31)
          .selectedColor($r('app.color.accent_color'))
          .switchPointColor(Color.White)
          .enabled(this.isEnabled)
          .onChange((isOn: boolean) => {
            this.switchToggled(isOn);
          })
      }
      .width('100%')
      .height(44)
      .alignItems(VerticalAlign.Center)
      .padding({ left: 16, right: 16 })
      .backgroundColor($r('app.color.background_color'))
      /** Source: `cell.contentView.alpha = isEnabledClosure() ? 1 : 0.5`. */
      .opacity(this.isEnabled ? 1 : 0.5)
      .enabled(this.isEnabled)
      Divider()
        .strokeWidth(0.5)
        .color($r('app.color.table_view_separator'))
        .margin({ left: this.lastInSection ? 0 : 16 })
    }
    .width('100%')
  }

  private switchToggled(isOn: boolean): void {
    if (this.onToggle !== undefined) {
      this.onToggle(isOn);
    }
  }
}
