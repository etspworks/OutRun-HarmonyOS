/*
 * S3 structure — port of `WorkoutListSortViewController`
 * (OutRun/Controllers/Workout/WorkoutListSortViewController.swift:37-195).
 *
 * presentation: popup (a `.popover` off the list's sort bar button), so it is an ArkUI overlay
 * mounted in its host page (WorkoutListViewControllerPage), not a routed page.
 *
 * The source builds a three-section `SettingsModel` in `viewDidLoad`:
 *   Filter  — TitleSubTitleSetting (the workout-type row, subtitle = the current type filter or
 *             LS["All"], doesRedirect, pushes a ClearSettingsViewController built inline) and
 *             filterSwitchSetting(for: .isRace)
 *   Sort by — orderSelectionSetting(for: .day(true), .day(false)) and the same for .distance.
 *             The `.duration` row is COMMENTED OUT in the source (activeDuration is transient), so
 *             exactly two rows are offered here.
 *   Order   — SwitchSetting LS["WorkoutList.Order.Descending"], bound to `isDescending`
 * plus `dismissButton` ("Done"), which the source adds to the NAVIGATION CONTROLLER's view pinned
 * left/right/bottom at 50pt — i.e. over the table, not inside it.
 *
 * Every control writes the HOST list's own state (`self.listController?.filterTypes` / `.sortType`),
 * which is why `filterTypes` and `sortType` are @Link to the host page's @State.
 */
import { router } from '@kit.ArkUI';
import { localizedString } from '../common/LocalizedStrings';
import { workoutTypeDescription } from '../model/WorkoutType';
import {
  WorkoutListFilterKind,
  WorkoutListFilterType
} from '../model/WorkoutListFilterType';
import { WorkoutListSortKind, WorkoutListSortType } from '../model/WorkoutListSortType';
import { SelectionSetting } from '../components/SelectionSetting';
import { SwitchSetting } from '../components/SwitchSetting';
import { TitleSubTitleSetting } from '../components/TitleSubTitleSetting';

@CustomDialog
export struct WorkoutListSortViewControllerPage {
  controller?: CustomDialogController;
  /** Source: `filterTypes { listController?.filterTypes ?? [] }` — the host list's filter array. */
  @Link filterTypes: WorkoutListFilterType[];
  /** Source: `sortType { listController?.sortType }`. */
  @Link sortType: WorkoutListSortType;
  /** Source: the host presenting this popover — the sheet clears it when it dismisses itself. */
  @Link isShown: boolean;
  /** Source: `var isDescending: Bool { listController?.sortType?.descending ?? true }`. */
  @State isDescending: boolean = true;

  aboutToAppear(): void {
    this.isDescending = this.sortType.descending;
  }

  build() {
    /** The Done button sits OVER the table (source: added to the navigation controller's view). */
    Stack({ alignContent: Alignment.Bottom }) {
      Scroll() {
        Column() {
          /** Source: `SettingSection(title: LS["WorkoutList.Filter"])`. */
          this.sectionHeader(localizedString('WorkoutList.Filter'))
          TitleSubTitleSetting({
            /** Source: `WorkoutListFilterType.type(.unknown).string` — LS["Workout.Type"]. */
            title: localizedString('Workout.Type'),
            /**
             * S4 `type_filter_active`: source
             * `(listController.filterTypes.first { ... })?.workoutType?.description ?? LS["All"]`
             * — with no filter at all there is nothing to look through, so the row reads "All".
             */
            subTitle: this.filterTypes.length > 0
              ? this.typeFilterSubTitle() : localizedString('All'),
            doesRedirect: true,
            /**
             * The contract's `settings_itemroot` control (expect: navigate:screen_clear_settings)
             * — it is the ONLY row in this sheet keeping that id, so the matcher can resolve it.
             */
            rowId: 'settings_itemroot',
            onSelect: (): void => {
              this.openTypeFilter();
            }
          })
          SwitchSetting({
            title: WorkoutListFilterType.isRace().title(),
            isOn: this.isRaceFilterOn(),
            rowId: 'is_race',
            lastInSection: true,
            onToggle: (newValue: boolean): void => {
              this.toggleIsRaceFilter(newValue);
            }
          })

          /** Source: `SettingSection(title: LS["WorkoutList.SortBy"])`. */
          this.sectionHeader(localizedString('WorkoutList.SortBy'))
          SelectionSetting({
            title: new WorkoutListSortType(WorkoutListSortKind.DAY, true).title(),
            /**
             * Source: `isSelected: { self.sortType == descendingType || self.sortType ==
             * ascendingType }` — the checkmark ignores the direction. S4
             * `duration_sort_disabled`: the source's duration rows are commented out
             * (activeDuration is transient), so a DURATION sort checkmarks no row here.
             */
            isSelected: this.sortType.kind === WorkoutListSortKind.DURATION
              ? false : this.sortType.kind === WorkoutListSortKind.DAY,
            /**
             * Rule 12: `settings_itemroot` is the SHARED id of N instances of ONE row template.
             * The source cell prototype carries it on every row of this table, but these three
             * rows are heterogeneous (the Type row pushes ClearSettingsViewController, these two
             * select a sort field), so sharing it made the matcher resolve the contract's
             * `settings_itemroot` tap to whichever row it scored first and fire the WRONG
             * handler. Each row therefore carries its own source label as its slug.
             */
            rowId: 'date',
            onSelect: (): void => {
              this.selectSortKind(WorkoutListSortKind.DAY);
            }
          })
          SelectionSetting({
            title: new WorkoutListSortType(WorkoutListSortKind.DISTANCE, true).title(),
            /**
             * Source: `isSelected: { self.sortType == descendingType || self.sortType ==
             * ascendingType }` — the checkmark ignores the direction. S4
             * `duration_sort_disabled`: the source's duration rows are commented out
             * (activeDuration is transient), so a DURATION sort checkmarks no row here.
             */
            isSelected: this.sortType.kind === WorkoutListSortKind.DURATION
              ? false : this.sortType.kind === WorkoutListSortKind.DISTANCE,
            /** Its own slug, for the reason on the Date row above. */
            rowId: 'distance',
            lastInSection: true,
            onSelect: (): void => {
              this.selectSortKind(WorkoutListSortKind.DISTANCE);
            }
          })

          /** Source: `SettingSection(title: LS["WorkoutList.Order"])`. */
          this.sectionHeader(localizedString('WorkoutList.Order'))
          SwitchSetting({
            title: localizedString('WorkoutList.Order.Descending'),
            isOn: this.isDescending,
            rowId: 'descending',
            lastInSection: true,
            onToggle: (newValue: boolean): void => {
              this.toggleDescending(newValue);
            }
          })
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
        /** Source: `tableView.contentInset` bottom 50 — the Done button's own height. */
        .padding({ bottom: 50 })
      }
      .width('100%')
      .align(Alignment.Top)

      /**
       * Source: `dismissButton` — left/right/bottom to the superview, 50pt tall. S5: the capture
       * (S0044) shows it as flat accent-coloured text on the popover's own material, NOT a filled
       * button, so the ArkUI button background is cleared and the label takes the baseline's
       * button token (16fp bold) in .accentColor.
       */
      Column() {
        /** S6: the capture shows the grouped table's hairline between the last row and Done. */
        Divider()
          .strokeWidth(0.5)
          .color($r('app.color.table_view_separator'))
        Button(localizedString('Done'))
          .id('workout_sort_done')
          .type(ButtonType.Normal)
          .width('100%')
          .height(50)
          .backgroundColor($r('app.color.foreground_color'))
          .fontSize(16)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.accent_color'))
          .onClick(() => {
            this.close();
          })
      }
      .width('100%')
      .backgroundColor($r('app.color.foreground_color'))
    }
    /**
     * S5 geometry, measured off the capture (S0044 `base.ui.json`): the popover card is exactly
     * 250x307pt — the host pins it at `[121,79]`. Its material renders as the settings table's
     * grouped background (.foreground_color), with the rows painting .background_color over it,
     * which is what makes the FILTER / SORT BY / ORDER header bands read grey and the rows white.
     */
    .width(250)
    /*
     * The card is 250pt wide as captured. Its HEIGHT is the content's, not the capture's 307: the
     * source popover clips at 307 and SCROLLS the last rows under the floating Done bar (capture
     * base.ui.json puts the Descending cell at [121,386][371,429], i.e. below the popover's own
     * [121,79][371,386]). UIKit still delivers an accessibility tap to a clipped cell; ArkUI
     * hit-tests by coordinate and the topmost Stack layer wins, so the Descending row sat entirely
     * under `workout_sort_done` and every tap on it fired Done instead (measured on device, S0044
     * action-3: 69->32 nodes, identical to the Done probe). Sizing to the content — 3 headers x40 +
     * 5 rows x44 + the 50 Done inset — shows every row the source's table holds and leaves the Done
     * bar over the empty inset, so no control is occluded.
     */
    .height(390)
    .backgroundColor($r('app.color.foreground_color'))
    .borderRadius(12)
    .clip(true)
    /* Page-identity marker: this overlay is mounted INSIDE its host's window, so the replay can
     * only prove it is showing by its own route name on its root. */
    .id('WorkoutListSortViewController')
  }

  /** Source: `SettingSection`'s header in the settings table. */
  @Builder
  sectionHeader(title: string) {
    Text(title.toUpperCase())
      /** S5: the grouped table's header caption — 12fp medium .secondaryColor, in the 40pt band. */
      .fontSize(12)
      .fontWeight(FontWeight.Medium)
      .fontColor($r('app.color.secondary_color'))
      .width('100%')
      .height(40)
      .padding({ left: 16, right: 16, top: 18, bottom: 6 })
  }

  /**
   * Source: the TitleSubTitleSetting's `subTitle` closure — the first `.type(...)` filter's
   * description, else LS["All"].
   */
  private typeFilterSubTitle(): string {
    for (const filter of this.filterTypes) {
      if (filter.kind === WorkoutListFilterKind.TYPE && filter.workoutType !== null) {
        return workoutTypeDescription(filter.workoutType);
      }
    }
    return localizedString('All');
  }

  /** Source: `isSwitchOn: { self.filterTypes.contains(type) }`. */
  private isRaceFilterOn(): boolean {
    for (const filter of this.filterTypes) {
      if (filter.kind === WorkoutListFilterKind.IS_RACE) {
        return true;
      }
    }
    return false;
  }

  /**
   * Source: `filterSwitchSetting`'s switchToggleAction — append the filter, or remove every
   * matching entry. Reassigned rather than mutated so the host's @State observes the change.
   */
  private toggleIsRaceFilter(newValue: boolean): void {
    const next: WorkoutListFilterType[] = [];
    for (const filter of this.filterTypes) {
      if (filter.kind !== WorkoutListFilterKind.IS_RACE) {
        next.push(filter);
      }
    }
    if (newValue) {
      next.push(WorkoutListFilterType.isRace());
    }
    this.filterTypes = next;
  }

  /**
   * Source: `orderSelectionSetting`'s selectAction —
   * `listController?.sortType = self.isDescending ? descendingType : ascendingType`, i.e. the kind
   * changes and the current direction is kept.
   */
  private selectSortKind(kind: WorkoutListSortKind): void {
    this.sortType = new WorkoutListSortType(kind, this.sortType.descending);
  }

  /** Source: `self.listController?.sortType = self.sortType?.oppositeOrderedType ?? .day(newValue)`. */
  private toggleDescending(newValue: boolean): void {
    this.isDescending = newValue;
    this.sortType = this.sortType.descending === newValue
      ? this.sortType : this.sortType.oppositeOrderedType();
  }

  /**
   * Source: the workout-type row's selectAction — `controller.show(clearController, sender:)`, the
   * only route to ClearSettingsViewController.
   */
  private openTypeFilter(): void {
    /*
     * The source pushes the clear controller INSIDE the popover's own navigation controller, so
     * the sort list stops showing while the type list is up, and popping returns to it. This port
     * pushes a routed page, so the sheet has to come down with it — an ArkUI dialog left open over
     * the pushed page also swallows the system Back press (autoCancel dismisses the dialog and the
     * router never pops: measured on device, S0044 backMarker=mismatch with the page still on
     * ClearSettingsViewControllerPage). `ClearSettingsViewControllerPage` re-arms the host's
     * overlay key as it pops, which is what brings this sheet back, as the source does.
     */
    this.close();
    router.pushUrl({ url: 'pages/ClearSettingsViewControllerPage' });
  }

  /** Source: `close()` — dismiss(animated: true) from the Done button. */
  private close(): void {
    this.isShown = false;
    if (this.controller !== undefined) {
      this.controller.close();
    }
  }
}
