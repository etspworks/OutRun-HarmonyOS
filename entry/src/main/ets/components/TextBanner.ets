/*
 * S3 structure — port of `TextBanner` (OutRun/Models/ORBanner/TextBanner.swift): an ORBaseBanner
 * whose content view is a single label. ArkUI has no struct inheritance, so the screen renders
 * `ORBaseBanner` with this label as its content. The queue state is common/BannerQueue.ts's `Banner`.
 */
import { Banner } from '../common/BannerQueue';

@Component
export struct TextBanner {
  /** The queued banner being drawn; its `text` is the label. */
  banner: Banner | null = null;

  build() {
    /** Source: `TextBanner` — one 16 .semibold .primaryColor label filling the banner's content. */
    Text(this.text())
      .fontSize(16)
      .fontWeight(FontWeight.Medium)
      .fontColor($r('app.color.primary_color'))
      .width('100%')
      .textAlign(TextAlign.Start)
  }

  private text(): string {
    const current: Banner | null = this.banner;
    return current !== null ? current.text : '';
  }
}
