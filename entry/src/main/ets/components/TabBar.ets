/*
 * Port of `TabBarController.tabBar` (OutRun/Controllers/General/TabBarController.swift:36-96): the
 * one bar every tab shares — Timeline, the raised add button, Settings.
 *
 * The port has no tab container: each tab root is its own page (WorkoutListViewControllerPage,
 * SettingsViewControllerPage) and the tab swap is a page replace. The two pages used to draw their
 * own copies of the bar with different heights and lifts, so the icons and the add button jumped on
 * every swap (TC-MANUAL-002). Both pages now draw THIS component, so the bar is pixel-identical.
 *
 * S5, from the source:
 *   tabBar        49pt, opaque .backgroundColor; the hairline is covered by `bgrdView`
 *                 (inset top -1), so no top line is drawn
 *   items         23pt template glyphs, 10pt titles; selected = .accentColor, else gray
 *   addButton     58x58, cornerRadius 29, .accentColor fill, 4pt border backgroundColor @ 20%,
 *                 bottom 5pt above the bar's bottom (`make.bottom.offset(-bottomOffset)`, 5 + the
 *                 safe area, which the page's own layout already supplies); 20pt white plus glyph
 */
import { drawing, common2D } from '@kit.ArkGraphics2D';
import { localizedString } from '../common/LocalizedStrings';

/** Source: `TabBarController.viewControllers = [timeline, placeholder, settings]`. */
export const TAB_TIMELINE: number = 0;
export const TAB_SETTINGS: number = 2;

/** Source: `UITabBar` is 49pt tall. */
const TAB_BAR_HEIGHT: number = 49;
/** Source: `addButton` — 58x58, cornerRadius 29 (TabBarController.swift:61-65,84). */
const ADD_BUTTON_SIZE: number = 58;
/** Space between the add button's bottom edge and the bar's bottom (`bottomOffset = 5`). */
const ADD_BUTTON_BOTTOM_GAP: number = 5;
/**
 * The add button is centred in the row; a bottom margin of this size lifts it so its bottom edge
 * sits ADD_BUTTON_BOTTOM_GAP above the bar's bottom: (58 + 2 * 5 - 49) = 19.
 */
const ADD_BUTTON_LIFT: number = ADD_BUTTON_SIZE + 2 * ADD_BUTTON_BOTTOM_GAP - TAB_BAR_HEIGHT;
/**
 * How far the raised button sticks out ABOVE the bar. `addButton` is `tabBar.addSubview`, so UIKit
 * routes a touch to it only where the bar's own `point(inside:)` accepts it: the overhanging part of
 * the circle is drawn over the content and takes no taps. ArkUI has no hit-test clipping, so that
 * region is fenced off with `responseRegion` below — otherwise it swallows the taps meant for the
 * last list or settings row under it.
 */
const ADD_BUTTON_OVERHANG: number = (ADD_BUTTON_SIZE + ADD_BUTTON_LIFT - TAB_BAR_HEIGHT) / 2;

/**
 * The tab-bar glyphs and the plus are BLACK template PNGs (`.withRenderingMode(.alwaysTemplate)`)
 * and ArkUI's `fillColor` is SVG-only, so each tint is a SRC_IN blend filter over the glyph's alpha:
 * accent for the selected item (window.tintColor), gray for the other, white for the plus.
 */
const ACCENT: common2D.Color = { alpha: 255, red: 255, green: 146, blue: 0 };
const INACTIVE: common2D.Color = { alpha: 255, red: 118, green: 118, blue: 118 };
const WHITE: common2D.Color = { alpha: 255, red: 255, green: 255, blue: 255 };
const ACCENT_TINT: drawing.ColorFilter =
  drawing.ColorFilter.createBlendModeColorFilter(ACCENT, drawing.BlendMode.SRC_IN);
const INACTIVE_TINT: drawing.ColorFilter =
  drawing.ColorFilter.createBlendModeColorFilter(INACTIVE, drawing.BlendMode.SRC_IN);
const WHITE_TINT: drawing.ColorFilter =
  drawing.ColorFilter.createBlendModeColorFilter(WHITE, drawing.BlendMode.SRC_IN);

@Component
export struct TabBar {
  /** Source: `TabBarController.selectedIndex` — TAB_TIMELINE or TAB_SETTINGS. */
  @Prop selectedTab: number = TAB_TIMELINE;
  onTimeline: () => void = (): void => {
  };
  /** Source: `showNewWorkoutController` — the add button's tap. */
  onAdd: () => void = (): void => {
  };
  /** Source: `displayNewWorkoutAlert` — the add button's long press. */
  onAddLongPress: () => void = (): void => {
  };
  onSettings: () => void = (): void => {
  };

  build() {
    Row() {
      /** Source: `timeline.tabBarItem` — .tabbarTimeline / .tabbarTimelineFilled. */
      Column({ space: 2 }) {
        Image(this.selectedTab === TAB_TIMELINE
          ? $r('app.media.tabbar_timeline_filled') : $r('app.media.tabbar_timeline'))
          .width(23)
          .height(23)
          .objectFit(ImageFit.Contain)
          .colorFilter(this.selectedTab === TAB_TIMELINE ? ACCENT_TINT : INACTIVE_TINT)
        Text(localizedString('TabBar.Timeline'))
          .fontSize(10)
          .fontColor(this.selectedTab === TAB_TIMELINE
            ? $r('app.color.accent_color') : $r('app.color.secondary_color'))
      }
      .id('tabbar_timeline')
      .layoutWeight(1)
      .justifyContent(FlexAlign.Center)
      .onClick(() => {
        this.onTimeline();
      })
      /**
       * Source: `addButton`. The placeholder tab under it has no caption, so the control's own
       * label stays in the tree (it names the control) and is not drawn.
       */
      Stack() {
        Image($r('app.media.tabbar_plus'))
          .width(20)
          .height(20)
          .objectFit(ImageFit.Contain)
          .colorFilter(WHITE_TINT)
        Text(localizedString('Workout.NewWorkout'))
          .visibility(Visibility.None)
      }
      .id('tabbar_add_workout')
      .width(ADD_BUTTON_SIZE)
      .height(ADD_BUTTON_SIZE)
      .borderRadius(ADD_BUTTON_SIZE / 2)
      .backgroundColor($r('app.color.accent_color'))
      /*
       * Source: `borderColor = UIColor.backgroundColor.withAlphaComponent(0.2)`. ArkUI cannot apply
       * an alpha to a colour RESOURCE, so the light value (#FFFFFF at 20%) is written literally.
       */
      .border({ width: 4, color: 'rgba(255,255,255,0.2)' })
      .margin({ bottom: ADD_BUTTON_LIFT })
      /* See ADD_BUTTON_OVERHANG: only the part inside the bar answers a touch, as in UIKit. */
      .responseRegion({
        x: 0,
        y: ADD_BUTTON_OVERHANG,
        width: ADD_BUTTON_SIZE,
        height: ADD_BUTTON_SIZE - ADD_BUTTON_OVERHANG
      })
      .onClick(() => {
        this.onAdd();
      })
      /* The node's own click recognizer outranks a plain `.gesture()`; `.priorityGesture` puts the
       * long press ahead of it, and a short tap still reaches `.onClick`. */
      .priorityGesture(LongPressGesture().onAction(() => {
        this.onAddLongPress();
      }))
      /** Source: `settings.tabBarItem` — .tabbarSettings / .tabbarSettingsFilled. */
      Column({ space: 2 }) {
        Image(this.selectedTab === TAB_SETTINGS
          ? $r('app.media.tabbar_settings_filled') : $r('app.media.tabbar_settings'))
          .width(23)
          .height(23)
          .objectFit(ImageFit.Contain)
          .colorFilter(this.selectedTab === TAB_SETTINGS ? ACCENT_TINT : INACTIVE_TINT)
        Text(localizedString('TabBar.Settings'))
          .fontSize(10)
          .fontColor(this.selectedTab === TAB_SETTINGS
            ? $r('app.color.accent_color') : $r('app.color.secondary_color'))
      }
      /* Source: `settingsTabBarItem.accessibilityIdentifier = "tabbar_settings"`. */
      .id('tabbar_settings')
      .layoutWeight(1)
      .justifyContent(FlexAlign.Center)
      .onClick(() => {
        this.onSettings();
      })
    }
    .width('100%')
    .height(TAB_BAR_HEIGHT)
    .alignItems(VerticalAlign.Center)
    .backgroundColor($r('app.color.background_color'))
  }
}
