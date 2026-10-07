/*
 * S3 structure — port of `SettingsViewController`
 * (OutRun/Controllers/Settings/SettingsViewController.swift) and the settings half of
 * `TabBarController`.
 *
 * ONE page renders the tab root AND every pushed sub-model, exactly as the source's one class does:
 * a grouped table over `settingsModel.sections`, each row drawn by its setting kind
 * (tableView(_:cellForRowAt:) -> `setting.tableViewCell`, identifier "settings_itemroot") and
 * tapped through `tableView(_:didSelectRowAt:)` -> `setting.runSelectAction(controller:)`.
 * The section list, every row's value and every row's action come from svc_settings_model
 * (common/SettingsModelEngine.ts) — nothing on this page is a literal from the capture.
 *
 * A redirecting row pushes this same page with a different model (`controller.show(...)`); the model
 * is a closure graph, so it is handed over through AppStorage rather than through router params,
 * which carry JSON only (see PENDING_SUB_MODEL_KEY).
 * S5 style, read off the source's own chrome, not measured from the capture:
 *   view/tableView.backgroundColor  .backgroundColor (SettingsViewController.swift:39-46) — the
 *                                   app overrides the grouped table's gray, so the page is plain
 *   tableView.separatorColor        .tableViewSeparator
 *   navigationBar large title       .accentColor, systemFont 32 .heavy .withLowerCaseSmallCaps
 *                                   (NavigationController.swift:29), left at the 16pt bar margin
 *   section header / footer         UIKit grouped defaults: uppercased 12fp .secondaryColor header,
 *                                   footnote-sized .secondaryColor footer, both at the 16pt margin
 *   tabBar                          barTintColor .backgroundColor, opaque, item glyph 23pt with a
 *                                   10pt caption, tinted .accentColor when selected and gray when
 *                                   not (window.tintColor = .accentColor, AppDelegate.swift:350);
 *                                   the centre addButton is 58x58, cornerRadius 29, .accentColor,
 *                                   a 4pt .backgroundColor@0.2 border and a white 20pt plus
 *                                   (TabBarController.swift:63-95)
 */
import { componentUtils, router, window } from '@kit.ArkUI';
import { common } from '@kit.AbilityKit';
import { SettingsModel } from '../model/SettingsModel';
import { Setting, SettingSection } from '../model/SettingSection';
import { PolicyType } from '../model/PolicyType';
import { localizedString } from '../common/LocalizedStrings';
import { BACK_CHEVRON_GAP, BACK_CHEVRON_SIZE, closeTo } from '../common/NavBack';
import {
  SettingsModelEngine,
  SettingsActions,
  setSettingsContext,
  TitleSetting as TitleSettingModel,
  TitleSubTitleSetting as TitleSubTitleSettingModel,
  SelectionSetting as SelectionSettingModel,
  SwitchSetting as SwitchSettingModel,
  ButtonSetting as ButtonSettingModel,
  TextInputSetting as TextInputSettingModel
} from '../common/SettingsModelEngine';
import { UnitPreferenceSetting } from '../common/UserPreferences';
import { Measurement } from '../common/Measurement';
/* The four managers the settings rows reach. They are invoked HERE, not in the engine: the system
 * share sheet, the document picker and the permission request all need this page's UI context. */
import { HealthStoreManager } from '../common/HealthStoreManager';
import { PermissionManager } from '../common/PermissionManager';
import { BackupManager } from '../common/BackupManager';
import { ShareManager } from '../common/ShareManager';
import { TitleSetting } from '../components/TitleSetting';
import { TitleSubTitleSetting } from '../components/TitleSubTitleSetting';
import { SelectionSetting } from '../components/SelectionSetting';
import { SwitchSetting } from '../components/SwitchSetting';
import { ButtonSetting } from '../components/ButtonSetting';
import { TextInputSetting } from '../components/TextInputSetting';
import { LoadingView } from '../components/LoadingView';
import { TAB_SETTINGS, TAB_TIMELINE, TabBar } from '../components/TabBar';
import { WorkoutTypeAlertPage } from './WorkoutTypeAlertPage';

/**
 * Source: `controller.show(newSettingsController)` — the sub-model a redirecting row pushes. A
 * SettingsModel is a live object graph of closures, so it cannot travel in router params, which
 * carry JSON only; it is handed over through AppStorage instead.
 *
 * NOT a module-level `let`: `router.pushUrl` of this page's own url creates a SECOND page instance
 * (hilog: "Page router manager is creating page[2]: url: pages/SettingsViewControllerPage"), and
 * that instance evaluates this module afresh, so a module variable is back to its initializer by
 * the time the pushed page's `aboutToAppear` reads it. The pushed page then fell back to
 * `SettingsModelEngine.main`, rendering a tree identical to the one it was pushed from — every
 * redirecting row (unit pickers, Standard Type, GPS Accuracy, Contribution) looked dead. AppStorage
 * is ability-wide, so it survives the page-module boundary.
 */
const PENDING_SUB_MODEL_KEY: string = 'pendingSettingsSubModel';

/**
 * Source: the manager calls `SettingsModel`'s rows made through the presenting view controller —
 * the weight/workout health sync (`HealthStoreManager`), the health permission prompt
 * (`PermissionManager`), the .orbup document picker (`BackupManager`) and the backup share sheet
 * (`ShareManager`). The engine still owns the rows, their alerts and the loading overlay; only
 * these invocations belong to the page.
 */
const settingsActions: SettingsActions = {
  syncWeight: (weight: Measurement): Promise<boolean> => HealthStoreManager.syncWeight(weight),
  requestHealthPermission: (): Promise<boolean> => PermissionManager.checkHealthPermission(),
  syncAllWorkouts: (): Promise<boolean | null> =>
    HealthStoreManager.syncAllUnsyncedWorkoutsWithAppleHealth(),
  createBackup: (): Promise<void> => ShareManager.exportBackupAlertAction(null),
  importBackup: (): Promise<boolean> => BackupManager.importBackup(),
  deleteAllHealthWorkouts: (): Promise<boolean> => HealthStoreManager.deleteAllHealthWorkouts()
};

/** Source: `addDebugGestureRecognizer()` — numberOfTapsRequired = 10. */
const DEBUG_GESTURE_TAPS: number = 10;
/** Flattens an IndexPath into one number, the way `cellShouldBeVisisble` identifies its row. */
const ROW_STRIDE: number = 1000;
/** Source: UIKit's own cell layout margin — the inset every settings row and header sits at. */
const LIST_MARGIN: number = 16;
/**
 * UINavigationBar height. The app never calls `setWindowLayoutFullScreen`, so the page's own
 * origin is already below the status bar — the capture's 47pt status inset is NOT ours to add.
 * Capture S0017 puts the bar title at device y 59-79, i.e. 12-32 in this page's coordinates,
 * which is a 20pt line centred in a 44pt bar.
 */
const NAV_BAR_HEIGHT: number = 44;
/** Width kept clear on each side of the small title for the back item (chevron + title). */
const BACK_ITEM_RESERVE: number = 110;
/** The large title is 39pt tall at y 96; past this the bar title takes over. */
const TITLE_COLLAPSE_OFFSET: number = 24;
/** Longest gap between two taps that still counts as the same burst, in milliseconds. */
const DEBUG_GESTURE_WINDOW: number = 400;

@Entry
@Component
struct SettingsViewControllerPage {
  /**
   * Source: `settingsModel` / `settingsModelClosure` — SettingsModel.main for the tab root, or the
   * sub-model the pushing row handed over.
   */
  @State settingsModel: SettingsModel | null = null;
  /**
   * Source: `refreshTableView()` after `Setting.refresh()` — a revision counter bumped whenever a
   * row writes svc_user_preferences, so every rendered row re-reads the store.
   */
  @State preferences: number = 0;
  /** Source: `startLoading`/`endLoading` — the sync-all and delete-all overlay. */
  @State isLoading: boolean = false;
  /* key: LOADING_VISIBLE_KEY (common/LoadingOverlay.ts) — a decorator key must be a literal. The
   * overlay is raised by the data layer (svc_backup_manager / svc_health_store_manager write the
   * key), so the page follows the store and mirrors it into the render flag above. */
  @StorageLink('loadingOverlayVisible') @Watch('onLoadingChanged') loadingOverlayVisible: boolean = false;
  /**
   * Source: `cellShouldBeVisisble` — the row whose text field began editing
   * (`textFieldShouldBeginEditing` -> `registerForKeyboardAvoidanceClosure`). `-1` is the source's
   * nil. The value is `sectionIndex * ROW_STRIDE + rowIndex`, the flat index of that row.
   */
  @State keyboardVisibleRow: number = -1;
  /** Source: `keyboardWillShow` — `keyboardHeight - safeAreaInsets.bottom`, reset on willHide. */
  @State keyboardInset: number = 0;
  /**
   * S6: `navigationItem.largeTitleDisplayMode` — the large title scrolls away and UIKit swaps in
   * the small centred bar title (capture S0017: 'Settings' at [159,59][231,79]). True once the
   * table has scrolled past it.
   */
  @State titleCollapsed: boolean = false;
  /** Source: `TabBarController.displayNewWorkoutAlert()` — the same type alert the list root owns,
   * because the add button and its long press live on the tab bar, which is on every tab. */
  @State isTypeAlertShown: boolean = false;
  private typeAlert: CustomDialogController = new CustomDialogController({
    builder: WorkoutTypeAlertPage({
      allowsManualEntry: true,
      isShown: $isTypeAlertShown,
      /** Source: `manualAction:` — the tab bar owns where manual entry goes. */
      manualAction: (): void => {
        router.pushUrl({ url: 'pages/EditWorkoutControllerPage' });
      }
    }),
    autoCancel: true,
    customStyle: true,
    alignment: DialogAlignment.Center
  });
  /** Source: `TabBarController.selectedIndex` — this page is tab 2. */
  @StorageLink('selectedTab') selectedTab: number = TAB_SETTINGS;
  /** Source: `controller.show(...)` / `showDetailViewController(...)` raised by a row's action. */
  /* key: SETTINGS_NAVIGATION_KEY (common/SettingsModelEngine.ts). */
  @StorageLink('settingsNavigationRequest') @Watch('onNavigationRequest') navigationRequest: string = '';

  /** Source: the pushing controller's title, shown by the back item; '' on the tab root. */
  private backTitle: string = '';
  /** Source: the grouped `tableView` — held so the keyboard inset can scroll the table. */
  private scroller: Scroller = new Scroller();
  /** The window the keyboard notifications come from, released in aboutToDisappear. */
  private keyboardWindow: window.Window | null = null;
  /** Source: `formerContentOffset` — the table offset before the keyboard showed; -1 is its nil. */
  private formerContentOffset: number = -1;

  /**
   * Source: `keyboardWillShow(_:)` / `keyboardWillHide(_:)`. Held as a field so `off` can be given
   * the same reference `on` was given.
   */
  private onKeyboardHeight: (height: number) => void = (height: number): void => {
    if (height <= 0) {
      // keyboardWillHide: contentInset back to zero and the former offset restored
      this.keyboardInset = 0;
      if (this.formerContentOffset >= 0) {
        this.scroller.scrollTo({ xOffset: 0, yOffset: this.formerContentOffset, animation: true });
        this.formerContentOffset = -1;
      }
      return;
    }
    // The event reports px; the padding below is in vp.
    this.keyboardInset = px2vp(height);
    if (this.keyboardVisibleRow < 0 || this.keyboardWindow === null) {
      return;
    }
    if (this.formerContentOffset < 0) {
      this.formerContentOffset = this.scroller.currentOffset().yOffset;
    }
    /*
     * Source: scrollToRow(at: indexPath, at: .bottom) — the row's bottom edge goes to the
     * keyboard's top edge, clamped to the table's content. A row near the top (Name, Weight)
     * therefore does not move at all. Calling scrollEdge(.bottom) here instead threw the page to
     * its end and the edited field off screen (TC-MANUAL-003).
     */
    const row: componentUtils.ComponentInfo =
      componentUtils.getRectangleById(`settings_row_${this.keyboardVisibleRow}`);
    const rowBottom: number = row.windowOffset.y + row.size.height;
    const keyboardTop: number = this.keyboardWindow.getWindowProperties().windowRect.height - height;
    const target: number = this.scroller.currentOffset().yOffset + px2vp(rowBottom - keyboardTop);
    this.scroller.scrollTo({ xOffset: 0, yOffset: Math.max(0, target), animation: true });
  };

  /** Source: `viewWillAppear` — updateSettingsModel() then refreshTableView(). */
  aboutToAppear(): void {
    setSettingsContext(getContext(this) as common.UIAbilityContext);
    const handed: SettingsModel | undefined = AppStorage.get<SettingsModel>(PENDING_SUB_MODEL_KEY);
    // Source: `updateSettingsModel()` — the closure for the tab root, the handed model for a push.
    this.settingsModel = handed !== undefined ? handed : SettingsModelEngine.main(settingsActions);
    // Consumed: the next push hands over its own model, and the tab root must not inherit this one.
    AppStorage.delete(PENDING_SUB_MODEL_KEY);
    if (handed !== undefined) {
      const params: Record<string, string> | undefined = router.getParams() as Record<string, string>;
      this.backTitle = params?.['backTitle'] ?? localizedString('Settings');
    }
    this.isLoading = this.loadingOverlayVisible;
    this.refresh();
    /* Source: `NotificationCenter.addObserver(keyboardWillShow/Hide)` in viewDidLoad. */
    window.getLastWindow(getContext(this)).then((win: window.Window): void => {
      this.keyboardWindow = win;
      win.on('keyboardHeightChange', this.onKeyboardHeight);
    });
  }

  /**
   * Source: `viewWillAppear` — UIKit calls it AGAIN when a pushed controller pops, and the source
   * runs `updateSettingsModel()` + `refreshTableView()` there. `aboutToAppear` fires only when the
   * page is created, so without this the row that pushed a sub-model (a unit picker, Standard Type,
   * GPS Accuracy) kept the value it displayed before the sub-model wrote a new one.
   */
  onPageShow(): void {
    this.refresh();
  }

  /** Source: the controller's observers dying with it — the subscription must not outlive the page. */
  aboutToDisappear(): void {
    const win: window.Window | null = this.keyboardWindow;
    if (win === null) {
      return;
    }
    try {
      win.off('keyboardHeightChange', this.onKeyboardHeight);
    } finally {
      this.keyboardWindow = null;
    }
  }

  /** Source: `startLoading`/`endLoading` raised by a row's action in the data layer. */
  onLoadingChanged(): void {
    this.isLoading = this.loadingOverlayVisible;
  }

  build() {
    Stack() {
      Column() {
        /**
         * Source: the UINavigationBar itself — 44pt under the status bar, holding the SMALL
         * centred title UIKit swaps in once the large one has scrolled away (capture S0017).
         * DATA-BOUND to the same `settingsModel?.title ?? LS["Settings"]`.
         */
        Stack({ alignContent: Alignment.Start }) {
          Text(this.titleText())
            .fontSize(17)
            .fontWeight(FontWeight.Bold)
            .fontFeature('"smcp" 1')
            .fontColor($r('app.color.primary_color'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .opacity(this.titleCollapsed ? 1 : 0)
            .width('100%')
            .textAlign(TextAlign.Center)
            .padding({ left: BACK_ITEM_RESERVE, right: BACK_ITEM_RESERVE })
          /*
           * Source: a sub-model is `controller.show(newSettingsController)` — a PUSH onto the
           * settings NavigationController, so UINavigationBar draws its back item: a chevron plus
           * the previous screen's title ("Settings"), in the window tint. The tab root has none.
           */
          if (this.backTitle !== '') {
            Row({ space: BACK_CHEVRON_GAP }) {
              SymbolGlyph($r('sys.symbol.chevron_left'))
                .fontSize(BACK_CHEVRON_SIZE)
                .fontWeight(FontWeight.Bold)
                .fontColor([$r('app.color.accent_color')])
              Text(this.backTitle)
                .fontSize(17)
                .fontWeight(FontWeight.Normal)
                .fontColor($r('app.color.accent_color'))
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
                .constraintSize({ maxWidth: BACK_ITEM_RESERVE - 19 })
            }
            .id('nav_back')
            .height(NAV_BAR_HEIGHT)
            .alignItems(VerticalAlign.Center)
            .onClick(() => {
              closeTo('pages/SettingsViewControllerPage');
            })
          }
        }
        .width('100%')
        .height(NAV_BAR_HEIGHT)
        .padding({ left: LIST_MARGIN - 8, right: LIST_MARGIN })
        .backgroundColor($r('app.color.background_color'))
        /**
         * Source: `numberOfSections(in:) = settingsModel?.sections.count ?? 0` plus
         * `cellForRowAt`'s `guard let setting = settingsModel?.safeSetting(...)` — with no model the
         * source's table has no sections at all. WHICH model is held is the plan's model_main /
         * model_sub_unit / model_sub_standard_type / model_sub_gps / model_sub_contributors
         * variants: the source renders all five through this one table, so the branch is over the
         * model itself, and every row below comes from it.
         */
        if (this.settingsModel !== null) {
          Scroll(this.scroller) {
            Column() {
              /**
               * Source: `navigationItem.title = settingsModel?.title ?? LS["Settings"]` with a
               * LARGE title — DATA-BOUND, and it scrolls with the table (capture S0014: top 96,
               * left 16, 39pt tall), which is what hands the bar title above its turn.
               */
              Text(this.titleText())
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
              ForEach(this.sections(this.preferences), (section: SettingSection, sectionIndex: number) => {
                Column() {
                  /** Source: `tableView(_:titleForHeaderInSection:)` — UIKit uppercases it. */
                  Text(section.title.toUpperCase())
                    .fontSize(12)
                    .fontWeight(FontWeight.Medium)
                    .fontColor($r('app.color.secondary_color'))
                    .width('100%')
                    .padding({ left: LIST_MARGIN, right: LIST_MARGIN, top: 16, bottom: 6 })
                  /** The rule closing the header, drawn edge to edge as a grouped section is. */
                  Divider()
                    .strokeWidth(0.5)
                    .color($r('app.color.table_view_separator'))
                  ForEach(section.settings, (setting: Setting, rowIndex: number) => {
                    this.settingRow(setting, sectionIndex * ROW_STRIDE + rowIndex,
                      rowIndex === section.settings.length - 1)
                  },
                  /*
                   * Every mutable thing the row RENDERS is part of its key. A Setting's displayed
                   * value, selection mark, switch state and enablement are CACHED fields refreshed
                   * by `updateClosures()` (common/SettingsModelEngine.ts), not observable state, so
                   * an index-only key never changes and ForEach reuses the row WITHOUT re-running
                   * its item builder: after `refresh()` (source `refreshTableView()` ->
                   * `reloadData()`, which rebuilds every cell) each row still showed its old value
                   * and a tap looked like it flipped an unrelated row. Same defect and same fix as
                   * ClearSettingsViewControllerPage.
                   */
                  (setting: Setting, rowIndex: number) =>
                    `${sectionIndex}-${rowIndex}-${this.rowSignature(setting)}`)
                  /** Source: `tableView(_:titleForFooterInSection:)` — absent without a message. */
                  if (this.messageOf(section) !== '') {
                    Text(this.messageOf(section))
                      /* UIKit's grouped footer is the 13pt footnote style (18pt lines). 15 read too
                       * large next to the 16pt rows (owner review, TC-MANUAL-006). */
                      .fontSize(13)
                      .fontColor($r('app.color.secondary_color'))
                      .lineHeight(18)
                      .width('100%')
                      .padding({ left: LIST_MARGIN, right: LIST_MARGIN, top: 8, bottom: 4 })
                  }
                }
                .width('100%')
                .alignItems(HorizontalAlign.Start)
              },
              /*
               * The section key covers its ROWS as well as its own header and footer: the rows are
               * built inside this outer item builder, and ForEach does not re-run an item builder
               * whose key is unchanged — so a constant section key means the row list is never
               * re-diffed and the row keys below never get a chance to fire.
               */
              (section: SettingSection, sectionIndex: number) =>
                `${sectionIndex}-${this.sectionSignature(section)}`)
            }
            .width('100%')
          }
          .layoutWeight(1)
          .width('100%')
          .align(Alignment.Top)
          .scrollBar(BarState.Off)
          /** Source: the large-title collapse — the bar title appears once it has scrolled off. */
          .onDidScroll((xOffset: number, yOffset: number, state: ScrollState) => {
            this.titleCollapsed = this.scroller.currentOffset().yOffset > TITLE_COLLAPSE_OFFSET;
          })
          /**
           * Source: `keyboardWillShow` — `contentInset.bottom = keyboardHeight -
           * safeAreaInsets.bottom`, applied only while a row registered itself for keyboard
           * avoidance (`cellShouldBeVisisble`), and back to zero on keyboardWillHide.
           */
          .padding({ bottom: this.cellShouldBeVisisble() >= 0 ? this.keyboardInset : 0 })
        }
        /**
         * Source: `TabBarController.tabBar` — the bar every tab shares (components/TabBar).
         * `addDebugGestureRecognizer()` (10 taps on the bar, settings tab only) is the tally in
         * `registerBarTap()`: a bar-level TapGesture({ count: 10 }) never fires, because every
         * child answers its own tap with `.onClick` first.
         */
        TabBar({
          selectedTab: this.selectedTab,
          onTimeline: (): void => {
            this.openWorkoutList();
          },
          onAdd: (): void => {
            this.openNewWorkout();
          },
          onAddLongPress: (): void => {
            this.isTypeAlertShown = true;
            this.typeAlert.open();
          },
          onSettings: (): void => {
            this.selectedTab = TAB_SETTINGS;
            this.registerBarTap();
          }
        })
      }
      .width('100%')
      .height('100%')
      .backgroundColor($r('app.color.background_color'))
      /**
       * Source: `startLoading` (UIViewController.swift:48-53) — a MODAL UIAlertController: a
       * centred card over UIKit's dimmed backdrop, and the table under it takes no taps until
       * `endLoading` dismisses it. S6: the transient state is the alert, not a bare spinner.
       */
      if (this.isLoading) {
        Column() {
          Column() {
            LoadingView()
          }
          .padding({ left: 30, right: 30, top: 20, bottom: 20 })
          .borderRadius(14)
          .backgroundColor($r('app.color.foreground_color'))
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        /** UIKit's own alert dimming. */
        .backgroundColor('rgba(0,0,0,0.2)')
        /** The alert is modal: the table behind it must not receive the tap. */
        .hitTestBehavior(HitTestMode.Block)
      }
    }
    .id('SettingsViewControllerPage')
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background_color'))
  }

  /**
   * Source: `tableView(_:cellForRowAt:)` — `setting.tableViewCell`, one cell class per setting kind.
   * Each row's values come from the setting object, which reads svc_user_preferences / svc_config.
   */
  @Builder
  settingRow(setting: Setting, flatIndex: number, lastInSection: boolean) {
    if (setting.kind === 'switch') {
      SwitchSetting({
        lastInSection: lastInSection,
        title: this.titleOf(setting),
        isOn: this.switchValueOf(setting),
        isEnabled: this.isEnabledOf(setting),
        rowId: this.rowIdOf(setting),
        onToggle: (newValue: boolean): void => {
          this.setSwitch(setting, newValue);
        }
      })
    } else if (setting.kind === 'selection') {
      SelectionSetting({
        lastInSection: lastInSection,
        title: this.titleOf(setting),
        subTitle: this.subTitleOf(setting),
        isSelected: this.isSelectedOf(setting),
        onSelect: (): void => {
          this.select(setting);
        }
      })
    } else if (setting.kind === 'button') {
      ButtonSetting({
        lastInSection: lastInSection,
        title: this.titleOf(setting),
        destructive: this.destructiveOf(setting),
        isEnabled: this.isEnabledOf(setting),
        onSelect: (): void => {
          this.select(setting);
        }
      })
    } else if (setting.kind === 'textInput') {
      Column() {
        TextInputSetting({
          lastInSection: lastInSection,
          title: this.titleOf(setting),
          value: this.textValueOf(setting),
          placeholder: this.placeholderOf(setting),
          textBehind: this.textBehindOf(setting),
          keyboardType: this.keyboardTypeOf(setting),
          rowId: this.rowIdOf(setting),
          onValueChanged: (newValue: string): void => {
            this.setText(setting, newValue);
          },
          /** Source: `textFieldShouldBeginEditing` -> registerForKeyboardAvoidanceClosure(cell). */
          onBeginEditing: (): void => {
            this.keyboardVisibleRow = flatIndex;
          },
          /** Source: `textFieldShouldEndEditing` — the cell stops being the one to keep visible. */
          onEndEditing: (): void => {
            if (this.keyboardVisibleRow === flatIndex) {
              this.keyboardVisibleRow = -1;
            }
          }
        })
      }
      /* Lets the keyboard handler find this row (`cellShouldBeVisisble`). */
      .id(`settings_row_${flatIndex}`)
      .width('100%')
    } else if (setting.kind === 'titleSubTitle') {
      TitleSubTitleSetting({
        lastInSection: lastInSection,
        title: this.titleOf(setting),
        subTitle: this.subTitleOf(setting),
        doesRedirect: this.doesRedirectOf(setting),
        onSelect: (): void => {
          this.select(setting);
        }
      })
    } else {
      TitleSetting({
        lastInSection: lastInSection,
        title: this.titleOf(setting),
        doesRedirect: this.doesRedirectOf(setting),
        isEnabled: this.isEnabledOf(setting),
        onSelect: (): void => {
          this.select(setting);
        }
      })
    }
  }

  /** Everything a row RENDERS that `updateClosures()` can move — see the row key in build(). */
  private rowSignature(setting: Setting): string {
    return `${setting.kind}|${this.titleOf(setting)}|${this.subTitleOf(setting)}` +
      `|${this.isSelectedOf(setting)}|${this.switchValueOf(setting)}|${this.isEnabledOf(setting)}` +
      `|${this.textValueOf(setting)}`;
  }

  /** The section header, its footer message, and every row it draws. */
  private sectionSignature(section: SettingSection): string {
    return `${section.title}|${this.messageOf(section)}|` +
      section.settings.map((setting: Setting): string => this.rowSignature(setting)).join('|');
  }

  /** Source: `self.settingsModel?.title ?? LS["Settings"]` (viewDidLoad / refreshTableView). */
  private titleText(): string {
    const model: SettingsModel | null = this.settingsModel;
    return model !== null ? model.title : localizedString('Settings');
  }

  /**
   * Source: `numberOfSections(in:) = settingsModel?.sections.count ?? 0`.
   *
   * `revision` is `this.preferences`, and passing it IS the point: ArkUI V1 re-runs a render scope
   * only for the @State it observed being READ there, and a Setting's displayed value, selection
   * mark, switch state and enablement are CACHED fields that `Setting.refresh()` updates IN PLACE —
   * the `settingsModel` reference never changes. The counter was bumped by `refresh()` and read
   * nowhere in `build()`, so the source's `refreshTableView()` -> `reloadData()` re-rendered
   * nothing at all: a selection row's tap wrote the preference and left the checkmark on the old
   * row (device S0015: before/after trees byte-identical), and a unit picked in a sub-model never
   * reached the parent row that shows it.
   */
  private sections(revision: number): SettingSection[] {
    const model: SettingsModel | null = this.settingsModel;
    return model !== null && revision >= 0 ? model.sections : [];
  }

  /** Source: `public var cellShouldBeVisisble: UITableViewCell?` — -1 is its nil. */
  private cellShouldBeVisisble(): number {
    return this.keyboardVisibleRow;
  }

  /** Source: `tableView(_:titleForFooterInSection:)` — nil becomes no footer. */
  private messageOf(section: SettingSection): string {
    const message: string | null = section.message;
    return message !== null ? message : '';
  }

  private titleOf(setting: Setting): string {
    if (setting instanceof UnitPreferenceSetting) {
      return setting.title;
    }
    if (setting instanceof SwitchSettingModel) {
      return setting.title;
    }
    if (setting instanceof SelectionSettingModel) {
      return setting.title;
    }
    if (setting instanceof TextInputSettingModel) {
      return setting.title;
    }
    return setting instanceof TitleSettingModel ? setting.title : '';
  }

  private subTitleOf(setting: Setting): string {
    if (setting instanceof UnitPreferenceSetting) {
      return setting.subTitle;
    }
    if (setting instanceof SelectionSettingModel) {
      return setting.subTitle;
    }
    return setting instanceof TitleSubTitleSettingModel ? setting.subTitle : '';
  }

  private doesRedirectOf(setting: Setting): boolean {
    if (setting instanceof UnitPreferenceSetting) {
      return setting.model !== null;
    }
    return setting instanceof TitleSettingModel ? setting.doesRedirect : false;
  }

  private isEnabledOf(setting: Setting): boolean {
    if (setting instanceof SwitchSettingModel) {
      return setting.isEnabled;
    }
    return setting instanceof TitleSettingModel ? setting.isEnabled : true;
  }

  private isSelectedOf(setting: Setting): boolean {
    if (setting instanceof UnitPreferenceSetting) {
      return setting.isSelected;
    }
    return setting instanceof SelectionSettingModel ? setting.isSelected : false;
  }

  private switchValueOf(setting: Setting): boolean {
    return setting instanceof SwitchSettingModel ? setting.value : false;
  }

  private textValueOf(setting: Setting): string {
    return setting instanceof TextInputSettingModel ? setting.value : '';
  }

  private placeholderOf(setting: Setting): string {
    return setting instanceof TextInputSettingModel ? setting.placeholder : '';
  }

  private textBehindOf(setting: Setting): string {
    return setting instanceof TextInputSettingModel ? setting.textBehind : '';
  }

  private keyboardTypeOf(setting: Setting): string {
    return setting instanceof TextInputSettingModel ? setting.keyboardType : 'default';
  }

  private destructiveOf(setting: Setting): boolean {
    return setting instanceof ButtonSettingModel ? setting.destructive : false;
  }

  /**
   * Source: `cell.accessibilityIdentifier = "settings_itemroot"`, except the Show Map switch, whose
   * own slug the capture recorded.
   */
  private rowIdOf(setting: Setting): string {
    return this.titleOf(setting) === localizedString('Settings.MapVisibility')
      ? 'show_map' : 'settings_itemroot';
  }

  /** Source: `didSelectRowAt` -> `setting.runSelectAction(controller:)`, then the table reloads. */
  private select(setting: Setting): void {
    const subModel: SettingsModel | null = this.subModelOf(setting);
    if (subModel !== null) {
      this.openSubSettings(subModel);
      return;
    }
    setting.runSelectAction();
    this.refresh();
  }

  /** Source: `TitleSubTitleSetting.init(title:subTitle:_ settingsModel:)` — the pushed model. */
  private subModelOf(setting: Setting): SettingsModel | null {
    if (setting instanceof UnitPreferenceSetting) {
      return setting.model;
    }
    return setting instanceof TitleSubTitleSettingModel ? setting.model : null;
  }

  /** Source: `switchToggleAction(sender.isOn, self)`. */
  private setSwitch(setting: Setting, newValue: boolean): void {
    if (setting instanceof SwitchSettingModel) {
      setting.set(newValue);
      this.refresh();
    }
  }

  /** Source: `textFieldValueAction(text, setting)`. */
  private setText(setting: Setting, newValue: string): void {
    if (setting instanceof TextInputSettingModel) {
      setting.set(newValue);
      this.refresh();
    }
  }

  /** Source: `refreshTableView()` — recompute every closure, then reload. */
  private refresh(): void {
    const model: SettingsModel | null = this.settingsModel;
    if (model !== null) {
      model.refresh();
    }
    this.preferences = this.preferences + 1;
  }

  /** Taps counted so far in the current burst, and when the last one landed. */
  private barTapCount: number = 0;
  private barTapAt: number = 0;

  /**
   * The bar's tap tally, standing in for the tap-count gesture (see the tab bar's comment). A gap
   * longer than DEBUG_GESTURE_WINDOW starts the count over, so ordinary tab taps never accumulate.
   */
  private registerBarTap(): void {
    const now: number = Date.now();
    this.barTapCount = now - this.barTapAt > DEBUG_GESTURE_WINDOW ? 1 : this.barTapCount + 1;
    this.barTapAt = now;
    if (this.barTapCount >= DEBUG_GESTURE_TAPS) {
      this.barTapCount = 0;
      this.recognizeDebugGesture();
    }
  }

  /** Source: `recognizeDebugGesture(recognizer:)` — only while the settings tab is selected. */
  private recognizeDebugGesture(): void {
    if (this.selectedTab === TAB_SETTINGS) {
      this.openDebug();
    }
  }

  /** Source: a row's `requestNavigation` — the engine asks, this page routes. */
  onNavigationRequest(): void {
    const request: string = this.navigationRequest;
    if (request === '') {
      return;
    }
    this.navigationRequest = '';
    const separator: number = request.indexOf(':');
    const screenId: string = separator < 0 ? request : request.substring(0, separator);
    const param: string = separator < 0 ? '' : request.substring(separator + 1);
    if (screenId === 'screen_hk_import') {
      this.openHealthImport();
    } else if (screenId === 'screen_policy') {
      this.openPolicy(param === PolicyType.PRIVACY_POLICY.valueOf()
        ? PolicyType.PRIVACY_POLICY : PolicyType.TERMS_OF_SERVICE);
    } else if (screenId === 'screen_start') {
      this.restartSetup();
    }
  }

  /**
   * Source: a redirecting row (unit pickers, Standard Type, GPS Accuracy, Contribution) —
   * controller.show(SettingsViewController with a sub-model).
   */
  private openSubSettings(subModel: SettingsModel): void {
    AppStorage.setOrCreate<SettingsModel>(PENDING_SUB_MODEL_KEY, subModel);
    const params: Record<string, string> = {};
    params['backTitle'] = this.titleText();
    router.pushUrl({ url: 'pages/SettingsViewControllerPage', params: params }).catch((): void => {
      // The push never happened, so nothing will consume the model — a stale one would be
      // picked up by the next redirecting row.
      AppStorage.delete(PENDING_SUB_MODEL_KEY);
    });
  }

  /** Source: the support section — showDetailViewController(PolicyViewController with a type). */
  private openPolicy(type: PolicyType): void {
    router.pushUrl({ url: 'pages/PolicyViewControllerPage', params: { 'policyType': type } as Record<string, PolicyType> });
  }

  /** Source: 'Import from Apple Health' — controller.show(HKImportListController). */
  private openHealthImport(): void {
    router.pushUrl({ url: 'pages/HKImportListControllerPage' });
  }

  /** Source: `TabBarController.recognizeDebugGesture(recognizer:)` — 10 taps on the tab bar. */
  private openDebug(): void {
    router.pushUrl({ url: 'pages/DebugControllerPage' });
  }

  /**
   * Source: 'Delete all data' — after DataManager.deleteAll + UserPreferences.reset() the source
   * presents StartScreenViewController as the new root, so the stack is swapped, not pushed.
   */
  private restartSetup(): void {
    router.replaceUrl({ url: 'pages/StartScreenViewControllerPage' });
  }

  /** Source: the tab swap back to the timeline tab — a root swap, not a push. */
  private openWorkoutList(): void {
    this.selectedTab = TAB_TIMELINE;
    router.replaceUrl({ url: 'pages/WorkoutListViewControllerPage' });
  }

  /** Source: the centre add button — showDetailViewController(NewWorkoutViewController). */
  private openNewWorkout(): void {
    router.pushUrl({ url: 'pages/NewWorkoutViewControllerPage' });
  }
}
