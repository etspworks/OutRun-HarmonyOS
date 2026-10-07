/*
 * S3 structure — port of `FloatingButton` (OutRun/Views/General/FloatingButton.swift): a rounded
 * button floating over the map, whose title is `title.uppercased()` and whose tap runs `action`.
 * `content` exists because the recording screen floats a plain title here (Recenter) and a
 * WorkoutBuilderTypeView there; the default builder is the source's own title label.
 */
@Component
export struct FloatingButton {
  /** Source: `setTitle(title.uppercased(), for: .normal)`. */
  @Prop title: string = '';
  /** The source view's accessibilityIdentifier, set by the screen that floats it. */
  @Prop buttonId: string = '';
  /** Source: `action(self)`. */
  onAction?: () => void;
  @BuilderParam content: () => void = this.titleContent;

  @Builder
  titleContent() {
    /* Source: `titleLabel.font = .systemFont(ofSize: 12, weight: .bold)`, `.secondaryColor`. */
    Text(this.title.toUpperCase())
      .fontSize(12)
      .fontWeight(FontWeight.Bold)
      .fontColor($r('app.color.secondary_color'))
      .maxLines(1)
  }

  build() {
    Row() {
      this.content()
    }
    /*
     * S5 style, verbatim from FloatingButton.swift:26-42: backgroundColor .backgroundColor,
     * cornerRadius 15 over a 30pt-tall pill, the title inset 10 each side.
     */
    .height(30)
    .alignItems(VerticalAlign.Center)
    .padding({ left: 10, right: 10 })
    .backgroundColor($r('app.color.background_color'))
    .borderRadius(15)
    .id(this.buttonId)
    .onClick(() => {
      this.performAction();
    })
  }

  /** Source: `performAction()`. */
  private performAction(): void {
    if (this.onAction !== undefined) {
      this.onAction();
    }
  }
}
