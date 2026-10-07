/*
 * S3 structure — port of `ChangeLogViewController`
 * (OutRun/Controllers/General/ChangeLogViewController.swift).
 *
 * presentation: modal (overFullScreen, crossDissolve) presented over the tab root, so it is an
 * ArkUI overlay mounted in its host page (WorkoutListViewControllerPage), not a routed page. The
 * host owns the 'has this version been shown' flag, exactly as AppDelegate did.
 *
 * Source tree: `effectView` (the blurred, tap-to-dismiss backdrop), a card holding `titleLabel`
 * (LS["ChangeLog"] + " - " + Config.version), the read-only scrolling `textView`, and
 * `closeButton` -> close(). Both the version and the body are DATA-BOUND to svc_config.
 * S5 style, transcribed from the source's own constraints (ChangeLogViewController.swift:33-105),
 * not measured off the capture:
 *   effectView    UIBlurEffect(.systemUltraThinMaterialDark) over the whole screen, tap = close
 *   contentView   .backgroundColor, cornerRadius 25, inset 25 each side of the safe area,
 *                 height = safeArea / 1.25, centred vertically
 *   insets        top 10, left 20, bottom 20, right 20
 *   closeButton   36x36, 10 from the card's top and right; the bundled `close` template tinted
 *                 by window.tintColor = .accentColor (AppDelegate.swift:350)
 *   titleLabel    systemFont 24 .heavy .withLowerCaseSmallCaps, .accentColor, left, one line,
 *                 top = closeButton.bottom + 10
 *   textView      systemFont 14, .primaryColor, clear background, top = titleLabel.bottom + 10
 */
import { drawing, common2D } from '@kit.ArkGraphics2D';
import { Config } from '../common/Config';
import { localizedString } from '../common/LocalizedStrings';

/**
 * `closeButton.setImage(.close)` on a template asset: ArkUI's `fillColor` is SVG-only, so the
 * accent tint is a SRC_IN blend filter that keeps the glyph's alpha (#FF9200).
 */
const ACCENT: common2D.Color = { alpha: 255, red: 255, green: 146, blue: 0 };
const ACCENT_TINT: drawing.ColorFilter =
  drawing.ColorFilter.createBlendModeColorFilter(ACCENT, drawing.BlendMode.SRC_IN);
/**
 * Source: `make.height.equalTo(safeArea).dividedBy(1.25)`. The dialog's root is the WINDOW, not
 * the safe area, so the fraction is of the window: capture S0024 puts the card at 121-729pt of an
 * 844pt window (608pt), which is 72%.
 */
const CARD_HEIGHT: string = '72%';

@CustomDialog
export struct ChangeLogViewControllerPage {
  controller?: CustomDialogController;
  /** Source: `changeLog`, set by AppDelegate from `Config.changeLogs[Config.version]`. */
  @Prop changeLog: string = '';
  /** Source: the host's 'is the changelog up' state — dismissing writes it back. */
  @Link isChangeLogShown: boolean;

  build() {
    Stack() {
      /** Source: `effectView` — the blur itself, which the card is drawn over. */
      Column()
        .width('100%')
        .height('100%')
        /** Source: `UIBlurEffect(style: .systemUltraThinMaterialDark)` over the tab root. */
        .backgroundColor('rgba(0,0,0,0.12)')
        .backdropBlur(30)
      /*
       * Source: `effectView.addGestureRecognizer(UITapGestureRecognizer(#selector(close)))` — the
       * backdrop dismisses. The tap surface is the backdrop AROUND the card, not one full-screen
       * layer under it: the card is a sibling drawn on top and carries no tap of its own, so a
       * full-screen dismiss layer is unreachable at its own centre — every tap there lands on the
       * card and dies (a card tap must NOT dismiss, which is why the card cannot simply bubble).
       * Two weighted spacers hold the card at `centerY` with `height = safeArea / 1.25` between
       * them, as the source's constraints do.
       * ponytail: the 25pt strips beside the card are inside the card's own band, so they do not
       * dismiss; wrap that band in a Row with its own tap handlers if that gap ever matters.
       */
      Column() {
        Column()
          .width('100%')
          .layoutWeight(1)
          .id('changelog_backdrop_dismiss')
          .onClick(() => {
            this.close();
          })
        /**
         * Source: `viewDidLoad` closes immediately when `changeLog == nil`, so there is no card at
         * all for a version that ships no changelog (plan variant changelog_missing).
         */
        if (this.changeLog !== '') {
          Column() {
            /** Source: `closeButton` is pinned to the card's own top-right, ABOVE the title. */
            Row() {
              Blank()
              /** Source: `closeButton` -> close(). */
              Image($r('app.media.close'))
                .width(36)
                .height(36)
                .objectFit(ImageFit.Contain)
                .colorFilter(ACCENT_TINT)
                .id('changelog_close')
                .onClick(() => {
                  this.close();
                })
            }
            .width('100%')
            /** Source: `titleLabel` — the version half is bound to Config.version. */
            Text(`${localizedString('Changelog')} - ${Config.version}`)
              .fontSize(24)
              .fontWeight(900)
              .fontFeature('"smcp" 1')
              .fontColor($r('app.color.accent_color'))
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
              .textAlign(TextAlign.Start)
              .width('100%')
              .margin({ top: 10 })
              .padding({ right: 10 })
            /** Source: `textView`, isEditable = false — the bundled Changelog.strings entry. */
            Scroll() {
              Text(this.changeLog)
                .width('100%')
                .fontSize(14)
                .fontColor($r('app.color.primary_color'))
                /* Measured off capture S0024: 4 body lines 16.9pt apart. */
                .lineHeight(17)
                .textAlign(TextAlign.Start)
            }
            .layoutWeight(1)
            .width('100%')
            .align(Alignment.Top)
            .scrollBar(BarState.Off)
            .margin({ top: 10 })
            .padding({ right: 10 })
          }
          .width('100%')
          .height(CARD_HEIGHT)
          .alignItems(HorizontalAlign.Start)
          .backgroundColor($r('app.color.background_color'))
          .borderRadius(25)
          /* Source: insets (10, 20, 20, 20); the close button sits 10 from the right, so the card
           * carries the 10 and the title/text add the remaining 10 of their own inset. */
          .padding({ top: 10, left: 20, right: 10, bottom: 20 })
          .margin({ left: 25, right: 25 })
        }
        /** The other half of the backdrop, below the card — same dismiss as the strip above. */
        Column()
          .width('100%')
          .layoutWeight(1)
          .onClick(() => {
            this.close();
          })
      }
      .width('100%')
      .height('100%')
      .justifyContent(FlexAlign.Center)
    }
    .width('100%')
    .height('100%')
    /**
     * The page-identity marker for this overlay. It is mounted in its host, so the framework's
     * `pagePath` names the HOST route and nothing else can say which screen is on top; the replay
     * and the correctness gate both prove identity from `.id('<RouteName>')` first.
     */
    .id('ChangeLogViewController')
  }

  /** Source: `close()` — dismiss(animated: true), from the close button or the backdrop tap. */
  private close(): void {
    this.isChangeLogShown = false;
    if (this.controller !== undefined) {
      this.controller.close();
    }
  }
}
