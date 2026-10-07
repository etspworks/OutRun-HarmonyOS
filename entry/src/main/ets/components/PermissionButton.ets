/*
 * Port of `PermissionButton` (OutRun/Views/Setup/PermissionButton.swift): a tappable
 * pill showing LS["Grant"] uppercased, which swaps to a checkmark once the permission is granted
 * (`transitionState(to:)` cross-fades label and checkmarkIcon).
 *
 * `successState` is driven by the owning page's permission result, so it is a @Prop, and the swap
 * is a real conditional on it.
 *
 * S5 style, from the source verbatim:
 *   height 24, cornerRadius 12, background .secondaryColor -> .accentColor in the success state,
 *   label systemFont 12 .bold in .backgroundColor with a 15pt inset each side,
 *   checkmarkIcon tinted white, 5pt inset top and bottom, scaleAspectFit.
 */
import { drawing, common2D } from '@kit.ArkGraphics2D';
import { localizedString } from '../common/LocalizedStrings';

/**
 * `checkmarkIcon.tintColor = .white`. The bundled asset is a BLACK template PNG and ArkUI's
 * `fillColor` is SVG-only, so the tint is a SRC_IN blend filter: it keeps the glyph's alpha and
 * replaces every colour channel with white.
 */
const WHITE: common2D.Color = { alpha: 255, red: 255, green: 255, blue: 255 };
const WHITE_TEMPLATE_TINT: drawing.ColorFilter =
  drawing.ColorFilter.createBlendModeColorFilter(WHITE, drawing.BlendMode.SRC_IN);

@Component
export struct PermissionButton {
  /** Source: `successState`, set by `transitionState(to:)`. */
  @Prop successState: boolean;
  /** Rule 12 slug of the source's `permissionButton`. */
  buttonSlug: string = '';
  /** Source: `actionClosure`. */
  action: () => void = (): void => {
  };

  build() {
    Row() {
      if (this.successState) {
        /** Source: `checkmarkIcon` — alpha 1 in the success state. */
        Image($r('app.media.checkmark'))
          .height(14)
          .objectFit(ImageFit.Contain)
          .colorFilter(WHITE_TEMPLATE_TINT)
      } else {
        /** Source: `label` — LS["Grant"].uppercased(). */
        Text(localizedString('Grant').toUpperCase())
          .fontSize(12)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.background_color'))
      }
    }
    .id(this.buttonSlug)
    .height(24)
    .padding({ left: 15, right: 15 })
    .borderRadius(12)
    .alignItems(VerticalAlign.Center)
    .justifyContent(FlexAlign.Center)
    .backgroundColor(this.successState
      ? $r('app.color.accent_color') : $r('app.color.secondary_color'))
    .onClick(() => {
      this.action();
    })
  }
}
