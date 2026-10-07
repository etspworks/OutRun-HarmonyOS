/*
 * S3 structure — port of `SpeedStatsView` (OutRun/Views/Stats/Detail/SpeedStatsView.swift), the BODY
 * of the Speed card; its frame is `StatsView` (ArkUI composes where Swift subclassed).
 *
 * Average Speed always; Top Speed and the 'Speed Over Time' diagram only when the workout has route
 * samples — the screen decides that, exactly as the source's `init` did.
 */
@Component
export struct SpeedStatsView {
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
