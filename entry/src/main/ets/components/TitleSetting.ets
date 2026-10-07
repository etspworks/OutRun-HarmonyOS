/*
 * S3 structure — port of `TitleSetting`'s cell
 * (OutRun/Models/Settings/Setting Models/TitleSetting.swift): a plain `UITableViewCell` showing
 * `title`, with `accessoryType = doesRedirect ? .disclosureIndicator : .none`, tapped through
 * `SettingsViewController.tableView(_:didSelectRowAt:)` -> `setting.runSelectAction(controller:)`.
 *
 * Primitives, not the `Setting` object: the five other row kinds are built from the same list and
 * two of them (`UnitPreferenceSetting`, the edit-workout rows) are not instances of the engine's
 * classes, so one object-typed prop could not carry them all.
 * S5 style, from the source's own cell (TitleSetting.swift:40-45), not measured off the capture:
 *   cell.backgroundColor      .backgroundColor
 *   textLabel.textColor       .primaryColor, .preferredFont(.body) (17pt -> 16fp, the token doc's
 *                             16-18fp band for iOS .body)
 *   accessoryType             .disclosureIndicator - drawn by UIKit, so a text chevron in
 *                             .secondaryColor stands in for it (icon-map: systemSuppliedGlyphs)
 *   row metrics               UITableViewCell defaults: 44pt tall, 16pt layout margins,
 *                             a .tableViewSeparator hairline under the cell inset to the margin
 */
@Component
export struct TitleSetting {
  @Prop title: string = '';
  /** Source: `doesRedirect` — the disclosure chevron. */
  @Prop doesRedirect: boolean = false;
  /** Source: `ButtonSetting`-style gating; plain TitleSettings are always enabled. */
  @Prop isEnabled: boolean = true;
  /** Source: `cell.accessibilityIdentifier = "settings_itemroot"` (SettingsViewController:80). */
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
          .layoutWeight(1)
          /** S6: UITableViewCell's textLabel truncates its tail — a long localized title
           * must not wrap the 44pt row. */
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Blank()
        /** Source: `.disclosureIndicator` — drawn by UIKit, so there is no source asset to carry. */
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
      .enabled(this.isEnabled)
      .onClick(() => {
        this.runSelectAction();
      })
      /** Source: `tableView.separatorColor = .tableViewSeparator`, inset to the cell margin. */
      Divider()
        .strokeWidth(0.5)
        .color($r('app.color.table_view_separator'))
        .margin({ left: this.lastInSection ? 0 : 16 })
    }
    .width('100%')
  }

  /** Source: `runSelectAction(controller:)`, which the table's didSelectRowAt calls. */
  private runSelectAction(): void {
    if (this.onSelect !== undefined) {
      this.onSelect();
    }
  }
}
