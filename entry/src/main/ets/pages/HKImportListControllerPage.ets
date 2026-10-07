/*
 * S3 structure — port of `HKImportListController`
 * (OutRun/Controllers/HealthKit/HKImportListController.swift:23-172).
 *
 * Source tree: a UITableViewController pushed INSIDE the settings tab (so the tab bar stays
 * visible), navigation title LS["ImportList.Title"], an LS["ImportList.ImportAll"] right bar button
 * that starts `isEnabled = false` and becomes `!objects.isEmpty` after the query, a table of
 * `HKImportObjectCell` rows, and a centred `noDataLabel` (LS["NoData.Message"]) hidden exactly while
 * `queriedObjects.count != 0`.
 *
 * Honest empty state: HMS exposes no Health read path to this build (the operator pruned the iOS
 * HealthKit entitlements and the registered substitution is the app's OWN relationalStore), so
 * `HealthQueryManager.queryExternalWorkouts` returns the stored records that came from outside this
 * app — which is normally none. The row, the populated branch and the enabled Import All are built
 * from the SOURCE, not from the blank capture, and nothing here invents Health data.
 *
 * Both branches are ONE `if/else` on the same bound count, so the empty label can never render
 * beside a populated list.
 */
import { drawing, common2D } from '@kit.ArkGraphics2D';
import { router } from '@kit.ArkUI';
import { HKWorkoutQueryObject } from '../model/HKWorkoutQueryObject';
import { Workout } from '../model/Workout';
import { HealthQueryManager } from '../common/HealthQueryManager';
import { DataManager } from '../common/DataManager';
import { ArrayDataSource } from '../common/ArrayDataSource';
import { localizedString } from '../common/LocalizedStrings';
import { showConfirmAlert, showErrorAlert } from '../common/AlertDialogs';
import { BACK_CHEVRON_GAP, BACK_CHEVRON_SIZE, closeTo } from '../common/NavBack';
import { HKImportObjectCell } from '../components/HKImportObjectCell';
import { LoadingView } from '../components/LoadingView';

/** Source: TabBarController.selectedIndex — this controller is pushed inside the settings tab. */
const TAB_TIMELINE: number = 0;
const TAB_SETTINGS: number = 2;
/** Source: the settings table's 16pt layout margin (capture S0019: the title starts at x=15). */
const LIST_MARGIN: number = 16;
/** Source: the UINavigationBar under the status bar — capture S0019 puts its items in [47,91]. */
const NAV_BAR_HEIGHT: number = 44;

/**
 * The tab-bar glyphs and the plus are BLACK template PNGs (`.withRenderingMode(.alwaysTemplate)`
 * in the source) and ArkUI's `fillColor` is SVG-only, so each tint is a SRC_IN blend filter.
 */
const ACCENT: common2D.Color = { alpha: 255, red: 255, green: 146, blue: 0 };
const SECONDARY: common2D.Color = { alpha: 255, red: 118, green: 118, blue: 118 };
const WHITE: common2D.Color = { alpha: 255, red: 255, green: 255, blue: 255 };
const ACCENT_TEMPLATE_TINT: drawing.ColorFilter =
  drawing.ColorFilter.createBlendModeColorFilter(ACCENT, drawing.BlendMode.SRC_IN);
const SECONDARY_TEMPLATE_TINT: drawing.ColorFilter =
  drawing.ColorFilter.createBlendModeColorFilter(SECONDARY, drawing.BlendMode.SRC_IN);
const WHITE_TEMPLATE_TINT: drawing.ColorFilter =
  drawing.ColorFilter.createBlendModeColorFilter(WHITE, drawing.BlendMode.SRC_IN);

@Entry
@Component
struct HKImportListControllerPage {
  /** Source: `TabBarController.selectedIndex` — the settings tab stays selected under this push. */
  @StorageLink('selectedTab') selectedTab: number = TAB_SETTINGS;
  /** Source: `queriedObjects` — `HealthQueryManager.queryExternalWorkouts`'s result. */
  @State queriedObjects: ArrayDataSource<HKWorkoutQueryObject> =
    new ArrayDataSource<HKWorkoutQueryObject>([]);
  /** Source: `startLoading { ... }` / `endLoading { ... }` around the query and every save. */
  @State isLoading: boolean = false;

  /** Source: `viewDidLoad` — `self.startQuery()`. */
  aboutToAppear(): void {
    this.startQuery();
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Column() {
        /**
         * Source: the navigation bar — the `importButton` right bar button. S5, measured off the
         * capture (S0019 `base.ui.json`): the bar is the 44pt band `[47,91]` carrying ONLY the bar
         * buttons; a UIBarButtonItem is flat text on the bar's `.accentColor` tint and renders
         * .secondaryColor-grey while disabled, as 'Import All' does on the captured empty list.
         */
        Row() {
          /**
           * Source: `controller.show(importController, sender:)` (SettingsModel.swift:315-316) — a
           * PUSH onto the settings navigation stack, so UINavigationBar draws its own back item
           * titled with the previous screen's title. The capture confirms it: S0019 `base.ui.json`
           * has a clickable Button `text: "Settings"` at `[0,47][93,91]`, leading, in the 44pt bar.
           * It is a UIKit-generated control, so it carries NO accessibilityIdentifier in the source
           * or the capture (the replay finds it by its text); the id below is the platform-affordance
           * convention, not an invented source slug.
           */
          Row({ space: BACK_CHEVRON_GAP }) {
            SymbolGlyph($r('sys.symbol.chevron_left'))
              .fontSize(BACK_CHEVRON_SIZE)
              .fontWeight(FontWeight.Bold)
              .fontColor([$r('app.color.accent_color')])
            Text(localizedString('Settings'))
              .fontSize(17)
              .fontWeight(FontWeight.Normal)
              .fontColor($r('app.color.accent_color'))
              .maxLines(1)
          }
          .id('nav_back')
          .height(NAV_BAR_HEIGHT)
          .alignItems(VerticalAlign.Center)
          .onClick(() => {
            this.goBack();
          })
          Blank()
          Button(localizedString('ImportList.ImportAll'))
            .id('hk_import_import_all')
            .type(ButtonType.Normal)
            .height(NAV_BAR_HEIGHT)
            .backgroundColor($r('app.color.background_color'))
            .fontSize(16)
            .fontWeight(FontWeight.Normal)
            .fontColor(this.queriedObjects.totalCount() > 0
              ? $r('app.color.accent_color') : $r('app.color.secondary_color'))
            /** Source: `importButton.isEnabled = !objects.isEmpty` (false until the query lands). */
            .enabled(this.queriedObjects.totalCount() > 0)
            .onClick(() => {
              this.importAll();
            })
        }
        .width('100%')
        .height(NAV_BAR_HEIGHT)
        .alignItems(VerticalAlign.Center)
        .padding({ left: LIST_MARGIN, right: LIST_MARGIN })
        .backgroundColor($r('app.color.background_color'))

        /**
         * Source: `navigationItem.title = LS["ImportList.Title"]` with a LARGE title — capture
         * S0019 has it at `[15,96][128,135]`, i.e. 32pt heavy small-caps in .accentColor below the
         * bar, exactly as every other screen of this app draws its headline.
         */
        Text(localizedString('ImportList.Title'))
          .fontSize(32)
          .fontWeight(900)
          .fontFeature('"smcp" 1')
          .lineHeight(39)
          .fontColor($r('app.color.accent_color'))
          .width('100%')
          .textAlign(TextAlign.Start)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .padding({ left: LIST_MARGIN, right: LIST_MARGIN, top: 5, bottom: 4 })

        /**
         * Source: `noDataLabel.isHidden = !(queriedObjects.count == 0)` — the label and the rows are
         * the same branch, never both.
         */
        if (this.queriedObjects.totalCount() > 0) {
          List() {
            LazyForEach(this.queriedObjects, (object: HKWorkoutQueryObject) => {
              ListItem() {
                HKImportObjectCell({
                  queryObject: object,
                  onSelect: (): void => {
                    this.importOne(object);
                  }
                })
              }
              /** Source: `containerView.edges.equalToSuperview().inset(10)` — the cell's inset. */
              .padding(10)
            }, (object: HKWorkoutQueryObject) => object.hkWorkout)
          }
          .layoutWeight(1)
          .width('100%')
        } else {
          Column() {
            /**
             * Source: `noDataLabel` — the app's shared empty-state label: systemFont 16 .bold in
             * .secondaryColor, centred. (The captured tree carries no such node because the
             * pruned-entitlement query never ran; the SOURCE declares it, so it is styled here.)
             */
            Text(localizedString('NoData.Message'))
              .fontSize(16)
              .fontWeight(FontWeight.Bold)
              .fontColor($r('app.color.secondary_color'))
              .textAlign(TextAlign.Center)
              .padding({ left: LIST_MARGIN, right: LIST_MARGIN })
          }
          .layoutWeight(1)
          .width('100%')
          .justifyContent(FlexAlign.Center)
        }

        /** Source: `TabBarController.tabBar` — this controller is PUSHED inside the settings tab,
         * so the bar stays visible under it. */
        Row() {
          Column({ space: 2 }) {
            Image($r('app.media.tabbar_timeline'))
              .width(23)
              .height(23)
              .objectFit(ImageFit.Contain)
              /** Source: an unselected item takes the bar's .secondaryColor tint. */
              .colorFilter(SECONDARY_TEMPLATE_TINT)
            Text(localizedString('TabBar.Timeline'))
              .fontSize(10)
              .fontColor($r('app.color.secondary_color'))
          }
          .layoutWeight(1)
          .justifyContent(FlexAlign.Center)
          .id('tabbar_timeline')
          .onClick(() => {
            this.openWorkoutList();
          })
          /** Source: `addButton` — the raised accent circle; the placeholder tab draws no caption. */
          Stack() {
            Image($r('app.media.tabbar_plus'))
              .width(20)
              .height(20)
              .objectFit(ImageFit.Contain)
              .colorFilter(WHITE_TEMPLATE_TINT)
            Text(localizedString('Workout.NewWorkout'))
              .visibility(Visibility.None)
          }
          .width(58)
          .height(58)
          /** Source: `addButton` — 58x58, cornerRadius 29, .accentColor with a 4pt page-coloured
           * ring, raised over the bar (TabBarController.swift:65,84). */
          .backgroundColor($r('app.color.accent_color'))
          .borderRadius(29)
          .border({ width: 4, color: $r('app.color.background_color') })
          .margin({ bottom: 24 })
          .id('tabbar_add_workout')
          .onClick(() => {
            this.openNewWorkout();
          })
          Column({ space: 2 }) {
            Image($r('app.media.tabbar_settings_filled'))
              .width(23)
              .height(23)
              .objectFit(ImageFit.Contain)
              /** Source: the SELECTED item (this push lives in the settings tab) is .accentColor. */
              .colorFilter(ACCENT_TEMPLATE_TINT)
            Text(localizedString('TabBar.Settings'))
              .fontSize(10)
              .fontColor($r('app.color.accent_color'))
          }
          .layoutWeight(1)
          .justifyContent(FlexAlign.Center)
          .id('tabbar_settings')
          .onClick(() => {
            this.openSettings();
          })
        }
        .width('100%')
        .height(49)
        .alignItems(VerticalAlign.Center)
        /** Source: `tabBar.barTintColor = .backgroundColor`, no translucency and no hairline. */
        .backgroundColor($r('app.color.background_color'))
      }
      .width('100%')
      .height('100%')

      /** Source: `startLoading { }` — the modal loading overlay around the query and the saves. */
      if (this.isLoading) {
        LoadingView()
      }
    }
    .id('HKImportListControllerPage')
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background_color'))
  }

  /**
   * Source: `startQuery()` — startLoading, `HealthQueryManager.queryExternalWorkouts`, then either
   * the objects + `importButton.isEnabled = !objects.isEmpty`, or the
   * LS["ImportList.Error.FetchFailed.Message"] error whose dismissal dismisses this screen.
   */
  private async startQuery(): Promise<void> {
    this.isLoading = true;
    try {
      const objects: HKWorkoutQueryObject[] | null =
        await HealthQueryManager.queryExternalWorkouts();
      if (objects === null) {
        this.queriedObjects = new ArrayDataSource<HKWorkoutQueryObject>([]);
        await showErrorAlert(localizedString('ImportList.Error.FetchFailed.Message'));
        /* A deep-linked replay launch has only this page on the stack, where a bare back()
         * backgrounds the ability and the device lands on the launcher instead of the presenter. */
        closeTo('pages/SettingsViewControllerPage');
        return;
      }
      this.queriedObjects = new ArrayDataSource<HKWorkoutQueryObject>(objects);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Source: `tableView(_:didSelectRowAt:)` — the LS["HKImport.Alert.Title"] Yes/No alert, then
   * `DataManager.saveWorkout(for: object)`; on success the row leaves the list, on failure
   * LS["HKImport.Error"].
   */
  private async importOne(object: HKWorkoutQueryObject): Promise<void> {
    const confirmed: boolean = await showConfirmAlert(localizedString('HKImport.Alert.Title'),
      localizedString('HKImport.Alert.Title'), localizedString('Yes'), false);
    if (!confirmed) {
      return;
    }
    this.isLoading = true;
    try {
      const saved: Workout | null = await DataManager.saveHealthWorkout(object);
      if (saved === null) {
        await showErrorAlert(localizedString('HKImport.Error'));
        return;
      }
      this.removeCandidate(object);
    } finally {
      this.isLoading = false;
    }
  }

  /** Source: `self.queriedObjects.remove(at:)` + `tableView.deleteRows(at:)`. */
  private removeCandidate(object: HKWorkoutQueryObject): void {
    const remaining: HKWorkoutQueryObject[] = [];
    const total: number = this.queriedObjects.totalCount();
    for (let index: number = 0; index < total; index++) {
      const candidate: HKWorkoutQueryObject = this.queriedObjects.getData(index);
      if (candidate.hkWorkout !== object.hkWorkout) {
        remaining.push(candidate);
      }
    }
    this.queriedObjects = new ArrayDataSource<HKWorkoutQueryObject>(remaining);
  }

  /**
   * Source: `importAll()` — the LS["HKImport.ImportAll.Alert.Title"] Yes/No alert, then
   * `DataManager.saveWorkouts(for: queriedObjects)`; either way `startQuery()` reloads the list,
   * with LS["HKImport.ImportAll.Error"] first on failure.
   */
  private async importAll(): Promise<void> {
    const confirmed: boolean =
      await showConfirmAlert(localizedString('HKImport.ImportAll.Alert.Title'),
        localizedString('HKImport.ImportAll.Alert.Title'), localizedString('Yes'), false);
    if (!confirmed) {
      return;
    }
    this.isLoading = true;
    const candidates: HKWorkoutQueryObject[] = [];
    const total: number = this.queriedObjects.totalCount();
    for (let index: number = 0; index < total; index++) {
      candidates.push(this.queriedObjects.getData(index));
    }
    try {
      const saved: Workout[] = await DataManager.saveHealthWorkouts(candidates);
      if (saved.length === 0) {
        await showErrorAlert(localizedString('HKImport.ImportAll.Error'));
      }
    } finally {
      this.isLoading = false;
    }
    this.startQuery();
  }

  /** Source: the tab bar's timeline item — the source swaps the tab's root, it does not push. */
  private openWorkoutList(): void {
    this.selectedTab = TAB_TIMELINE;
    router.replaceUrl({ url: 'pages/WorkoutListViewControllerPage' });
  }

  /** Source: the centre add button — showDetailViewController(NewWorkoutViewController). */
  private openNewWorkout(): void {
    router.pushUrl({ url: 'pages/NewWorkoutViewControllerPage' });
  }

  /**
   * Source: the `< Settings` nav item pops this push (SettingsModel.swift:315-316 pushed it).
   * A deep-linked launch has only this page on the stack, where `router.back()` exits the app
   * (the pipeline replays every state as its own launch); the source always returns to its
   * presenter, so fall back to that page.
   */
  private goBack(): void {
    if (Number.parseInt(router.getLength(), 10) > 1) {
      router.back();
    } else {
      router.replaceUrl({ url: 'pages/SettingsViewControllerPage' });
    }
  }

  /** Source: tapping the already-selected settings tab pops this push back to its root. */
  private openSettings(): void {
    this.selectedTab = TAB_SETTINGS;
    /* Same deep-link guard as goBack(): a bare back() on the root page exits the app, which is
     * what made S0020's replay capture the launcher instead of the settings screen. */
    closeTo('pages/SettingsViewControllerPage');
  }
}
