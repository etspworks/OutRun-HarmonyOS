/*
 * S3 structure — port of `SelectionSetting`'s cell
 * (OutRun/Models/Settings/Setting Models/SelectionSetting.swift:37): a TitleSubTitle cell whose
 * `accessoryType` is `.checkmark` exactly while `isSelected`, and whose tap runs the select action
 * and then `setting.refresh()`.
 *
 * S5 style: the same .value1 cell as TitleSubTitleSetting (44pt, 16pt margins, hairline below),
 * with the `.checkmark` accessory drawn from the bundled checkmark asset tinted to .accentColor —
 * a UIKit checkmark takes the window tintColor, which AppDelegate:350 sets to .accentColor.
 */
import { drawing, common2D } from '@kit.ArkGraphics2D';

/**
 * Baseline icon tint: the bundled checkmark is a BLACK template PNG and ArkUI's `fillColor` is
 * SVG-only, so the accent tint is a SRC_IN blend filter over its alpha (#FF9200).
 */
const ACCENT: common2D.Color = { alpha: 255, red: 255, green: 146, blue: 0 };
const ACCENT_TINT: drawing.ColorFilter =
  drawing.ColorFilter.createBlendModeColorFilter(ACCENT, drawing.BlendMode.SRC_IN);

@Component
export struct SelectionSetting {
  @Prop title: string = '';
  @Prop subTitle: string = '';
  /** Source: `isSelectedClosure()` — bound to the stored value, so exactly one row is checked. */
  @Prop isSelected: boolean = false;
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
        /** Source: `accessoryType = self.isSelected ? .checkmark : .none`. */
        if (this.isSelected) {
          Image($r('app.media.checkmark'))
            .width(16)
            .height(16)
            .objectFit(ImageFit.Contain)
            .margin({ left: 8 })
            /* The black template asset tinted to .accentColor — the baseline's icon matrix. */
            .colorFilter(ACCENT_TINT)
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
