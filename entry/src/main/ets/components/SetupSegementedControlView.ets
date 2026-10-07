/*
 * Port of `SetupSegementedControlView`
 * (OutRun/Views/Setup/SetupActionViews/SetupSegementedControlView.swift). The superclass half lives
 * in `SetupActionView`; this component renders what THIS class adds — the UISegmentedControl and
 * its `valueChanged` wiring.
 *
 * HarmonyOS has no segmented-control component (mapping-tables §4: `Tabs` or custom) and this one is
 * a two-segment picker in a 40pt row, so it is a Row of tappable segment labels. Which segment is
 * selected is a conditional on the bound index, not a style.
 *
 * S5 style, from `UISegmentedControl.styleLikeIOS12()` verbatim:
 *   1pt accent border, accent segment dividers, selected segment filled accent with white 13pt
 *   text, unselected transparent with accent 13pt text; width = row width / 2, height 30.
 */
@Component
export struct SetupSegementedControlView {
  /** Source: `init(segmentTitles:)`. */
  segmentTitles: string[] = [];
  /** Source: `segmentedControl.selectedSegmentIndex`, seeded from `initialSegment`. */
  @Prop selectedSegment: number;
  /** Rule 12 slug of the source's `segmentedControl`. */
  segmentedControlSlug: string = '';
  /** Source: `segmentedControlActionClosure`. */
  segmentedControlAction: (index: number) => void = (index: number): void => {
  };

  build() {
    Row() {
      ForEach(this.segmentTitles, (segmentTitle: string, index: number) => {
        Text(segmentTitle)
          .layoutWeight(1)
          .height('100%')
          .textAlign(TextAlign.Center)
          .fontSize(13)
          .fontColor(this.selectedSegment === index ? Color.White : $r('app.color.accent_color'))
          /** Source: `setDividerImage(tintColorImage, ...)`. */
          .border({
            width: { left: index === 0 ? 0 : 1 },
            color: $r('app.color.accent_color')
          })
          .onClick(() => {
            this.segmentedControlAction(index);
          })
          /** Source: the selected segment is the one drawn with the accent background. */
          .backgroundColor(this.selectedSegment === index
            ? $r('app.color.accent_color') : Color.Transparent)
      }, (segmentTitle: string, index: number) => `${index}-${segmentTitle}`)
    }
    .id(this.segmentedControlSlug)
    .width('50%')
    .height(30)
    .borderRadius(8)
    .borderWidth(1)
    .borderColor($r('app.color.accent_color'))
    .clip(true)
  }
}
