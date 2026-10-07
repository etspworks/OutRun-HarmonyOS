/*
 * S3 structure — port of `TimeStatsView` (OutRun/Views/Stats/Detail/TimeStatsView.swift), the BODY of
 * the Time card; its frame is `StatsView` (ArkUI composes where Swift subclassed).
 *
 * The tile ORDER is the source's own and depends on the data: with no pause it is Active Duration,
 * pace, Start Time, End Time; with a pause it is Active Duration, Pause Duration, Start Time, End
 * Time and the pace LAST (plan variant has_pause). The screen hands the tiles in that order.
 */
@Component
export struct TimeStatsView {
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
