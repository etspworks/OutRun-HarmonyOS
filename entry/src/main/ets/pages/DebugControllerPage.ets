/*
 * S3/S4 — port of `DebugController`
 * (OutRun/Controllers/Settings/DebugController.swift:26-115) over its superclass
 * `SettingsViewController` (the grouped settings table).
 *
 * Source tree: a navigation bar titled "Debug" (hardcoded English in the source, NOT localized)
 * with a `.close` right bar button, over three sections:
 *   Database — Database Storage Size, then the five row counts
 *              (`DataQueryManager.fetchCount(of:)` for Workout / WorkoutRouteDataSample /
 *              WorkoutEvent / WorkoutHeartRateDataSample / Event)
 *   Cache    — Cache Storage Size plus the "Clear Cache" ButtonSetting, which is enabled exactly
 *              while `![0, -1, nil].contains(CustomImageCache.mapImageCache.diskSize)`
 *   Config   — isDebug / isRunOnSimulator / hasMobileProvision / hasSanboxReceipt
 *              (the source's own misspelling of "Sandbox" is kept — it is the visible label)
 *
 * S4: the rows are a real `SettingsModel` of `TitleSubTitleSetting` / `ButtonSetting` CLOSURES, as
 * the source builds in `settingsModel`, so `updateSettingsModel()` is a `model.refresh()` and every
 * subtitle is a LIVE read of the store, the cache and the build config — never a literal from the
 * capture: `CustomByteFormatting.string` over `DataManager.diskSize` /
 * `CustomImageCache.mapImageCache.diskSize`, the five `fetchCount` answers, and `Config`'s flags.
 */
import { drawing, common2D } from '@kit.ArkGraphics2D';
import { router } from '@kit.ArkUI';
import {
  DataManager,
  TABLE_EVENT,
  TABLE_HEART_RATE_SAMPLE,
  TABLE_ROUTE_SAMPLE,
  TABLE_WORKOUT,
  TABLE_WORKOUT_EVENT
} from '../common/DataManager';
import { DataQueryManager } from '../common/DataQueryManager';
import { CustomImageCache } from '../common/CustomImageCache';
import { CustomByteFormatting } from '../common/Formatting';
import { Config } from '../common/Config';
import { showInfoAlert } from '../common/AlertDialogs';
import { SettingsModel } from '../model/SettingsModel';
import { Setting, SettingSection } from '../model/SettingSection';
import {
  ButtonSetting as ButtonSettingModel,
  TitleSubTitleSetting as TitleSubTitleSettingModel
} from '../common/SettingsModelEngine';
import { ButtonSetting } from '../components/ButtonSetting';
import { TitleSubTitleSetting } from '../components/TitleSubTitleSetting';

/** Source: `DataManager.diskSize ?? -1` / `CustomImageCache...diskSize ?? -1`. */
const UNKNOWN_SIZE: number = -1;
/** Source: the settings table's 16pt layout margin (capture S0021: every label starts at x=16). */
const LIST_MARGIN: number = 16;

/**
 * The bundled close glyph is a BLACK template PNG and ArkUI's `fillColor` is SVG-only, so the
 * window's `.accentColor` tint is a SRC_IN blend filter over its alpha.
 */
const ACCENT: common2D.Color = { alpha: 255, red: 255, green: 146, blue: 0 };
const ACCENT_TEMPLATE_TINT: drawing.ColorFilter =
  drawing.ColorFilter.createBlendModeColorFilter(ACCENT, drawing.BlendMode.SRC_IN);

/** Source: the five `DataQueryManager.fetchCount(of:)` answers, in the source's row order. */
class DebugRowCounts {
  readonly workouts: number;
  readonly routeSamples: number;
  readonly workoutEvents: number;
  readonly heartRateSamples: number;
  readonly events: number;

  constructor(workouts: number, routeSamples: number, workoutEvents: number,
    heartRateSamples: number, events: number) {
    this.workouts = workouts;
    this.routeSamples = routeSamples;
    this.workoutEvents = workoutEvents;
    this.heartRateSamples = heartRateSamples;
    this.events = events;
  }
}

@Entry
@Component
struct DebugControllerPage {
  /** Source: `settingsModel = SettingsModel(title: "Debug", sections: [...])`. */
  @State settingsModel: SettingsModel | null = null;
  /** Source: `CustomByteFormatting.string(for: DataManager.diskSize ?? -1)`. */
  @State dbSize: number = UNKNOWN_SIZE;
  /** Source: `CustomByteFormatting.string(for: CustomImageCache.mapImageCache.diskSize ?? -1)`. */
  @State cacheSize: number = UNKNOWN_SIZE;
  /** Source: `DataQueryManager.fetchCount(of:)` per entity. */
  @State rowCounts: DebugRowCounts = new DebugRowCounts(0, 0, 0, 0, 0);

  /** Source: `viewWillAppear` -> `updateSettingsModel()` — every subtitle is re-read on entry. */
  aboutToAppear(): void {
    this.settingsModel = this.buildModel();
    this.reload();
  }

  build() {
    Column() {
      /**
       * S5, measured off the capture (S0021 `base.ui.json`): this screen is presented as a sheet
       * whose bar carries ONLY the close button at `[327,63][382,107]` — no small nav title — and
       * the hardcoded "Debug" title renders BELOW it as the settings table's large title at
       * `[16,118][117,157]`: 32pt heavy small-caps in .accentColor, as `SettingsViewController`
       * draws every one of its titles.
       */
      Row() {
        Blank()
        /** Source: `closeButton`, 36x36 tinted by window.tintColor = .accentColor. */
        Image($r('app.media.close'))
          .id('debug_close')
          .width(36)
          .height(36)
          .objectFit(ImageFit.Contain)
          .colorFilter(ACCENT_TEMPLATE_TINT)
          .onClick(() => {
            this.close();
          })
      }
      .width('100%')
      .alignItems(VerticalAlign.Center)
      .padding({ left: LIST_MARGIN, right: 8, top: 6, bottom: 4 })
      Scroll() {
        Column() {
          Text('Debug')
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
          ForEach(this.sections(), (section: SettingSection) => {
            Column() {
              /** Source: `tableView(_:titleForHeaderInSection:)` — UIKit uppercases it. */
              this.sectionHeader(section.title)
              ForEach(section.settings, (setting: Setting, rowIndex: number) => {
                this.settingRow(setting, rowIndex === section.settings.length - 1)
              },
              /*
               * Every mutable thing a row RENDERS is part of its key. A Setting's title, subtitle and
               * enablement are CACHED fields refreshed by `updateClosures()`
               * (common/SettingsModelEngine.ts), not observable state, so an index-only key never
               * changes and ForEach reuses the row WITHOUT re-running its item builder: every row
               * kept the values built in `aboutToAppear` before `reload()` finished — the "-1 bytes"
               * size sentinels and five zero counts — and a Clear Cache tap looked like a no-op
               * because the cleared size never re-rendered. Same defect and fix as
               * ClearSettingsViewControllerPage / SettingsViewControllerPage.
               */
              (setting: Setting, rowIndex: number) => `${rowIndex}-${this.rowSignature(setting)}`)
            }
            .width('100%')
            .alignItems(HorizontalAlign.Start)
          },
          /*
           * The section key carries every row it draws: the row ForEach lives inside this outer item
           * builder, and ForEach does not re-run an item builder whose key is unchanged — so a
           * title-only section key means the row list is never re-diffed and the row keys above
           * never get a chance to fire.
           */
          (section: SettingSection, sectionIndex: number) =>
            `${sectionIndex}-${this.sectionSignature(section)}`)
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
      }
      .layoutWeight(1)
      .width('100%')
      .align(Alignment.Top)
    }
    .id('DebugControllerPage')
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background_color'))
  }

  /** Source: `tableView(_:cellForRowAt:)` — the cell is chosen by the setting's kind. */
  @Builder
  settingRow(setting: Setting, lastInSection: boolean) {
    if (setting instanceof ButtonSettingModel) {
      ButtonSetting({
        title: setting.title,
        isEnabled: setting.isEnabled,
        lastInSection: lastInSection,
        onSelect: (): void => {
          setting.runSelectAction();
        }
      })
    } else if (setting instanceof TitleSubTitleSettingModel) {
      TitleSubTitleSetting({
        title: setting.title,
        subTitle: setting.subTitle,
        lastInSection: lastInSection
      })
    }
  }

  /** Source: `tableView(_:titleForHeaderInSection:)` — UIKit uppercases a grouped header. */
  @Builder
  sectionHeader(title: string) {
    Text(title.toUpperCase())
      /** S5: the grouped table's 12fp medium .secondaryColor caption on the 16pt layout margin. */
      .fontSize(12)
      .fontWeight(FontWeight.Medium)
      .fontColor($r('app.color.secondary_color'))
      .width('100%')
      .padding({ left: LIST_MARGIN, right: LIST_MARGIN, top: 16, bottom: 6 })
    /** The rule closing the header, drawn edge to edge as a grouped section is. */
    Divider()
      .strokeWidth(0.5)
      .color($r('app.color.table_view_separator'))
  }

  /** Everything a row renders; see the ForEach key comment in `build()`. */
  private rowSignature(setting: Setting): string {
    if (setting instanceof ButtonSettingModel) {
      return `${setting.kind}|${setting.title}|${setting.isEnabled}`;
    } else if (setting instanceof TitleSubTitleSettingModel) {
      return `${setting.kind}|${setting.title}|${setting.subTitle}`;
    }
    return setting.kind;
  }

  /** The section header plus every row it draws. */
  private sectionSignature(section: SettingSection): string {
    return `${section.title}|` +
      section.settings.map((setting: Setting): string => this.rowSignature(setting)).join('|');
  }

  private sections(): SettingSection[] {
    const model: SettingsModel | null = this.settingsModel;
    return model !== null ? model.sections : [];
  }

  /** Source: `settingsModel` — the three sections, built once, every value a closure. */
  private buildModel(): SettingsModel {
    const database: Setting[] = [
      new TitleSubTitleSettingModel((): string => 'Database Storage Size',
        (): string => CustomByteFormatting.string(this.dbSize)),
      new TitleSubTitleSettingModel((): string => 'Workouts',
        (): string => `${this.rowCounts.workouts}`),
      new TitleSubTitleSettingModel((): string => 'RouteDataSamples',
        (): string => `${this.rowCounts.routeSamples}`),
      new TitleSubTitleSettingModel((): string => 'WorkoutEvents',
        (): string => `${this.rowCounts.workoutEvents}`),
      new TitleSubTitleSettingModel((): string => 'HeartRateDataSamples',
        (): string => `${this.rowCounts.heartRateSamples}`),
      new TitleSubTitleSettingModel((): string => 'Events',
        (): string => `${this.rowCounts.events}`)
    ];
    const cache: Setting[] = [
      new TitleSubTitleSettingModel((): string => 'Cache Storage Size',
        (): string => CustomByteFormatting.string(this.cacheSize)),
      /** Source: `ButtonSetting(title: { "Clear Cache" }, isEnabled: { ... }, selectAction:)`. */
      new ButtonSettingModel((): string => 'Clear Cache', (): void => {
        this.clearCache();
      }, false, (): boolean => this.isCacheClearable())
    ];
    /** Source: the Config section — four read-only build flags. */
    const config: Setting[] = [
      new TitleSubTitleSettingModel((): string => 'isDebug',
        (): string => `${Config.isDebug}`),
      new TitleSubTitleSettingModel((): string => 'isRunOnSimulator',
        (): string => `${Config.isRunOnSimulator}`),
      new TitleSubTitleSettingModel((): string => 'hasMobileProvision',
        (): string => `${Config.hasMobileProvision}`),
      /** Source spelling: `hasSanboxReceipt`. */
      new TitleSubTitleSettingModel((): string => 'hasSanboxReceipt',
        (): string => `${Config.hasSanboxReceipt}`)
    ];
    return new SettingsModel([
      new SettingSection('Database', database),
      new SettingSection('Cache', cache),
      new SettingSection('Config', config)
    ], 'Debug');
  }

  /**
   * Source: `updateSettingsModel()` — re-read the store/cache, then refresh every closure.
   *
   * The store is awaited first: this page is reachable by a COLD deep link, whose `aboutToAppear`
   * runs before `DataManager.setup()` has opened the store, and every value here is read exactly
   * once. Without the wait the store size answered null and the screen kept the source's
   * "-1 bytes" sentinel and five zero counts for the rest of its life. `refreshModel()` runs in
   * `finally` so one failing read cannot cost the screen every other value it did get.
   */
  private async reload(): Promise<void> {
    try {
      await DataManager.ready();
      const dbSize: number | null = DataManager.diskSize;
      this.dbSize = dbSize !== null ? dbSize : UNKNOWN_SIZE;
      this.cacheSize = this.currentCacheSize();
      this.rowCounts = new DebugRowCounts(
        await DataQueryManager.fetchCount(TABLE_WORKOUT),
        await DataQueryManager.fetchCount(TABLE_ROUTE_SAMPLE),
        await DataQueryManager.fetchCount(TABLE_WORKOUT_EVENT),
        await DataQueryManager.fetchCount(TABLE_HEART_RATE_SAMPLE),
        await DataQueryManager.fetchCount(TABLE_EVENT));
    } finally {
      this.refreshModel();
    }
  }

  /**
   * Source: `settingsModel.refresh()` — recompute every row's title/subtitle/enabled closure.
   *
   * `SettingsModel` is a plain class, so `@State` compares it by REFERENCE: refreshing the rows
   * in place and re-assigning the SAME object published nothing, and every row kept the string it
   * was first built with — the "-1 bytes" size sentinels and five zero counts the device showed,
   * with the live values sitting in a model the screen never re-read. Rebuilding evaluates every
   * provider against the current state AND hands `@State` a new reference.
   */
  private refreshModel(): void {
    if (this.settingsModel !== null) {
      this.settingsModel = this.buildModel();
    }
  }

  private currentCacheSize(): number {
    const diskSize: number | null = CustomImageCache.mapImageCache.diskSize;
    return diskSize !== null ? diskSize : UNKNOWN_SIZE;
  }

  /**
   * Source: `isEnabled: { ![0, -1, nil].contains(CustomImageCache.mapImageCache.diskSize) }` —
   * conditional variant `cache_non_empty`: the Clear Cache row is inert on an empty cache.
   */
  private isCacheClearable(): boolean {
    const diskSize: number = this.cacheSize;
    if (diskSize === 0 || diskSize === UNKNOWN_SIZE) {
      return false;
    }
    return true;
  }

  /**
   * Source: `CustomImageCache.mapImageCache.clear { success in setting.refresh();
   * displayInfoAlert(withMessage: success ? "Successfully cleared cache." : "Failed to clear
   * cache.") }`.
   */
  private clearCache(): void {
    const success: boolean = CustomImageCache.mapImageCache.clear();
    this.cacheSize = this.currentCacheSize();
    this.refreshModel();
    showInfoAlert(success ? 'Successfully cleared cache.' : 'Failed to clear cache.');
  }

  /**
   * Source: `close()` — `dismiss(animated: true)`, which always returns to the presenting
   * Settings tab (`TabBarController.swift:169` presents this over the selected Settings tab).
   * `router.back()` alone only honours that when Settings pushed this page; launched straight
   * into this page there is nothing under it and `back()` closes the APP instead of returning.
   */
  private close(): void {
    if (Number.parseInt(router.getLength(), 10) > 1) {
      router.back();
    } else {
      router.replaceUrl({ url: 'pages/SettingsViewControllerPage' });
    }
  }
}
