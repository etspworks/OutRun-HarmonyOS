/*
 * S3 structure — port of `TextInputSetting`'s cell
 * (OutRun/Models/Settings/Setting Models/TextInputSetting.swift): a title label, an inline
 * `UITextField` holding the stored value and the optional `textBehindTextField` unit after it.
 * The source commits on `textFieldDidEndEditing`, so the draft is local and handed up on submit or
 * when the field loses focus — committing per keystroke would write half-typed numbers.
 *
 * S5 style, from the source cell (TextInputSetting.swift:40-100): titleLabel and textField both
 * .preferredFont(.body) (17pt -> 16fp), textField .textColor = .primaryColor on a .clear
 * background and right-aligned against the cell margin, `textBehindTextField` in .secondaryColor
 * pinned at the trailing margin; the usual 44pt cell, 16pt margins, hairline below.
 */
@Component
export struct TextInputSetting {
  @Prop title: string = '';
  /** Source: `textField.text = valueClosure()` — the stored value. */
  @Prop @Watch('onValueReset') value: string = '';
  @Prop placeholder: string = '';
  /** Source: `textBehindTextField` — the preferred unit's symbol. */
  @Prop textBehind: string = '';
  /** Source: `keyboardType` — 'decimal' for weight/distance, 'number' for steps. */
  @Prop keyboardType: string = 'default';
  @Prop rowId: string = 'settings_itemroot';
  /**
   * S6: a grouped UITableView closes each SECTION with an edge-to-edge rule and separates the
   * rows inside it with the inset one. Style only — the divider itself is unchanged.
   */
  @Prop lastInSection: boolean = false;
  /** Source: `textFieldValueAction(text, setting)`. */
  onValueChanged?: (newValue: string) => void;
  /** Source: `textFieldShouldBeginEditing` -> `registerForKeyboardAvoidanceClosure(cell)`. */
  onBeginEditing?: () => void;
  /** Source: `textFieldShouldEndEditing` — editing ended, so this row no longer needs to be held. */
  onEndEditing?: () => void;

  @State private draft: string = '';
  /**
   * NUMBER_DECIMAL silently drops a second separator, so "7..2" reaches the draft as a valid
   * "7.2". The source's decimal pad keeps "7..2" and its parser rejects it, so an entry that had
   * a separator dropped is treated as malformed and not committed.
   * ponytail: cleared only when the field empties or editing ends; deleting back to a clean
   * value mid-edit still counts as malformed. Track the raw text if that bites.
   */
  private droppedSeparator: boolean = false;

  aboutToAppear(): void {
    this.draft = this.value;
  }

  /** The model refreshed (a unit change reformats the value), so the field follows it. */
  onValueReset(): void {
    this.draft = this.value;
  }

  build() {
    Column() {
      Row() {
        Text(this.title)
          .fontSize(16)
          .fontColor($r('app.color.primary_color'))
        TextInput({ text: this.draft, placeholder: this.placeholder })
        .id(this.rowId)
        .type(this.inputType())
        .layoutWeight(1)
        .fontSize(16)
        .fontColor($r('app.color.primary_color'))
        .textAlign(TextAlign.End)
        .backgroundColor(Color.Transparent)
        .padding({ left: 8, right: 0 })
        .borderRadius(0)
        .onChange((text: string) => {
          this.draft = text;
          if (text === '') {
            this.droppedSeparator = false;
          }
        })
        .onWillInsert((info: InsertValue): boolean => {
          if (this.keyboardType === 'decimal' && /[.,]/.test(info.insertValue) && /[.,]/.test(this.draft)) {
            this.droppedSeparator = true;
          }
          return true;
        })
        .onSubmit(() => {
          this.commit();
        })
        .onFocus(() => {
          if (this.onBeginEditing !== undefined) {
            this.onBeginEditing();
          }
        })
        .onBlur(() => {
          this.commit();
          if (this.onEndEditing !== undefined) {
            this.onEndEditing();
          }
        })
        if (this.textBehind !== '') {
          Text(this.textBehind)
            .fontSize(16)
            .fontColor($r('app.color.secondary_color'))
            .margin({ left: 10 })
        }
      }
      .width('100%')
      .height(44)
      .alignItems(VerticalAlign.Center)
      .padding({ left: 16, right: 16 })
      .backgroundColor($r('app.color.background_color'))
      Divider()
        .strokeWidth(0.5)
        .color($r('app.color.table_view_separator'))
        .margin({ left: this.lastInSection ? 0 : 16 })
    }
    .width('100%')
  }

  private inputType(): InputType {
    if (this.keyboardType === 'decimal') {
      return InputType.NUMBER_DECIMAL;
    }
    return this.keyboardType === 'number' ? InputType.Number : InputType.Normal;
  }

  /** Source: `textFieldDidEndEditing` — the value is written once editing ends. */
  private commit(): void {
    if (this.onValueChanged !== undefined && !this.droppedSeparator) {
      this.onValueChanged(this.draft);
    }
    this.droppedSeparator = false;
    // Source: `refresh()` -> `updateClosures()` writes the stored value back into the field. A
    // rejected entry leaves `value` unchanged, so @Watch never fires; resync here. An accepted one
    // is overwritten by the watch when the refreshed value arrives.
    this.draft = this.value;
  }
}
