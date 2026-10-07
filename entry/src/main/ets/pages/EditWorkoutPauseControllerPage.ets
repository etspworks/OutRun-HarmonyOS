/*
 * S3 structure — port of `EditWorkoutPauseController`
 * (OutRun/Controllers/Workout/EditWorkoutPauseController.swift:24-49).
 *
 * The source class is marked "WARNING: This class is not functional yet": it is a
 * UITableViewController that overrides NEITHER `numberOfRowsInSection` NOR `cellForRowAt`, so it
 * renders an EMPTY table. Its only push site (the editor's "Edit Pauses" row) is commented out, so
 * the plan lists that edge in navExceptions (source-dead-code) and it is deliberately not wired.
 * Nothing may invent pause rows here — the source has none to port.
 *
 * What the source DOES declare is the data the unfinished screen was to edit: `events` reading
 * `editController?.pauseResumeEvents` (writing it back sorted by startDate) and `startDate` falling
 * back to the epoch. The table is BOUND to that array — the source's own data source — and, with no
 * editor behind the deep link, renders the same zero rows the capture shows.
 *
 * The source's `viewDidLoad` dismisses itself when `editController == nil`. That is kept as a
 * branch, but NOT as a dismissal: the only way this page is entered in the target is the pipeline's
 * deep link, which carries no editor, so closing on appear would leave no page at all. Back returns
 * to the caller.
 */
import { router } from '@kit.ArkUI';
import { TempWorkoutEvent } from '../model/TempWorkoutEvent';
import { workoutEventTypeDescription } from '../model/WorkoutEventType';
import { CustomTimeFormatting } from '../common/Formatting';
import { localizedString } from '../common/LocalizedStrings';
import { BACK_CHEVRON_GAP, BACK_CHEVRON_SIZE } from '../common/NavBack';

/** Source: `Date.init(timeIntervalSince1970: 0)` — the fallback with no editor. */
const EPOCH: Date = new Date(0);

@Entry
@Component
struct EditWorkoutPauseControllerPage {
  /**
   * Source: `editController: EditWorkoutController?` — the presenting editor. A routed page cannot
   * hold a reference to its presenter, so what arrives is the edited workout's uuid (absent on the
   * deep link, which is the source's `editController == nil`).
   */
  @Prop editController: string | null = null;
  /** Source: `events` — `editController?.pauseResumeEvents ?? []`, sorted by startDate on write. */
  @Prop pauseResumeEvents: TempWorkoutEvent[] = [];
  /** Source: `startDate` — `editController?.startDate ?? Date(timeIntervalSince1970: 0)`. */
  @State startDate: Date = EPOCH;

  aboutToAppear(): void {
    this.editController = this.routedEditorUuid();
  }

  build() {
    Column() {
      /**
       * plan controlInventory: `{ implicit: true, affordance: "back", sourceRef:
       * "platform:push-navigation" }` — the source is pushed by a UINavigationController, whose
       * back arrow this page has no ArkUI equivalent for unless built explicitly (a routed
       * `@Entry` page carries none). Not an invented control; it is the ONE non-displayOnly entry
       * this screen's contract declares.
       */
      Row() {
        /*
         * UIKit draws the pushed screen's back item as a chevron plus the PRESENTER's title, and
         * the presenter is `EditWorkoutController`, whose `settingsModel` title is
         * `LS["EditWorkoutController.NewWorkout"]` with no workout set
         * (EditWorkoutController.swift:67) — which is the deep-linked case here. A literal 'Back'
         * is not a label the source ever shows.
         */
        Row({ space: BACK_CHEVRON_GAP }) {
          SymbolGlyph($r('sys.symbol.chevron_left'))
            .fontSize(BACK_CHEVRON_SIZE)
            .fontWeight(FontWeight.Bold)
            .fontColor([$r('app.color.accent_color')])
          Text(localizedString('EditWorkoutController.NewWorkout'))
            .fontSize(17)
            .fontWeight(FontWeight.Normal)
            .fontColor($r('app.color.accent_color'))
            .maxLines(1)
        }
        .id('nav_back')
        .alignItems(VerticalAlign.Center)
        .onClick(() => {
          this.goBack();
        })
      }
      .width('100%')
      .justifyContent(FlexAlign.Start)
      .padding({ left: 16, top: 8, bottom: 8 })
      /**
       * Source: `viewDidLoad` — with NO editor the source dismisses itself immediately and renders
       * nothing (conditional variant `no_edit_controller`); with one it shows the table of its
       * `events`. The page itself is kept (the deep link that opens it carries no editor, and
       * popping on appear would leave the replay no page to land on).
       */
      if (this.editController !== null) {
        List() {
          /**
           * S6: the source's table is driven by `events` (= `editController?.pauseResumeEvents`),
           * so the target's is too — bound, never a transcription. The source overrides no
           * `cellForRowAt`, so the row is the plain default cell: the event and its time, nothing
           * invented. Entered by deep link there is no editor and the array is empty, which is the
           * same empty table the capture (S0042) shows.
           */
          ForEach(this.pauseResumeEvents, (event: TempWorkoutEvent): void => {
            ListItem() {
              Row() {
                Text(workoutEventTypeDescription(event.realEventType()))
                  .fontSize(14)
                  .fontWeight(FontWeight.Medium)
                  .fontColor($r('app.color.primary_color'))
                Blank()
                Text(CustomTimeFormatting.timeString(event.startDate))
                  .fontSize(14)
                  .fontWeight(FontWeight.Medium)
                  .fontColor($r('app.color.secondary_color'))
              }
              .width('100%')
              .height(44)
              .alignItems(VerticalAlign.Center)
              .padding({ left: 16, right: 16 })
            }
          }, (event: TempWorkoutEvent): string => `${event.eventType}-${event.startDate.getTime()}`)
        }
        .width('100%')
        .layoutWeight(1)
      }
    }
    .id('EditWorkoutPauseControllerPage')
    .width('100%')
    .height('100%')
    /**
     * S5: the capture (S0042) shows exactly this — a plain `.backgroundColor` page carrying an
     * empty table and nothing else. The source declares no cell, so there is no row to style; the
     * one visual decision this screen has is that its surface is painted rather than left to the
     * device colour mode.
     */
    .backgroundColor($r('app.color.background_color'))
  }

  /**
   * Source: the navigation controller's back item pops this push back to the editor.
   * A deep-linked launch has only this page on the stack, where `router.back()` exits the app
   * (the pipeline replays every state as its own launch); the source always returns to its
   * presenter, so fall back to that page.
   */
  private goBack(): void {
    if (Number.parseInt(router.getLength(), 10) > 1) {
      router.back();
    } else {
      router.replaceUrl({ url: 'pages/EditWorkoutControllerPage' });
    }
  }

  /** Source: the presenting editor setting `pauseController.editController = self`. */
  private routedEditorUuid(): string | null {
    const params: Record<string, string> = router.getParams() as Record<string, string>;
    const uuid: string | undefined = params !== undefined && params !== null
      ? params['workoutUUID'] : undefined;
    return uuid === undefined || uuid === null || uuid === '' ? null : uuid;
  }
}
