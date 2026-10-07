/*
 * S3 structure — port of `TextViewSetting`
 * (OutRun/Models/Settings/Setting Models/TextViewSetting.swift): a cell holding a multi-line
 * `UITextView` with a placeholder label behind it, committing on `textViewDidEndEditing`. Empty text
 * is stored as nil by the caller, exactly as the source does.
 *
 * S5 style, from the source cell (TextViewSetting.swift:33-70): textView .backgroundColor with
 * .primaryColor text at .preferredFont(.body) (17pt -> 16fp) pinned to the cell's layout margins,
 * the placeholder label the same font in .secondaryColor at the margin's top-left, and the usual
 * settings-cell chrome (16pt margins, a .tableViewSeparator hairline below). The capture renders
 * the comment cell at the standard 44pt row height, so that is its minimum here and it grows with
 * the text rather than being pinned to the source's 100pt.
 */
@Component
export struct TextViewSetting {
  /** Source: `text` — the stored comment. */
  @Prop @Watch('onTextReset') text: string = '';
  @Prop placeholder: string = '';
  @Prop rowId: string = 'settings_itemroot';
  /**
   * S6: a grouped UITableView closes each SECTION with an edge-to-edge rule and separates the
   * rows inside it with the inset one. Style only — the divider itself is unchanged.
   */
  @Prop lastInSection: boolean = false;
  /** Source: `textViewValueAction(newValue, setting)`. */
  onTextChanged?: (newValue: string) => void;
  /** Source: `textViewShouldBeginEditing` -> `registerForKeyboardAvoidanceClosure(cell)`. */
  onBeginEditing?: () => void;
  /** Source: `textViewDidEndEditing` — this row no longer needs to be held above the keyboard. */
  onEndEditing?: () => void;

  @State private draft: string = '';

  aboutToAppear(): void {
    this.draft = this.text;
  }

  onTextReset(): void {
    this.draft = this.text;
  }

  build() {
    Column() {
      Stack({ alignContent: Alignment.TopStart }) {
        /*
         * Source: `TextViewSetting.swift:33-70` puts a real placeholder LABEL behind the text view
         * rather than using a placeholder attribute — the capture dumps it as the cell's own
         * `StaticText 'Comment'`, which is the node the replay's recorded target ("Comment") joins
         * to. A `TextArea` placeholder is an attribute uitest never dumps, so the row carried no
         * label at all and the only 'Comment' node left on screen was the section HEADER: the
         * recorded tap resolved to that dead header and was a NO-OP. The label is behind the field
         * (HitTestMode.None), so the tap still lands on the TextArea and opens the editor.
         */
        if (this.draft === '') {
          Text(this.placeholder)
            .fontSize(16)
            .fontColor($r('app.color.secondary_color'))
            .padding({ left: 16, right: 16, top: 12, bottom: 12 })
            .hitTestBehavior(HitTestMode.None)
        }
        TextArea({ text: this.draft })
          .id(this.rowId)
          .width('100%')
          .constraintSize({ minHeight: 44 })
          .fontSize(16)
          .fontColor($r('app.color.primary_color'))
          .backgroundColor(Color.Transparent)
          .borderRadius(0)
          .padding({ left: 16, right: 16, top: 12, bottom: 12 })
        .onChange((value: string) => {
          this.draft = value;
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
      }
      .width('100%')
      .backgroundColor($r('app.color.background_color'))
      Divider()
        .strokeWidth(0.5)
        .color($r('app.color.table_view_separator'))
        .margin({ left: this.lastInSection ? 0 : 16 })
    }
    .width('100%')
  }

  /** Source: `textViewDidEndEditing` — the value is written once editing ends. */
  private commit(): void {
    if (this.onTextChanged !== undefined) {
      this.onTextChanged(this.draft);
    }
  }
}
