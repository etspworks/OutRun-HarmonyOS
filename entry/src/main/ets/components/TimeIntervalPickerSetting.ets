/*
 * S3 structure — port of `TimeIntervalPickerSetting`
 * (OutRun/Models/Settings/Setting Models/TimeIntervalPickerSetting.swift): a value1 cell whose
 * inputView is a three-component `UIPickerView` over hours, minutes and seconds, and whose detail
 * label shows the chosen interval. The three wheels are three columns, as in the source. *
 * S5 style: an `InputViewSetting` renders the same UITableViewCell `.value1` every other settings
 * row does — title .primaryColor / detail .secondaryColor at .preferredFont(.body) (17pt -> 16fp),
 * 44pt tall, 16pt margins, a .tableViewSeparator hairline below. The inline wheel below the row is
 * the source's `inputView` and only exists while the row is the first responder.
 */
@Component
export struct TimeIntervalPickerSetting {
  @Prop title: string = '';
  /** Source: the cell's detail label — the interval as the caller formatted it. */
  @Prop intervalText: string = '';
  /** Source: `startValue` — the interval in seconds. */
  @Prop interval: number = 0;
  @Prop rowId: string = 'settings_itemroot';
  /**
   * S6: a grouped UITableView closes each SECTION with an edge-to-edge rule and separates the
   * rows inside it with the inset one. Style only — the divider itself is unchanged.
   */
  @Prop lastInSection: boolean = false;
  /** Source: `timeIntervalSelectionAction(interval, self)`. */
  onIntervalSelected?: (seconds: number) => void;

  @State private isPickerOpen: boolean = false;
  /** The three wheels' ranges, built once (the source's numberOfRows per component). */
  @State private hours: string[] = [];
  @State private minutes: string[] = [];
  @State private seconds: string[] = [];

  aboutToAppear(): void {
    this.hours = TimeIntervalPickerSetting.range(24);
    this.minutes = TimeIntervalPickerSetting.range(60);
    this.seconds = TimeIntervalPickerSetting.range(60);
  }

  build() {
    Column() {
      Row() {
        Text(this.title)
          .fontSize(16)
          .fontColor($r('app.color.primary_color'))
        Blank()
        Text(this.intervalText)
          .fontSize(16)
          .fontColor($r('app.color.secondary_color'))
          .textAlign(TextAlign.End)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')
      .height(44)
      .alignItems(VerticalAlign.Center)
      .padding({ left: 16, right: 16 })
      .backgroundColor($r('app.color.background_color'))
      .id(this.rowId)
      .onClick(() => {
        this.isPickerOpen = !this.isPickerOpen;
      })
      Divider()
        .strokeWidth(0.5)
        .color($r('app.color.table_view_separator'))
        .margin({ left: this.lastInSection ? 0 : 16 })
      if (this.isPickerOpen) {
        Row() {
          TextPicker({ range: this.hours, selected: this.hourValue() })
            .layoutWeight(1)
            .onChange((value: string | string[], index: number | number[]) => {
              this.apply(TimeIntervalPickerSetting.first(index), this.minuteValue(), this.secondValue());
            })
          TextPicker({ range: this.minutes, selected: this.minuteValue() })
            .layoutWeight(1)
            .onChange((value: string | string[], index: number | number[]) => {
              this.apply(this.hourValue(), TimeIntervalPickerSetting.first(index), this.secondValue());
            })
          TextPicker({ range: this.seconds, selected: this.secondValue() })
            .layoutWeight(1)
            .onChange((value: string | string[], index: number | number[]) => {
              this.apply(this.hourValue(), this.minuteValue(), TimeIntervalPickerSetting.first(index));
            })
        }
        .width('100%')
        .backgroundColor($r('app.color.background_color'))
      }
    }
    .width('100%')
  }

  private static range(count: number): string[] {
    const values: string[] = [];
    for (let i: number = 0; i < count; i++) {
      values.push(`${i}`);
    }
    return values;
  }

  private static first(index: number | number[]): number {
    return typeof index === 'number' ? index as number : (index as number[])[0];
  }

  private hourValue(): number {
    return Math.floor(this.interval / 3600);
  }

  private minuteValue(): number {
    return Math.floor((this.interval % 3600) / 60);
  }

  private secondValue(): number {
    return Math.floor(this.interval % 60);
  }

  private apply(hours: number, minutes: number, seconds: number): void {
    const total: number = hours * 3600 + minutes * 60 + seconds;
    this.interval = total;
    if (this.onIntervalSelected !== undefined) {
      this.onIntervalSelected(total);
    }
  }
}
