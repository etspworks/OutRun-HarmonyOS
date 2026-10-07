/*
 * S3 structure — port of `WorkoutListHeader` (OutRun/Views/Workout/WorkoutListHeader.swift): the
 * accent timeline line plus the day label. `init(dayIdentifier:)` resolves the title through
 * `CustomTimeFormatting.dayString(forIdentifier:) ?? "ERROR"`, so the label is DATA-BOUND.
 *
 * S5 style, from the source verbatim:
 *   view      .backgroundColor
 *   lineView  4pt wide, left 18, .accentColor at 25% alpha, full height
 *   label     .secondaryColor / systemFont 16 .bold, 30pt tall, 18pt right of the line
 */
import { CustomTimeFormatting } from '../common/Formatting';

@Component
export struct WorkoutListHeader {
  /** Source: `init(dayIdentifier:)` — the workout's `dayIdentifier`. */
  @Prop dayIdentifier: string;

  build() {
    Row() {
      /** Source: `lineView`. */
      Divider()
        .vertical(true)
        .strokeWidth(4)
        .color($r('app.color.accent_color'))
        .opacity(0.25)
        .height('100%')
        .margin({ left: 18 })
      /** Source: `label` — the formatted day, "ERROR" when the identifier cannot be parsed. */
      Text(this.dayTitle())
        .fontSize(16)
        .fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.secondary_color'))
        .layoutWeight(1)
        .margin({ left: 18, right: 20 })
    }
    .width('100%')
    .height(30)
    .alignItems(VerticalAlign.Center)
    .backgroundColor($r('app.color.background_color'))
  }

  /** Source: `CustomTimeFormatting.dayString(forIdentifier:) ?? "ERROR"`. */
  private dayTitle(): string {
    const title: string | null = CustomTimeFormatting.dayStringForIdentifier(this.dayIdentifier);
    return title !== null ? title : 'ERROR';
  }
}
