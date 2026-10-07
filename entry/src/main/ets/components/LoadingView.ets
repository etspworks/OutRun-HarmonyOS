/*
 * Port of `LoadingView` (OutRun/Views/Data/LoadingView.swift): a spinning activity
 * indicator over the LS["Loading"] label. Shown centred while a fetch is in flight.
 *
 * S5 style, from the source verbatim:
 *   loadingIndicator UIActivityIndicatorView .large (37pt), pinned to the top of the view
 *   label            LS["Loading"], .secondaryColor / systemFont 14 .medium, centred,
 *                    100pt wide, 10pt below the indicator
 */
import { localizedString } from '../common/LocalizedStrings';

@Component
export struct LoadingView {
  build() {
    Column() {
      /** Source: `loadingIndicator` — UIActivityIndicatorView, startAnimating(). */
      LoadingProgress()
        .width(37)
        .height(37)
        .color($r('app.color.secondary_color'))
      /** Source: `label` — LS["Loading"]. */
      Text(localizedString('Loading'))
        .width(100)
        .fontSize(14)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.secondary_color'))
        .textAlign(TextAlign.Center)
        .margin({ top: 10 })
    }
    .alignItems(HorizontalAlign.Center)
  }
}
