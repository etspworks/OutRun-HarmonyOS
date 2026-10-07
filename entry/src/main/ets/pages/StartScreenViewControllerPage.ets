/*
 * Port of `StartScreenViewController` (OutRun/Controllers/Setup/StartScreenViewController.swift).
 *
 * Source tree (viewDidLoad): headlineLabel, titleLabel, a featureScrollView holding three
 * StartScreenFeatureView cards, and startButton pinned to the bottom safe area.
 *
 * Pure static chrome — the source reads no model or service on this screen, so every string is
 * a localized resource and every image a bundled asset. No list, no loading/empty/error state:
 * the source defines none.
 *
 * S5 style, transcribed from the source's own constraints/fonts (not measured off the capture):
 *   view.backgroundColor   .backgroundColor
 *   headlineLabel          systemFont 32 .bold,  .primaryColor, centered, safeArea inset t40 l/r20
 *                          UILabel sizes to the font's own line height (38pt / 50pt in the capture),
 *                          which ArkUI does not do by default - both are pinned with lineHeight().
 *   titleLabel             systemFont 42 .heavy lowercase-small-caps, .accentColor, centered, l/r20
 *   featureScrollView      top = title.bottom + 40, bottom = button.top - 20, l/r 30, cards 20 apart
 *   startButton            l/r 40, bottom 20, height 50, cornerRadius 20, .accentColor,
 *                          title systemFont 16 .bold white
 */
import { router } from '@kit.ArkUI';
import { localizedString } from '../common/LocalizedStrings';
import { StartScreenFeatureView } from '../components/StartScreenFeatureView';

/** `startButton` insets 40pt each side of a 390pt-wide safe area — kept proportional. */
const START_BUTTON_WIDTH: string = '79.5%';

/** UIKit's modal cross-dissolve runs about this long. */
const CROSS_DISSOLVE_MS: number = 300;

@Entry
@Component
struct StartScreenViewControllerPage {
  build() {
    Column() {
      /** Source: `headlineLabel` — LS["Setup.Headline"]. */
      Text(localizedString('Setup.Headline'))
        .fontSize(32)
        .fontWeight(FontWeight.Bold)
        .lineHeight(38)
        .fontColor($r('app.color.primary_color'))
        .textAlign(TextAlign.Center)
        .width('100%')
        .padding({ left: 20, right: 20 })
      /** Source: `titleLabel` — LS["OutRun"], 42pt heavy with lower-case small caps. */
      Text(localizedString('OutRun'))
        .fontSize(42)
        .fontWeight(900)
        .lineHeight(50)
        .fontFeature('"smcp" 1')
        .fontColor($r('app.color.accent_color'))
        .textAlign(TextAlign.Center)
        .width('100%')
        .padding({ left: 20, right: 20 })
      /** Source: `featureScrollView` — the three feature cards, scrollable. */
      Scroll() {
        Column({ space: 20 }) {
          StartScreenFeatureView({
            title: localizedString('Setup.Feature.Route.Title'),
            description: localizedString('Setup.Feature.Route.Message'),
            image: $r('app.media.setup_route')
          })
          StartScreenFeatureView({
            title: localizedString('Setup.Feature.Chart.Title'),
            description: localizedString('Setup.Feature.Chart.Message'),
            image: $r('app.media.setup_chart')
          })
          StartScreenFeatureView({
            title: localizedString('Setup.Feature.Lock.Title'),
            description: localizedString('Setup.Feature.Lock.Message'),
            image: $r('app.media.setup_lock')
          })
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
      }
      .layoutWeight(1)
      .width('100%')
      .align(Alignment.Top)
      .scrollBar(BarState.Off)
      .padding({ left: 30, right: 30 })
      .margin({ top: 40, bottom: 20 })
      /** Source: `startButton` — LS["Setup.StartButton"].uppercased(), target startSetup(). */
      Button(localizedString('Setup.StartButton').toUpperCase())
        .id('start_screen_start_setup')
        .type(ButtonType.Normal)
        .width(START_BUTTON_WIDTH)
        .height(50)
        .borderRadius(20)
        .backgroundColor($r('app.color.accent_color'))
        .fontSize(16)
        .fontWeight(FontWeight.Bold)
        .fontColor(Color.White)
        .onClick(() => {
          this.startSetup();
        })
    }
    .id('StartScreenViewControllerPage')
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background_color'))
    .padding({ top: 40, bottom: 20 })
  }

  /**
   * Source: `modalTransitionStyle = .crossDissolve` — the start screen fades out under the setup
   * flow instead of the default page slide (TC-ONBOARD-268), and fades back if setup is popped.
   */
  pageTransition() {
    PageTransitionExit({ type: RouteType.Push, duration: CROSS_DISSOLVE_MS }).opacity(0)
    PageTransitionEnter({ type: RouteType.Pop, duration: CROSS_DISSOLVE_MS }).opacity(0)
  }

  /** Source: `startSetup()` — present(SetupViewController, .fullScreen, crossDissolve). */
  private startSetup(): void {
    router.pushUrl({ url: 'pages/SetupViewControllerPage' });
  }
}
