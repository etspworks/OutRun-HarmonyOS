/*
 * S3 structure — port of `ButtonSetting`'s cell
 * (OutRun/Models/Settings/Setting Models/ButtonSetting.swift): a TitleSetting whose label is
 * coloured as a button (`buttonColor`, `.red` for the destructive 'Delete all data' row) and whose
 * action only runs while `isEnabled`. The colour is S5's; the row is structurally a tappable label.
 *
 * S5 style, from the source cell (ButtonSetting.swift): `textLabel.textColor =
 * isEnabled ? buttonColor : .secondaryColor`, buttonColor defaulting to .accentColor and being
 * .red on the destructive rows; .preferredFont(.body) (17pt -> 16fp); the usual 44pt cell.
 */
/** Source: `buttonColor: .red` — UIKit's systemRed, resolved at capture (palette.json light). */
const DESTRUCTIVE_COLOR: string = '#FF3B30';

@Component
export struct ButtonSetting {
  @Prop title: string = '';
  /** Source: `buttonColor: .red` — carried as structure so S5 knows which colour to apply. */
  @Prop destructive: boolean = false;
  /** Source: `isEnabledClosure()` — the Apple Health buttons are disabled while sync is off. */
  @Prop isEnabled: boolean = true;
  @Prop rowId: string = 'settings_itemroot';
  /**
   * S6: a grouped UITableView closes each SECTION with an edge-to-edge rule and separates the
   * rows inside it with the inset one. Style only — the divider itself is unchanged.
   */
  @Prop lastInSection: boolean = false;
  onSelect?: () => void;

  build() {
    Column() {
      Row() {
        Text(this.title)
          .fontSize(16)
          .fontColor(this.labelColor())
          .layoutWeight(1)
          /** S6: UITableViewCell's textLabel truncates its tail — a long localized title
           * must not wrap the 44pt row. */
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')
      .height(44)
      .alignItems(VerticalAlign.Center)
      .padding({ left: 16, right: 16 })
      .backgroundColor($r('app.color.background_color'))
      .id(this.rowId)
      .enabled(this.isEnabled)
      .onClick(() => {
        this.runSelectAction();
      })
      Divider()
        .strokeWidth(0.5)
        .color($r('app.color.table_view_separator'))
        .margin({ left: this.lastInSection ? 0 : 16 })
    }
    .width('100%')
  }

  /**
   * Source: `cell.textLabel?.textColor = isEnabledClosure() ? buttonColorClosure() :
   * .secondaryColor`, with `buttonColor: .red` on the destructive rows and `.accentColor` default.
   */
  private labelColor(): ResourceColor {
    if (!this.isEnabled) {
      return $r('app.color.secondary_color');
    }
    return this.destructive ? DESTRUCTIVE_COLOR : $r('app.color.accent_color');
  }

  /** Source: `runSelectAction(controller:)`, which is gated on `isEnabled`. */
  private runSelectAction(): void {
    if (this.onSelect !== undefined) {
      this.onSelect();
    }
  }
}
