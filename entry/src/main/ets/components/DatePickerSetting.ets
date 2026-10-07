/*
 * S3 structure — port of `DatePickerSetting`
 * (OutRun/Models/Settings/Setting Models/DatePickerSetting.swift): a value1 cell whose detail label
 * is `CustomTimeFormatting.fullDateString(forDate:)` and whose inputView is a wheel `UIDatePicker`
 * with `maximumDate = Date()` and `minuteInterval = 1`, in `.dateAndTime` mode — hence a DatePicker
 * AND a TimePicker, which is how ArkUI spells that mode. *
 * S5 style: an `InputViewSetting` renders the same UITableViewCell `.value1` every other settings
 * row does — title .primaryColor / detail .secondaryColor at .preferredFont(.body) (17pt -> 16fp),
 * 44pt tall, 16pt margins, a .tableViewSeparator hairline below. The inline wheel below the row is
 * the source's `inputView` and only exists while the row is the first responder.
 */
@Component
export struct DatePickerSetting {
  @Prop title: string = '';
  /** Source: `setDateString(for:)` — CustomTimeFormatting.fullDateString, formatted by the caller. */
  @Prop dateText: string = '';
  @Prop rowId: string = 'settings_itemroot';
  /**
   * S6: a grouped UITableView closes each SECTION with an edge-to-edge rule and separates the
   * rows inside it with the inset one. Style only — the divider itself is unchanged.
   */
  @Prop lastInSection: boolean = false;
  /** Source: `date` — the picker's current value. */
  selected: Date = new Date();
  /** Source: `dateSelectionAction(datePicker.date, self)`. */
  onDateSelected?: (date: Date) => void;

  @State private isPickerOpen: boolean = false;

  build() {
    Column() {
      Row() {
        Text(this.title)
          .fontSize(16)
          .fontColor($r('app.color.primary_color'))
        Blank()
        Text(this.dateText)
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
        /** Source: `datePicker.maximumDate = Date()` — a workout cannot start in the future. */
        DatePicker({ start: new Date(1970, 0, 1), end: new Date(), selected: this.selected })
          .width('100%')
          .backgroundColor($r('app.color.background_color'))
          .selectedTextStyle({ font: { size: 20, weight: FontWeight.Medium },
            color: $r('app.color.primary_color') })
          .textStyle({ font: { size: 16 }, color: $r('app.color.secondary_color') })
          .onDateChange((value: Date) => {
            this.applyDate(value);
          })
        /** Source: `datePickerMode = .dateAndTime` — the time half of the same picker. */
        TimePicker({ selected: this.selected })
          .width('100%')
          .backgroundColor($r('app.color.background_color'))
          .selectedTextStyle({ font: { size: 20, weight: FontWeight.Medium },
            color: $r('app.color.primary_color') })
          .textStyle({ font: { size: 16 }, color: $r('app.color.secondary_color') })
          .onChange((value: TimePickerResult) => {
            this.applyTime(value);
          })
      }
    }
    .width('100%')
  }

  private applyDate(value: Date): void {
    const merged: Date = new Date(value.getFullYear(), value.getMonth(), value.getDate(),
      this.selected.getHours(), this.selected.getMinutes(), 0);
    this.emit(merged);
  }

  private applyTime(value: TimePickerResult): void {
    const merged: Date = new Date(this.selected.getFullYear(), this.selected.getMonth(),
      this.selected.getDate(), value.hour, value.minute, 0);
    this.emit(merged);
  }

  private emit(date: Date): void {
    this.selected = date;
    if (this.onDateSelected !== undefined) {
      this.onDateSelected(date);
    }
  }
}
