/*
 * S3 structure — port of `ClearSettingsViewController`
 * (OutRun/Controllers/Settings/ClearSettingsViewController.swift): the settings table with a CLEAR
 * background, no section footers, a 40pt section header and no scroll indicator. The source hides the
 * navigation bar on this stack, so it renders with NO title bar and NO back button. The sort sheet
 * comes down while this page is up (an ArkUI dialog left open over a pushed page also eats the
 * system Back press) and is re-armed on the pop, so Back returns to it as the source's push does.
 *
 * Its one section is the model `WorkoutListSortViewController` builds INLINE in the workout-type
 * row's selectAction (WorkoutListSortViewController.swift:115-130): a 'Type' section of six
 * SelectionSettings — All, Running, Walking, Hiking, Cycling, Skating, in that literal order —
 * whose checkmark is bound to the workout list's current type filter ('All' checked exactly when no
 * type filter is set) and whose tap strips every other type filter before applying its own.
 *
 * The filter itself lives on the workout list. A routed page cannot @Link the host's @State, so the
 * selection is published through the shared AppStorage key below; the workout list still has to READ
 * that key for the filter to reach its query, and that file is not this screen's to edit.
 *
 * S5 style — this screen was never captured, so it is styled from the SOURCE and from the host
 * sort sheet it is pushed inside (same superclass, same look), never from a sibling's screenshot:
 *   ClearSettingsViewController.swift:26-31  tableView.backgroundColor = .clear over the popover,
 *                                           sectionFooterHeight 0, sectionHeaderHeight 40, no
 *                                           scroll indicator
 *   SettingsViewController.swift:39-47       everything else is the plain settings table — rows on
 *                                           .backgroundColor with .tableViewSeparator hairlines,
 *                                           which is what `SelectionSetting` already draws
 *   the popover's own surface is .backgroundColor, so the CLEAR table renders as that colour; the
 *   page paints it directly rather than being transparent over a routed page's window.
 * The section header is the settings table's own: uppercased 12fp .secondaryColor at the 16pt
 * layout margin, in the 40pt band the source sets.
 */
import { router } from '@kit.ArkUI';
import { WorkoutType, workoutTypeDescription } from '../model/WorkoutType';
import { SettingsModel } from '../model/SettingsModel';
import { Setting, SettingSection } from '../model/SettingSection';
import { SelectionSetting as SelectionSettingModel } from '../common/SettingsModelEngine';
import { localizedString } from '../common/LocalizedStrings';
import { SelectionSetting } from '../components/SelectionSetting';

/**
 * The workout list's type filter, as the raw `Workout.WorkoutType` value; NO_TYPE_FILTER is the
 * source's 'All' (no `.type(...)` entry in `filterTypes` at all).
 */
const NO_TYPE_FILTER: number = -1;

/**
 * The host workout list's overlay key, and the name it mounts the sort popover under. The source
 * pushes this controller INSIDE the sort popover's navigation controller, so popping it puts the
 * sort list back on screen; here the popover is a `@CustomDialog` on the host page that had to come
 * down for this page to be pushed, so the pop has to re-arm it.
 */
const DEEP_LINK_OVERLAY_KEY: string = 'deepLinkOverlay';
const SORT_OVERLAY: string = 'WorkoutListSortViewController';

/** Source: the six rows `typeFilterSelectionSetting(for:)` is called with, in source order. */
const FILTER_TYPES: WorkoutType[] = [WorkoutType.RUNNING, WorkoutType.WALKING, WorkoutType.HIKING,
  WorkoutType.CYCLING, WorkoutType.SKATING];

@Entry
@Component
struct ClearSettingsViewControllerPage {
  /**
   * Source: `self.listController?.filterTypes` — the workout list's filter array, which these six
   * rows write. Shared through AppStorage because the source's parent/child relationship is a
   * pushed controller here.
   */
  @StorageLink('workoutListTypeFilter') filterTypes: number = NO_TYPE_FILTER;
  /** Source: `clearController.settingsModel = SettingsModel(...)` built by the sort sheet's row. */
  @State settingsModel: SettingsModel | null = null;

  /**
   * True when the sort sheet pushed this page, false when the pipeline deep-links it as its own
   * cold launch (then it is the router root and there is no popover to restore).
   */
  private pushedFromSortSheet: boolean = false;

  aboutToAppear(): void {
    this.settingsModel = this.buildModel();
    this.pushedFromSortSheet = Number.parseInt(router.getLength(), 10) > 1;
  }

  /**
   * Source: popping the clear controller returns to the sort list inside the same popover. Re-arm
   * the host's overlay key so its `onPageShow` re-opens the sheet as this page pops — without it
   * Back landed on the bare workout list (measured on device, S0044 backMarker=mismatch).
   */
  aboutToDisappear(): void {
    if (this.pushedFromSortSheet) {
      AppStorage.setOrCreate<string>(DEEP_LINK_OVERLAY_KEY, SORT_OVERLAY);
    }
  }

  build() {
    Column() {
      if (this.settingsModel !== null) {
        ForEach(this.sections(), (section: SettingSection) => {
          Column() {
            /** Source: `SettingSection(title: LS["Workout.Type"])` — the one section header. */
            Text(section.title.toUpperCase())
              .fontSize(12)
              .fontWeight(FontWeight.Medium)
              .fontColor($r('app.color.secondary_color'))
              .width('100%')
              /* Source: `tableView.sectionHeaderHeight = 40`, text on the 16pt layout margin. */
              .height(40)
              .padding({ left: 16, right: 16, top: 18, bottom: 6 })
            Divider()
              .strokeWidth(0.5)
              .color($r('app.color.table_view_separator'))
            ForEach(section.settings, (setting: Setting, rowIndex: number) => {
              SelectionSetting({
                title: this.titleOf(setting),
                isSelected: this.isSelectedOf(setting),
                /** The grouped table closes its section with an edge-to-edge rule. */
                lastInSection: rowIndex === section.settings.length - 1,
                onSelect: (): void => {
                  this.select(setting);
                }
              })
            },
            /*
             * The checkmark is part of the KEY. `SelectionSetting.isSelected` is a cached field
             * (SettingsModelEngine.ts: refreshed by `updateClosures()`), not observable state, so a
             * key of index+title never changes and ForEach reuses the row without re-running its
             * item builder — the tap moved the filter and the checkmark stayed on 'All' (measured on
             * device). Keying on the selection re-creates exactly the two rows whose mark moves.
             */
            (setting: Setting, rowIndex: number) =>
              `${rowIndex}-${this.titleOf(setting)}-${this.isSelectedOf(setting)}`)
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
        },
        /*
         * The selected filter is part of THIS key too, not only the row key below. The rows are
         * built inside this outer item builder, and ForEach does not re-run an item builder whose
         * key is unchanged — so with a constant section key the row list was never re-diffed and the
         * checkmark stayed on 'All' after a tap (measured on device). The section title is constant
         * here, so the filter is the only thing that can move it.
         */
        (section: SettingSection, sectionIndex: number) =>
          `${sectionIndex}-${section.title}-${this.filterTypes}`)
      }
    }
    .id('ClearSettingsViewControllerPage')
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background_color'))
  }

  private sections(): SettingSection[] {
    const model: SettingsModel | null = this.settingsModel;
    return model !== null ? model.sections : [];
  }

  /** Source: the inline SettingsModel — 'All' first, then one row per workout type. */
  private buildModel(): SettingsModel {
    const settings: Setting[] = [this.typeFilterSelectionSetting(null)];
    for (const type of FILTER_TYPES) {
      settings.push(this.typeFilterSelectionSetting(type));
    }
    return new SettingsModel(
      [new SettingSection(localizedString('Workout.Type'), settings)], '');
  }

  /**
   * Source: `typeFilterSelectionSetting(for workoutType:)` — the title is the type's description or
   * LS["All"], the checkmark reads the list's filters, and the action removes every type filter
   * before appending this one (none, for 'All').
   */
  private typeFilterSelectionSetting(type: WorkoutType | null): Setting {
    return new SelectionSettingModel(
      (): string => type !== null ? workoutTypeDescription(type) : localizedString('All'),
      (): boolean => type !== null
        ? this.filterTypes === type.valueOf() : this.filterTypes === NO_TYPE_FILTER,
      (): void => {
        this.filterTypes = type !== null ? type.valueOf() : NO_TYPE_FILTER;
      });
  }

  private titleOf(setting: Setting): string {
    return setting instanceof SelectionSettingModel ? setting.title : '';
  }

  private isSelectedOf(setting: Setting): boolean {
    return setting instanceof SelectionSettingModel ? setting.isSelected : false;
  }

  /** Source: `didSelectRowAt` -> `setting.runSelectAction(controller:)`, then `setting.refresh()`. */
  private select(setting: Setting): void {
    setting.runSelectAction();
    const model: SettingsModel | null = this.settingsModel;
    if (model !== null) {
      model.refresh();
    }
  }
}
