/*
 * S3 structure — port of `EnergyStatsView` (OutRun/Views/Stats/EnergyStatsView.swift), the BODY of the
 * Burned Energy card; its frame is `StatsView` (ArkUI composes where Swift subclassed).
 *
 * Two tiles, always both: Total Energy and the time-relative energy. The whole card is absent unless
 * stats.hasEnergyValue, which the screen decides (plan variants has_energy / has_route_and_energy).
 */
@Component
export struct EnergyStatsView {
  @BuilderParam tiles: () => void;

  build() {
    /* Source: `newStackView()` — a horizontal fill-equally stack with 10pt spacing. */
    Row({ space: 10 }) {
      this.tiles()
    }
    .width('100%')
  }
}
