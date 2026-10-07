/*
 * S3 structure — port of `ProgressViewController`
 * (OutRun/Controllers/General/ProgressViewController.swift:23-48) and the launch sequence that owns
 * it (AppDelegate.swift:39-89).
 *
 * Source tree, in full: `infoLabel` (LS["Loading-DoNotClose"], centred) 10pt above `progressView`
 * (a UIProgressView centred in the view), both inset 40 left and right. There is NO interactive
 * control on this screen at all — nothing to add here, and nothing may be invented.
 *
 * This is the app's cold-start root: `DataManager.setup`'s migrationClosure installs it as the root
 * and hands back the closure that drives `setProgress(_:)`, so the bar's value is the REAL migration
 * progress, never an animation.
 *
 * The source shows this controller as the root while `DataManager.setup` migrates the store, driving
 * its progress bar from the migration closure, then swaps the root for TabBarController or
 * StartScreenViewController depending on `UserPreferences.isSetUp`. Both swaps are root swaps, so
 * both nav edges are `replace`.
 */
import { router } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { DataManager } from '../common/DataManager';
import { UserPreferences } from '../common/UserPreferences';
import { localizedString } from '../common/LocalizedStrings';

const DOMAIN = 0x0000;

@Entry
@Component
struct ProgressViewControllerPage {
  /** Source: `setProgress(_:)` — the migration closure's 0..1 value. */
  @State progress: number = 0;

  aboutToAppear(): void {
    this.runSetup();
  }

  build() {
    Column() {
      /** Source: `infoLabel` — LS["Loading-DoNotClose"], centred, inset 40 each side. */
      Text(localizedString('Loading-DoNotClose'))
        /* Source verbatim: `.systemFont(ofSize: 16, weight: .bold)` in `.primaryColor`, centred. */
        .fontSize(16)
        .fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.primary_color'))
        .textAlign(TextAlign.Center)
        .width('100%')
      /** Source: `progressView` — centred in the view, inset 40 each side, 10pt below the label. */
      Progress({ value: this.progress * 100, total: 100, type: ProgressType.Linear })
        .width('100%')
        /* Source: `progressView.progressTintColor = .accentColor` over UIKit's 4pt grey track. */
        .color($r('app.color.accent_color'))
        .backgroundColor($r('app.color.table_view_separator'))
        .height(4)
        .margin({ top: 10 })
    }
    .padding({ left: 40, right: 40 })
    /** Source: `self.view.backgroundColor = .backgroundColor`. */
    .backgroundColor($r('app.color.background_color'))
    /** Source: `progressView.snp.center.equalToSuperview()` — the pair is centred in the view. */
    .justifyContent(FlexAlign.Center)
    .id('ProgressViewControllerPage')
    .width('100%')
    .height('100%')
  }

  /** Source: `DataManager.setup(completion:migrationClosure:)` — migrate, then swap the root. */
  private async runSetup(): Promise<void> {
    try {
      await DataManager.setup((value: number): void => {
        this.progress = value;
      });
    } catch (err) {
      hilog.error(DOMAIN, 'ProgressViewControllerPage', 'DataManager.setup failed: %{public}s',
        JSON.stringify(err));
    }
    this.openRoot();
  }

  /**
   * Source: AppDelegate's completion — `setRootViewController(for:withSmoothTransition:)` with
   * TabBarController when `UserPreferences.isSetUp` is true, StartScreenViewController otherwise.
   * A root swap, so replaceUrl, never a push.
   */
  private openRoot(): void {
    // A `targetPage` deep link naming THIS page asked for the page itself, not for the launch
    // sequence that passes through it. The source has no navigation in this controller at all
    // (ProgressViewController.swift:23-48) — the swap below is AppDelegate's completion — so
    // staying put is this screen as the source defines it. Cleared once consumed.
    if (AppStorage.get<string>('deepLinkPage') === 'pages/ProgressViewControllerPage') {
      AppStorage.setOrCreate<string>('deepLinkPage', '');
      return;
    }
    const root: string = UserPreferences.isSetUp.value
      ? 'pages/WorkoutListViewControllerPage'
      : 'pages/StartScreenViewControllerPage';
    router.replaceUrl({ url: root });
  }
}
