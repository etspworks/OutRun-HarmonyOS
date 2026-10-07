/*
 * S3 structure — port of `HKImportObjectCell`
 * (OutRun/Views/HealthKit/HKImportObjectCell.swift:23-110).
 *
 * Source tree: a rounded `containerView` 60pt tall, inset 10 on every side, holding two stacks —
 * left: dateLabel (the uppercased day string) over timeLabel; right: typeLabel (the uppercased type
 * description) over distanceLabel + durationLabel side by side, the duration rightmost.
 *
 * Every label is formatted from the query object (`CustomTimeFormatting.dayString/timeString`,
 * `CustomMeasurementFormatting.string`), never a literal — the captured state of this screen is
 * EMPTY, so the row is built from the source alone.
 *
 * S5 styles it: .foregroundColor container with a 25pt corner radius, dateLabel/typeLabel 14 bold
 * .secondaryColor, the three value labels 22 heavy .primaryColor, and the row on .backgroundColor.
 */
import { HKWorkoutQueryObject } from '../model/HKWorkoutQueryObject';
import { workoutTypeDescription } from '../model/WorkoutType';
import {
  CustomMeasurementFormatting,
  CustomTimeFormatting,
  FormattingMeasurementType,
  FormattingRoundingType
} from '../common/Formatting';

@Component
export struct HKImportObjectCell {
  /**
   * Source: `init(queryObject:)` — the cell holds the candidate it renders. Undecorated, like
   * WorkoutListCell's own `workout`: a @Prop copy of a model class arrives without its methods, and
   * LazyForEach rebuilds the row anyway.
   */
  queryObject: HKWorkoutQueryObject | null = null;
  /** Source: `cell.accessibilityIdentifier = "hk_import_itemroot"` — shared by every row. */
  @Prop rowId: string = 'hk_import_itemroot';
  /** Source: `tableView(_:didSelectRowAt:)` — the row's own confirm-and-import action. */
  onSelect?: () => void;

  build() {
    /** Source: `containerView` — 60pt tall, inset 10 inside the cell. */
    Row() {
      Column() {
        /** Source: `dateLabel.text = CustomTimeFormatting.dayString(...).uppercased()`. */
        Text(this.dayText())
          .fontSize(14)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.secondary_color'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        /** Source: `timeLabel.text = CustomTimeFormatting.timeString(forDate:)`. */
        Text(this.timeText())
          .fontSize(22)
          .fontWeight(900)
          .fontColor($r('app.color.primary_color'))
          .maxLines(1)
      }
      .alignItems(HorizontalAlign.Start)
      Blank()
      Column() {
        /** Source: `typeLabel.text = queryObject.type.description.uppercased()`, right-aligned. */
        Text(this.typeText())
          .fontSize(14)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.secondary_color'))
          .textAlign(TextAlign.End)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        /** Source: `distanceLabel.right == durationLabel.left - 10`. */
        Row({ space: 10 }) {
          /** Source: `distanceLabel` — .distance, one digit. */
          Text(this.distanceText())
            .fontSize(22)
            .fontWeight(900)
            .fontColor($r('app.color.primary_color'))
            .textAlign(TextAlign.End)
            .maxLines(1)
          /** Source: `durationLabel` — .time, whole numbers, pinned rightmost. */
          Text(this.durationText())
            .fontSize(22)
            .fontWeight(900)
            .fontColor($r('app.color.primary_color'))
            .textAlign(TextAlign.End)
            .maxLines(1)
        }
      }
      .alignItems(HorizontalAlign.End)
    }
    /**
     * S5, transcribed from the source cell (HKImportObjectCell.swift:26-70): the `containerView` is
     * .foregroundColor with a 25pt corner radius, 60pt tall, inset 10 inside a .backgroundColor
     * cell, and its labels sit on a 20pt left/right and 10pt top/bottom inner margin.
     */
    .width('100%')
    .height(60)
    .alignItems(VerticalAlign.Center)
    .backgroundColor($r('app.color.foreground_color'))
    .borderRadius(25)
    .padding({ left: 20, right: 20, top: 10, bottom: 10 })
    .id(this.rowId)
    .onClick(() => {
      this.runSelectAction();
    })
  }

  private dayText(): string {
    const object: HKWorkoutQueryObject | null = this.queryObject;
    return object !== null ? CustomTimeFormatting.dayString(object.startDate).toUpperCase() : '';
  }

  private timeText(): string {
    const object: HKWorkoutQueryObject | null = this.queryObject;
    return object !== null ? CustomTimeFormatting.timeString(object.startDate) : '';
  }

  /** Source: `typeLabel.text = queryObject.type.description.uppercased()`. */
  private typeText(): string {
    const object: HKWorkoutQueryObject | null = this.queryObject;
    return object !== null ? workoutTypeDescription(object.type).toUpperCase() : '';
  }

  private distanceText(): string {
    const object: HKWorkoutQueryObject | null = this.queryObject;
    return object !== null ? CustomMeasurementFormatting.string(object.distance,
      FormattingMeasurementType.DISTANCE, FormattingRoundingType.ONE_DIGIT) : '';
  }

  private durationText(): string {
    const object: HKWorkoutQueryObject | null = this.queryObject;
    return object !== null ? CustomMeasurementFormatting.string(object.duration,
      FormattingMeasurementType.TIME, FormattingRoundingType.WHOLE_NUMBERS) : '';
  }

  private runSelectAction(): void {
    if (this.onSelect !== undefined) {
      this.onSelect();
    }
  }
}
