/*
 * S3 structure — port of `DistanceStatsView` (OutRun/Views/Stats/Detail/DistanceStatsView.swift), the
 * BODY of the Distance card.
 *
 * ArkUI has no struct inheritance, so the source's `DistanceStatsView: StatsView` becomes
 * composition: the screen renders `StatsView` (the titled card frame) with this view as its content,
 * and hands in the tiles its `init` chose from the stats — Distance always, Steps/Pedal Strokes only
 * when stats.steps != nil, the two altitude tiles only when present, and the 'Altitude Over Time'
 * diagram only when the workout has route samples.
 */
@Component
export struct DistanceStatsView {
  @BuilderParam tiles: () => void;

  build() {
    /* Source: `StatsView` spaces its stat rows 7 apart. */
    Column({ space: 7 }) {
      this.tiles()
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }
}
