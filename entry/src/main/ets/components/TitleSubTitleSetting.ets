/*
 * S3 structure — port of `TitleSubTitleSetting`'s cell
 * (OutRun/Models/Settings/Setting Models/TitleSubTitleSetting.swift): a `.value1` cell whose
 * `textLabel` is the title and `detailTextLabel` the subtitle, with the disclosure chevron when
 * `doesRedirect`. Its `init(title:subTitle:_ settingsModel:)` pushes a further settings screen,
 * which is what `onSelect` carries here.
 *
 * S5 style, from the source cell (TitleSubTitleSetting.swift:32-40): a UITableViewCell `.value1` —
 * textLabel .primaryColor / detailTextLabel .secondaryColor, both .preferredFont(.body) (17pt ->
 * 16fp), the disclosure chevron after the detail label, 44pt row, 16pt margins, hairline below.
 */
@Component
export struct TitleSubTitleSetting {
  @Prop title: string = '';
  /** Source: `detailTextLabel?.text = self.subTitle` — DATA-BOUND, never a captured literal. */
  @Prop subTitle: string = '';
  @Prop doesRedirect: boolean = false;
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
          .fontColor($r('app.color.primary_color'))
          /** The .value1 cell shrinks its textLabel before its detailTextLabel. */
          .flexShrink(1)
          /** S6: UITableViewCell's textLabel truncates its tail — a long localized title
           * must not wrap the 44pt row. */
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Blank()
        Text(this.subTitle)
          .fontSize(16)
          .fontColor($r('app.color.secondary_color'))
          .textAlign(TextAlign.End)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        if (this.doesRedirect) {
          Text('\u203A')
            .fontSize(22)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.secondary_color'))
            .margin({ left: 8 })
        }
      }
      .width('100%')
      .height(44)
      .alignItems(VerticalAlign.Center)
      .padding({ left: 16, right: 16 })
      .backgroundColor($r('app.color.background_color'))
      .id(this.rowId)
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

  private runSelectAction(): void {
    if (this.onSelect !== undefined) {
      this.onSelect();
    }
  }
}
