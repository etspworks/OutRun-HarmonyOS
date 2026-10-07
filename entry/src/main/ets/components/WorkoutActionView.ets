/*
 * S3 structure — port of `WorkoutActionView` (OutRun/Views/Workout/WorkoutActionView.swift): a 50pt
 * rounded button whose title is a closure (the Apple Health row re-reads it after a successful
 * add/remove) and whose tap runs `action(workout, self)`. `DeleteWorkoutView` and `EditWorkoutView`
 * are its two subclasses; the Apple Health row uses it directly.
 */
/** Source: `color: .systemRed` on the delete row — resolved at capture (palette.json light). */
const DESTRUCTIVE_COLOR: string = '#FF3B30';

@Component
export struct WorkoutActionView {
  /** Source: `titleClosure()` — DATA-BOUND where the subclass binds it (healthKitUUID). */
  @Prop title: string = '';
  /** The source view's accessibilityIdentifier. */
  @Prop buttonId: string = '';
  /** Source: `color: .systemRed` for the delete row, `.accentColor` otherwise. */
  @Prop destructive: boolean = false;
  onAction?: () => void;

  build() {
    Button(this.title)
      .id(this.buttonId)
      /*
       * S5 style, verbatim from WorkoutActionView.swift:26-30,60-68: a 50pt button on
       * .foregroundColor with cornerRadius 15, titled in `color` — .accentColor, or systemRed on
       * the destructive Delete row.
       */
      .type(ButtonType.Normal)
      .width('100%')
      .height(50)
      .borderRadius(15)
      .backgroundColor($r('app.color.foreground_color'))
      .fontSize(18)
      .fontColor(this.destructive ? DESTRUCTIVE_COLOR : $r('app.color.accent_color'))
      .onClick(() => {
        this.runAction();
      })
  }

  /** Source: `action(button:)`. */
  private runAction(): void {
    if (this.onAction !== undefined) {
      this.onAction();
    }
  }
}
