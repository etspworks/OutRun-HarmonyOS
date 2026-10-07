/*
 * S3/S4 — port of `WorkoutTypeAlert`
 * (OutRun/Controllers/Alerts/WorkoutTypeAlert.swift:25-71).
 *
 * presentation: modal (a UIAlertController `.alert` presented over its host), so it is an ArkUI
 * overlay mounted in its hosts (NewWorkoutViewControllerPage, WorkoutListViewControllerPage), not a
 * routed page.
 *
 * Source structure: title LS["NewWorkoutAlert.Title"] + message LS["NewWorkoutAlert.Message"] over
 * `typeOption(for:)` built for .running/.walking/.hiking/.cycling/.skating (the titles are
 * `Workout.WorkoutType.description`, i.e. LS["Workout.Type.*"], never literals), then the optional
 * LS["NewWorkoutAlert.EnterManually"] option, then the `.cancel`-styled LS["Cancel"].
 *
 * S4: the options are a real option LIST, built in `aboutToAppear` from the WorkoutType model in
 * the source's own order, and each row branches on its `kind` — the source has three option kinds
 * with three different effects (a workout type, the manual entry, the cancel), which is why the
 * rows are not uniform.
 *
 * Two call sites, two option sets (conditionalVariants with_manual / without_manual):
 *   TabBarController.displayNewWorkoutAlert (long press on the add button) passes a manualAction,
 *     and ITS action closure opens the recording screen for the chosen type;
 *   NewWorkoutViewController.typeView passes no manualAction, and its action only switches the
 *     builder's type in place — which is the `typeAction` a host supplies here.
 */
import { router } from '@kit.ArkUI';
import { WorkoutType, workoutTypeDescription } from '../model/WorkoutType';
import { localizedString } from '../common/LocalizedStrings';

/** The three option kinds the source's alert mixes (itemTypes in the screen's bindingContract). */
export enum WorkoutTypeAlertOptionKind {
  WORKOUT_TYPE = 'WORKOUT_TYPE',
  MANUAL = 'MANUAL',
  CANCEL = 'CANCEL'
}

/** One `UIAlertAction` of the source alert. */
export class WorkoutTypeAlertOption {
  readonly kind: WorkoutTypeAlertOptionKind;
  /** Set only for the WORKOUT_TYPE kind — the type the action closure is called with. */
  readonly workoutType: WorkoutType;
  /** Rule 12: the source control's slug. */
  readonly slug: string;

  constructor(kind: WorkoutTypeAlertOptionKind, workoutType: WorkoutType, slug: string) {
    this.kind = kind;
    this.workoutType = workoutType;
    this.slug = slug;
  }
}

/**
 * Source: `[.running, .walking, .hiking, .cycling, .skating]` — the alert's own order, which is
 * NOT `WorkoutType.allCases`' order, so it is stated here rather than taken from the model's list.
 */
const ALERT_WORKOUT_TYPES: WorkoutType[] = [WorkoutType.RUNNING, WorkoutType.WALKING,
  WorkoutType.HIKING, WorkoutType.CYCLING, WorkoutType.SKATING];

@CustomDialog
export struct WorkoutTypeAlertPage {
  controller?: CustomDialogController;
  /** Source: `init(action:)` — the host closure taking the chosen type. */
  typeAction?: (type: WorkoutType) => void;
  /**
   * Source: `manualAction` — nil at the NewWorkoutViewController call site, so the option is
   * absent there; the tab-bar long press supplies it and owns what it opens.
   */
  manualAction?: () => void;
  /** Source: `manualAction != nil` — true only at the tab-bar long-press call site. */
  @Prop allowsManualEntry: boolean = false;
  /** Source: the host's presented flag — cleared whenever this alert dismisses itself. */
  @Link isShown: boolean;
  /** Source: the alert's action list, built from the types above plus the two fixed options. */
  @State options: WorkoutTypeAlertOption[] = [];

  aboutToAppear(): void {
    this.options = this.buildOptions();
  }

  build() {
    Column() {
      /**
       * S5, measured off the capture (S0029 `base.ui.json`): the alert is the 270pt-wide card at
       * `[60,225][330,631]`, its header block `[225,321]` (96pt) holding the title at 17pt
       * semibold and the message at 13pt, both centred on the 16pt content margin.
       */
      Column() {
        /** Source: `title: LS["NewWorkoutAlert.Title"]`. */
        Text(localizedString('NewWorkoutAlert.Title'))
          /** S6: UIAlertController's title is the 17pt semibold system token, not the app's. */
          .fontSize(17)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.primary_color'))
          .textAlign(TextAlign.Center)
          .width('100%')
        /** Source: `message: LS["NewWorkoutAlert.Message"]`. */
        Text(localizedString('NewWorkoutAlert.Message'))
          /** S6: the alert message is 13pt regular — the capture's two-line centred block. */
          .fontSize(13)
          .fontWeight(FontWeight.Normal)
          .fontColor($r('app.color.primary_color'))
          .textAlign(TextAlign.Center)
          .width('100%')
          .margin({ top: 4 })
      }
      .width('100%')
      .padding({ left: 16, right: 16, top: 20, bottom: 21 })

      ForEach(this.options, (option: WorkoutTypeAlertOption): void => {
        this.optionRow(option);
      }, (option: WorkoutTypeAlertOption): string => option.slug)
    }
    .width(270)
    .backgroundColor($r('app.color.foreground_color'))
    /** The UIAlertController card's own corner radius — a fixed iOS design-system value. */
    .borderRadius(14)
    .clip(true)
    /* Page-identity marker: mounted inside its host's window, so its root carries its route name. */
    .id('WorkoutTypeAlert')
  }

  /**
   * Source: the three `UIAlertAction` kinds — `typeOption(for:)` (title = `type.description`,
   * action = `action(type)`), the manual option and the `.cancel` option (action nil).
   */
  @Builder
  optionRow(option: WorkoutTypeAlertOption) {
    if (option.kind === WorkoutTypeAlertOptionKind.WORKOUT_TYPE) {
      Column() {
        this.optionSeparator()
        Button(workoutTypeDescription(option.workoutType))
          .id(option.slug)
          .type(ButtonType.Normal)
          .width('100%')
          .height(44)
          .backgroundColor($r('app.color.foreground_color'))
          .fontSize(16)
          .fontWeight(FontWeight.Normal)
          .fontColor($r('app.color.accent_color'))
          .onClick(() => {
            this.chooseType(option.workoutType);
          })
      }
      .width('100%')
    } else if (option.kind === WorkoutTypeAlertOptionKind.MANUAL) {
      Column() {
        this.optionSeparator()
        Button(localizedString('NewWorkoutAlert.EnterManually'))
          .id('enter_manually')
          .type(ButtonType.Normal)
          .width('100%')
          .height(44)
          .backgroundColor($r('app.color.foreground_color'))
          .fontSize(16)
          .fontWeight(FontWeight.Normal)
          .fontColor($r('app.color.accent_color'))
          .onClick(() => {
            this.enterManually();
          })
      }
      .width('100%')
    } else {
      Column() {
        this.optionSeparator()
        /** Source: `style: .cancel` — UIKit renders the cancel action's title semibold. */
        Button(localizedString('Cancel'))
          .id('cancel')
          .type(ButtonType.Normal)
          .width('100%')
          .height(44)
          .backgroundColor($r('app.color.foreground_color'))
          .fontSize(16)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.accent_color'))
          .onClick(() => {
            this.close();
          })
      }
      .width('100%')
    }
  }

  /** The hairline UIAlertController draws above every action row. */
  @Builder
  optionSeparator() {
    Divider()
      .strokeWidth(0.5)
      .color($r('app.color.table_view_separator'))
  }

  /**
   * Source: `WorkoutTypeAlert.init` — the five type options, then the manual option ONLY when
   * `manualAction != nil` (conditionalVariants with_manual / without_manual), then cancel.
   */
  private buildOptions(): WorkoutTypeAlertOption[] {
    const built: WorkoutTypeAlertOption[] = [];
    for (const type of ALERT_WORKOUT_TYPES) {
      built.push(new WorkoutTypeAlertOption(WorkoutTypeAlertOptionKind.WORKOUT_TYPE, type,
        this.slugFor(type)));
    }
    if (this.allowsManualEntry && this.manualAction !== undefined) {
      built.push(new WorkoutTypeAlertOption(WorkoutTypeAlertOptionKind.MANUAL, WorkoutType.UNKNOWN,
        'enter_manually'));
    }
    built.push(new WorkoutTypeAlertOption(WorkoutTypeAlertOptionKind.CANCEL, WorkoutType.UNKNOWN,
      'cancel'));
    return built;
  }

  /** Rule 12: the instrumented source slug of each type option. */
  private slugFor(type: WorkoutType): string {
    switch (type) {
      case WorkoutType.RUNNING: return 'running';
      case WorkoutType.WALKING: return 'walking';
      case WorkoutType.HIKING: return 'hiking';
      case WorkoutType.CYCLING: return 'cycling';
      case WorkoutType.SKATING: return 'skating';
      default: return 'unknown';
    }
  }

  /**
   * Source: the two `action` closures. A host that supplies `typeAction` is the recording screen
   * switching its builder's type in place; with none, this is the tab-bar long-press alert, whose
   * closure was `let controller = NewWorkoutViewController(); controller.type = type;
   * showDetailViewController(controller, sender:)` — a push of the recording screen for that type.
   */
  private chooseType(type: WorkoutType): void {
    this.close();
    const action: ((type: WorkoutType) => void) | undefined = this.typeAction;
    if (action !== undefined) {
      action(type);
      return;
    }
    router.pushUrl({
      url: 'pages/NewWorkoutViewControllerPage',
      params: { 'workoutType': type.valueOf() } as Record<string, number>
    });
  }

  /** Source: `manualAction` — the host's closure; the alert itself decides nothing here. */
  private enterManually(): void {
    this.close();
    const action: (() => void) | undefined = this.manualAction;
    if (action !== undefined) {
      action();
    }
  }

  /** Source: the cancel option (style .cancel, action nil) and every option's dismissal. */
  private close(): void {
    this.isShown = false;
    if (this.controller !== undefined) {
      this.controller.close();
    }
  }
}
