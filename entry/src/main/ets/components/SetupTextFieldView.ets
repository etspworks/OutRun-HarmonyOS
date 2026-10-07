/*
 * Port of `SetupTextFieldView`
 * (OutRun/Views/Setup/SetupActionViews/SetupTextFieldView.swift). As with the other setup rows the
 * superclass half lives in `SetupActionView`; this component renders what THIS class adds — the
 * UITextField and the optional `behindLabel`.
 *
 * Two source facts shape the bindings:
 *   - `textFieldActionClosure` fires from `textFieldShouldEndEditing`, NOT on every keystroke, so
 *     the action is bound to submit/blur.
 *   - the owning page REWRITES `textField.text` (it clears an unparseable weight and re-formats the
 *     typed weight when the unit segment changes), so the page owns the text and this is a @Prop.
 *
 * S5 style, from the source verbatim:
 *   textField  clear background, .primaryColor, systemFont 16, right-aligned, cornerRadius 10,
 *              10pt padding, height 30, width = row width / 2.5 (40%), centred vertically
 *   behindLabel .secondaryColor / systemFont 16, 5pt right of the field, pinned to the row's right
 */
@Component
export struct SetupTextFieldView {
  /** Source: `init(placeholder:)`. */
  placeholder: string = '';
  /**
   * Source: `textField.text`. One-way from the page: the page REWRITES it (it clears an
   * unparseable weight and re-formats the typed weight when the unit segment changes) and that
   * flows back down, while what the user types is handed up through `textFieldAction`.
   */
  @Prop text: string;
  /** Source: `init(textBehindTextField:)` -> `behindLabel.text`; '' where the source passes nil. */
  @Prop behindText: string;
  /** Source: `init(keyboardType:)` — `.decimalPad` on the weight field. */
  inputType: InputType = InputType.Normal;
  /** Rule 12 slug of the source's `textField`. */
  textFieldSlug: string = '';
  /** Source: `textFieldActionClosure`, fired on end-editing. */
  textFieldAction: (input: string) => void = (input: string): void => {
  };

  build() {
    Row() {
      TextInput({ placeholder: this.placeholder, text: this.text })
        .id(this.textFieldSlug)
        .type(this.inputType)
        .width('85%')
        .height(30)
        .padding({ left: 10, right: 10, top: 0, bottom: 0 })
        .borderRadius(10)
        .backgroundColor(Color.Transparent)
        .fontSize(16)
        .fontColor($r('app.color.primary_color'))
        .placeholderColor($r('app.color.secondary_color'))
        .placeholderFont({ size: 16 })
        .textAlign(TextAlign.End)
        .onChange((value: string) => {
          this.text = value;
        })
        .onSubmit(() => {
          this.textFieldAction(this.text);
        })
        .onBlur(() => {
          this.textFieldAction(this.text);
        })
      /** Source: `behindLabel` — only added when `textBehindTextField != nil`. */
      if (this.behindText.length > 0) {
        Text(this.behindText)
          .fontSize(16)
          .fontColor($r('app.color.secondary_color'))
          .margin({ left: 5 })
      }
    }
    /** Source: `width.equalToSuperview().dividedBy(2.5)` (+ the behind label's own width). */
    .width(this.behindText.length > 0 ? '47%' : '40%')
    .height(40)
    .alignItems(VerticalAlign.Center)
    .justifyContent(FlexAlign.End)
  }
}
