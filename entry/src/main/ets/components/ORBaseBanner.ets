/*
 * S3 structure — the DRAWING half of `ORBaseBanner` (OutRun/Views/ORBanner/ORBaseBanner.swift).
 * The state half (duration, isBeingDisplayed/isSuspended, the auto-dismiss timer, the queue) is
 * already ported in common/BannerQueue.ts as `Banner` / `BannerQueue`; this component only renders
 * the banner chrome around a subclass's content view and dismisses it.
 *
 * Source tree: a rounded blurred effectView, the `contentView` slot, and — only when
 * `isDismissable` — the `dismissButton` (accessibilityIdentifier "banner_dismiss") that calls
 * `dismiss()`. That is a real source conditional, not styling.
 *
 * S5 style, from the source verbatim:
 *   banner        cornerRadius 15, .backgroundColor at 50% alpha over a regular blur,
 *                 gray shadow at 25% opacity with radius 10 and no offset, 15pt from each edge
 *   contentView   15pt inset on the left/top/bottom (and on the right without a dismiss button)
 *   dismissButton 36x36, 15pt from the right, .close tinted .secondaryColor
 */
import { drawing, common2D } from '@kit.ArkGraphics2D';
import { Banner } from '../common/BannerQueue';

/**
 * `dismissButton.tintColor = .secondaryColor`. The bundled `.close` asset is a BLACK template PNG
 * and ArkUI's `fillColor` is SVG-only, so the tint is a SRC_IN blend filter over its alpha.
 */
const SECONDARY: common2D.Color = { alpha: 255, red: 118, green: 118, blue: 118 };
const SECONDARY_TEMPLATE_TINT: drawing.ColorFilter =
  drawing.ColorFilter.createBlendModeColorFilter(SECONDARY, drawing.BlendMode.SRC_IN);

@Component
export struct ORBaseBanner {
  /** The queued banner this view draws; its `dismiss()` owns the queue side. */
  banner: Banner | null = null;
  /** Source: `init(customise:)` — the content view a subclass fills. */
  @BuilderParam contentView: () => void;

  build() {
    /*
     * Source: `calculatedSize.width = screenWidth - 2 * spacing` and
     * `calculatedEndOrigin = (spacing, spacing + safeAreaTop)` — the banner is inset by the 15pt
     * spacing on both sides and pinned to the TOP of the window, not centred. A `width('100%')`
     * card plus `margin(15)` was 30pt wider than the screen, so the inset lives on this wrapper
     * and the card is simply full width inside it. The wrapper spans the window to do the
     * top-pinning, so it must not eat the taps meant for the screen beneath it.
     */
    Column() {
      Row() {
        Column() {
          this.contentView()
        }
        .layoutWeight(1)
        .padding({ left: 15, top: 15, bottom: 15, right: this.isDismissable() ? 0 : 15 })
        /** Source: `if self.isDismissable { addSubview(dismissButton) }`. */
        if (this.isDismissable()) {
          Image($r('app.media.close'))
            .id('banner_dismiss')
            .width(36)
            .height(36)
            .objectFit(ImageFit.Contain)
            .colorFilter(SECONDARY_TEMPLATE_TINT)
            .margin({ left: 15, right: 15 })
            .onClick(() => {
              this.dismiss();
            })
        }
      }
      .width('100%')
      .alignItems(VerticalAlign.Center)
      .backgroundColor($r('app.color.background_color'))
      .backdropBlur(20)
      .borderRadius(15)
      .shadow({ radius: 10, color: Color.Gray, offsetX: 0, offsetY: 0 })
    }
    .width('100%')
    .height('100%')
    .padding(15)
    .justifyContent(FlexAlign.Start)
    .hitTestBehavior(HitTestMode.Transparent)
  }

  /** Source: `isDismissable`, a let on the banner. */
  private isDismissable(): boolean {
    const current: Banner | null = this.banner;
    return current !== null ? current.isDismissable : true;
  }

  /** Source: `dismiss()` — delegated to the ported queue state. */
  private dismiss(): void {
    const current: Banner | null = this.banner;
    if (current !== null) {
      current.dismiss();
    }
  }
}
