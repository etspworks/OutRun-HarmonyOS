/*
 * S3 structure — port of `PolicyViewController`
 * (OutRun/Controllers/Settings/PolicyViewController.swift) over its superclass
 * `DetailViewController` (OutRun/Controllers/General/DetailViewController.swift).
 *
 * Source tree: headlineContainerView (headlineLabel + closeButton) above a read-only
 * policyTextView, with a centred LoadingView until `PolicyManager.query` calls back.
 *
 * The three `policyState` variants and `policy_no_type` are the source's own branches:
 *   type == nil            -> headline "Error", NO request is made
 *   query pending          -> LoadingView, empty text
 *   query returned a body  -> the fetched string (or "Error" when the body is unreadable)
 *   query returned an error -> "Error - " + the error's description
 *
 * The body is fetched through common/PolicyManager.ts — never a literal from the capture.
 *
 * S5 style, transcribed from the source's own constraints/fonts (not measured off the capture):
 *   view            .backgroundColor
 *   headlineLabel   systemFont 32 .heavy lowercase-small-caps, .primaryColor, safe-area top 40,
 *                   left 20, right -60, container bottom -10, shrink-to-fit down to 0.5 scale
 *   closeButton     36x36, safe-area top 8 / right 10, .close is an alwaysTemplate glyph tinted
 *                   .accentColor (its pale disc is the asset's own low-alpha ring)
 *   policyTextView  .backgroundColor / .primaryColor / systemFont 14, left+right 20,
 *                   headlineContainer.bottom + 10
 *   loadingView     centred in the view
 */
import { drawing, common2D } from '@kit.ArkGraphics2D';
import { router } from '@kit.ArkUI';
import { BusinessError } from '@kit.BasicServicesKit';
import { PolicyManager, PolicyQueryResult } from '../common/PolicyManager';
import { describeError } from '../common/ErrorText';
import { closeTo } from '../common/NavBack';
import { PolicyType, policyTitle } from '../model/PolicyType';
import { LoadingView } from '../components/LoadingView';

/**
 * `UIImage(named: "close")!.withRenderingMode(.alwaysTemplate)` with the bar's `.accentColor`
 * tint. The bundled asset is a BLACK template PNG and ArkUI's `fillColor` is SVG-only, so the
 * tint is a SRC_IN blend filter: it keeps the glyph's alpha (disc included) and replaces every
 * colour channel with the accent.
 */
const ACCENT: common2D.Color = { alpha: 255, red: 255, green: 146, blue: 0 };
const ACCENT_TEMPLATE_TINT: drawing.ColorFilter =
  drawing.ColorFilter.createBlendModeColorFilter(ACCENT, drawing.BlendMode.SRC_IN);

@Entry
@Component
struct PolicyViewControllerPage {
  /** Source: `PolicyViewController.type` — set by the presenting screen before viewDidLoad. */
  @State policyType: PolicyType | null = null;
  /** Source: `policyTextView.text`. */
  @State policyText: string = '';
  /** Source: `loadingView.isHidden`, flipped in the query completion. */
  @State isLoading: boolean = true;

  aboutToAppear(): void {
    this.policyType = this.routedPolicyType();
    this.loadPolicy();
  }

  /**
   * Source: the presenting screen setting `policyController.type` before pushing. Every direct
   * open of this screen in the source carries a type — a param-less open is the one the gallery
   * drives (`GalleryOpeners.swift`: `policy.type = .privacyPolicy`) and the Setup/Settings
   * privacy row, so that is the default here. A param naming a type nobody recognizes is still
   * the source's `type == nil` case — plan variant `policy_no_type`.
   */
  private routedPolicyType(): PolicyType | null {
    const params: Record<string, Object> = router.getParams() as Record<string, Object>;
    let raw: Object | undefined = params !== null && params !== undefined ? params['policyType'] : undefined;
    if (raw === null || raw === undefined) {
      // A deep link's `policyType` (EntryAbility) stands in for the router param, read once.
      const linked: string | undefined = AppStorage.get<string>('deepLinkPolicyType');
      AppStorage.setOrCreate<string>('deepLinkPolicyType', '');
      if (linked === undefined || linked === '') {
        return PolicyType.PRIVACY_POLICY;
      }
      raw = linked;
    }
    if (raw === PolicyType.PRIVACY_POLICY) {
      return PolicyType.PRIVACY_POLICY;
    }
    return raw === PolicyType.TERMS_OF_SERVICE ? PolicyType.TERMS_OF_SERVICE : null;
  }

  build() {
    Column() {
      /** Source: `headlineContainerView` — headlineLabel + closeButton. */
      Row() {
        /**
         * Source: `headline = type.title`, or "Error" when the type is nil — plan variant
         * `policy_no_type`, a real branch on the routed type (which also suppresses the request).
         */
        Text(this.policyType === null ? 'Error' : this.headline())
          .fontSize(32)
          .fontWeight(900)
          .lineHeight(38)
          .fontFeature('"smcp" 1')
          .fontColor($r('app.color.primary_color'))
          .maxLines(1)
          /** Source: `adjustsFontSizeToFitWidth` with `minimumScaleFactor = 0.5`. */
          .minFontSize(16)
          .maxFontSize(32)
          .layoutWeight(1)
          .margin({ top: 40 })
        Blank()
        Image($r('app.media.close'))
          .id('detail_close')
          .width(36)
          .height(36)
          .objectFit(ImageFit.Contain)
          .colorFilter(ACCENT_TEMPLATE_TINT)
          .margin({ top: 8 })
          .onClick(() => {
            this.close();
          })
      }
      .width('100%')
      .alignItems(VerticalAlign.Top)
      .padding({ left: 20, right: 10, bottom: 10 })
      /** Source: `policyTextView` (isEditable = false) with the centred loadingView over it. */
      Stack() {
        Scroll() {
          Text(this.policyText)
            .width('100%')
            .fontSize(14)
            .lineHeight(17)
            .fontColor($r('app.color.primary_color'))
            .textAlign(TextAlign.Start)
            /**
             * Source: `policyTextView` is a UITextView, whose own text container insets the body
             * a further 5pt each side (lineFragmentPadding) and 8pt at the top on top of the
             * view's own 20pt constraints — which is where the capture's 25pt text edge comes
             * from. ArkUI's Text has no such inset, so it is written out.
             */
            .padding({ left: 5, right: 5, top: 8 })
            /** Source: a non-editable UITextView stays selectable, so the text can be copied. */
            .copyOption(CopyOptions.LocalDevice)
            /** The policy's URL and contact e-mail are tappable, as the QA cases expect. */
            .enableDataDetector(true)
            .dataDetectorConfig({ types: [TextDataDetectorType.URL, TextDataDetectorType.EMAIL] })
        }
        .width('100%')
        .height('100%')
        .align(Alignment.Top)
        .scrollBar(BarState.Off)
        if (this.isLoading) {
          LoadingView()
        }
      }
      .layoutWeight(1)
      .width('100%')
      .padding({ left: 20, right: 20 })
      .margin({ top: 10 })
    }
    .id('PolicyViewControllerPage')
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background_color'))
  }

  /** Source: `viewDidLoad` — `self.headline = type.title`, else "Error". */
  private headline(): string {
    const type: PolicyType | null = this.policyType;
    return type !== null ? policyTitle(type) : 'Error';
  }

  /** Source: `PolicyManager.query(for:)`'s completion closure. */
  private async loadPolicy(): Promise<void> {
    const type: PolicyType | null = this.policyType;
    /** Source: the `guard let type = type else { headline = "Error"; return }` — no request. */
    if (type === null) {
      this.isLoading = false;
      return;
    }
    const result: PolicyQueryResult = await PolicyManager.query(type);
    this.isLoading = false;
    const error: BusinessError | null = result.error;
    if (error !== null) {
      this.policyText = `Error - ${describeError(error)}`;
      return;
    }
    this.policyText = result.content !== null ? result.content : 'Error';
  }

  /**
   * Source: `close()` — dismiss(animated: true), back to the settings screen that presented it
   * (the screen's pop target; Setup presents the same page and also reaches Settings' root).
   */
  private close(): void {
    closeTo('pages/SettingsViewControllerPage');
  }
}
