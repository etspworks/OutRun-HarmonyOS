/*
 * S3 structure — port of `EditWorkoutController`
 * (OutRun/Controllers/Workout/EditWorkoutController.swift), a `SettingsViewController` subclass that
 * builds its own two-section model rather than reading svc_settings_model's.
 *
 * Source rows, in source order: Info = PickerSetting(Type), TextInputSetting(Distance, .decimalPad,
 * unit behind the field), TextInputSetting(Steps — titled 'Pedal Strokes' while the type is cycling,
 * .numberPad, placeholder LS["NotSet"]), DatePickerSetting(Start Date, .dateAndTime),
 * TimeIntervalPickerSetting(Duration), SwitchSetting(Race); then a Comment section holding one
 * TextViewSetting. The 'Pauses' section is COMMENTED OUT in source (EditWorkoutController.swift:
 * 138-152), so it is not built here either and screen_edit_workout_pause stays unreachable.
 *
 * Two modes from one page, as in source: a `workoutUUID` route param pre-fills every field
 * ('Edit Workout', Save starts enabled), no param leaves the form empty ('New Workout', Save
 * disabled until validateData() passes).
 *
 * S5 style: this controller IS a SettingsViewController, so the table chrome is the same one —
 * .backgroundColor page, .tableViewSeparator hairlines, uppercased 12fp .secondaryColor section
 * headers at the 16pt margin, 44pt rows. Its own bar comes from
 * NavigationController.swift:29 and EditWorkoutController.swift:57-63:
 *   cancelItem  a .plain UIBarButtonItem — 17pt regular in the bar tint (.accentColor)
 *   addItem     a .done UIBarButtonItem — 17pt semibold, .secondaryColor while isEnabled is false
 *   title       systemFont 32 .heavy .withLowerCaseSmallCaps in .accentColor (the large title)
 * The presentation is the source's page sheet, so the page carries the sheet's rounded top.
 */
import { KeyboardAvoidMode, router } from '@kit.ArkUI';
import { inputMethod } from '@kit.IMEKit';
import { Workout } from '../model/Workout';
import { TempWorkoutEvent } from '../model/TempWorkoutEvent';
import { WorkoutEvent } from '../model/WorkoutEvent';
import { WorkoutEventType, workoutEventTypeFromRaw } from '../model/WorkoutEventType';
import { WorkoutType, workoutTypeAllCases, workoutTypeDescription, workoutTypeFromRaw }
  from '../model/WorkoutType';
import { DataManager, WorkoutChanges, WorkoutDraft } from '../common/DataManager';
import { HealthStoreManager } from '../common/HealthStoreManager';
import { BurnedEnergyCalculator } from '../common/BurnedEnergyCalculator';
import { UserPreferences } from '../common/UserPreferences';
import { CustomMeasurementFormatting, CustomNumberFormatting, CustomTimeFormatting }
  from '../common/Formatting';
import { localizedString } from '../common/LocalizedStrings';
import { showErrorAlert } from '../common/AlertDialogs';
import { PickerSetting } from '../components/PickerSetting';
import { TextInputSetting } from '../components/TextInputSetting';
import { DatePickerSetting } from '../components/DatePickerSetting';
import { TimeIntervalPickerSetting } from '../components/TimeIntervalPickerSetting';
import { SwitchSetting } from '../components/SwitchSetting';
import { TextViewSetting } from '../components/TextViewSetting';
import { closeTo } from '../common/NavBack';

/** Source rows, in source order — the row index `cellShouldBeVisisble` holds. */
const ROW_DISTANCE: number = 1;
const ROW_STEPS: number = 2;
const ROW_COMMENT: number = 6;

@Entry
@Component
struct EditWorkoutControllerPage {
  /** Source: `workout` — nil for the 'New Workout' mode the tab-bar long press opens. */
  @State workout: Workout | null = null;
  /** Source: `workoutType = Workout.WorkoutType.running`. */
  @State workoutType: WorkoutType = WorkoutType.RUNNING;
  /** Source: `distance: Double?` — kilometres, as the source's own state holds it. */
  @State distance: number | null = null;
  /**
   * The distance text the user committed. Source: the row is built with a one-time
   * `textFieldText`, so the field keeps what was typed ("5.0" stays "5.0"); only the parsed value
   * goes into `distance`. null = nothing typed yet, show the stored value formatted.
   */
  @State distanceInput: string | null = null;
  /** Source: `steps: Int?`. */
  @State steps: number | null = null;
  /** Source: `startDate = Date()`. */
  @State startDate: Date = new Date();
  /** Source: `duration: TimeInterval = 0` — seconds. */
  @State duration: number = 0;
  /** Source: `isRace = false`. */
  @State isRace: boolean = false;
  /** Source: `comment: String? = nil`. */
  @State comment: string | null = null;
  /** Source: `addItem.isEnabled`, set by `validateData()`. */
  @State isFormValid: boolean = false;
  /** Source: `pauseResumeEvents` — read off the edited workout; not editable while Pauses is off. */
  @State pauseResumeEvents: TempWorkoutEvent[] = [];

  /** Source: `PickerSetting(possibleValues: Workout.WorkoutType.allCases)`. */
  @State private typeOptions: string[] = [];
  /**
   * Source: `SettingsViewController.cellShouldBeVisisble` (this controller is a subclass of it) —
   * the row whose field began editing, `-1` for its nil. While a row is registered the table carries
   * the keyboard inset and the field's `addDoneToolbar()` accessory is up.
   */
  @State cellShouldBeVisisble: number = -1;
  /**
   * Source: the wheel of `PickerSetting(Type)` being first responder. The page owns it because the
   * source's first responder is exclusive: `dummyTextField.becomeFirstResponder()` resigns whatever
   * field was editing, and a field beginning to edit resigns the wheel — so only ONE
   * `addDoneToolbar()` accessory (slug keyboard_done) can be on screen at a time.
   */
  @State private typePickerOpen: boolean = false;

  /** Source: `viewDidLoad` — pre-fill from the handed-in workout, then build the model. */
  aboutToAppear(): void {
    const options: string[] = [];
    for (const type of workoutTypeAllCases()) {
      options.push(workoutTypeDescription(type));
    }
    this.typeOptions = options;
    const params: Record<string, string> = router.getParams() as Record<string, string>;
    const uuid: string | undefined = params !== undefined && params !== null
      ? params['workoutUUID'] : undefined;
    if (uuid !== undefined && uuid !== null && uuid !== '') {
      this.loadWorkout(uuid);
    }
    /*
     * Source: UIKit never moves the navigation bar for the keyboard — the controller only insets its
     * table (`keyboardWillShow`). ArkUI's DEFAULT avoidance is KeyboardAvoidMode.OFFSET, which lifts
     * the whole page: the capture showed the page box sliding up by the keyboard's 1001px, taking the
     * Cancel/Save bar and the Done accessory out of the tree. RESIZE re-lays the page out instead, so
     * the bar stays put and the Done accessory sits above the keyboard, as in source.
     */
    this.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.RESIZE);
  }

  /** The avoidance mode is per WINDOW, so hand it back when this page goes away. */
  aboutToDisappear(): void {
    this.getUIContext().setKeyboardAvoidMode(KeyboardAvoidMode.OFFSET);
  }

  build() {
    Column() {
      /** Source: the navigation bar — cancelItem, the model title and addItem. */
      Row() {
        Text(localizedString('Cancel'))
          .fontSize(17)
          .fontColor($r('app.color.accent_color'))
          .id('edit_workout_cancel')
          .onClick(() => {
            this.close();
          })
        Blank()
        /**
         * Source: `title: self.workout == nil ? LS["...NewWorkout"] : LS["...EditWorkout"]` — the
         * LARGE title, so it renders below the bar rather than between the two bar buttons.
         */
        Text(this.workout === null
          ? localizedString('EditWorkoutController.NewWorkout')
          : localizedString('EditWorkoutController.EditWorkout'))
          .visibility(Visibility.None)
        Blank()
        /**
         * Source: `addItem.isEnabled = validateData()` — a UIBarButtonItem whose disabled state
         * greys the title and makes its action a no-op; the button itself stays a tappable
         * control (the capture dumps it `enabled=false, clickable=true`). `.enabled(false)` here
         * would instead make the node untappable, so the disabled state lives in the title colour
         * and in `saveWorkout()`'s own `validateData()` guard, exactly as the source does it.
         */
        Text(localizedString('Save'))
          .fontSize(17)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.isFormValid
            ? $r('app.color.accent_color') : $r('app.color.secondary_color'))
          .id('edit_workout_save')
          .onClick(() => {
            this.saveWorkout();
          })
      }
      .width('100%')
      .height(44)
      .alignItems(VerticalAlign.Center)
      .padding({ left: 16, right: 16 })
      /**
       * Source: the large navigation title, drawn under the bar buttons — same face as every
       * other OutRun title (NavigationController.swift:29).
       */
      Text(this.workout === null
        ? localizedString('EditWorkoutController.NewWorkout')
        : localizedString('EditWorkoutController.EditWorkout'))
        .fontSize(32)
        .fontWeight(900)
        .fontFeature('"smcp" 1')
        .lineHeight(39)
        .fontColor($r('app.color.accent_color'))
        .width('100%')
        .textAlign(TextAlign.Start)
        .padding({ left: 16, right: 16, top: 11, bottom: 8 })
      Scroll() {
        Column() {
          /** Source: `SettingSection(title: "Info")`. */
          Column() {
            Text('Info'.toUpperCase())
              .fontSize(12)
              .fontWeight(FontWeight.Medium)
              .fontColor($r('app.color.secondary_color'))
              .width('100%')
              .padding({ left: 16, right: 16, top: 20, bottom: 6 })
            Divider()
              .strokeWidth(0.5)
              .color($r('app.color.table_view_separator'))
            PickerSetting({
              title: localizedString('Workout.Type'),
              options: this.typeOptions,
              selectedIndex: this.workoutType.valueOf(),
              isPickerOpen: $typePickerOpen,
              /** Source: `becomeFirstResponder()` on the wheel resigns the editing field. */
              onPickerOpened: (): void => {
                this.dismissKeyboard();
              },
              onIndexSelected: (index: number): void => {
                this.workoutType = workoutTypeFromRaw(index);
                this.validateData();
              }
            })
            TextInputSetting({
              title: localizedString('Workout.Distance'),
              value: this.distanceInput !== null ? this.distanceInput : this.distanceText(),
              keyboardType: 'decimal',
              textBehind: CustomMeasurementFormatting.stringForUnit(
                UserPreferences.distanceMeasurementType.safeValue, true),
              onValueChanged: (newValue: string): void => {
                this.distanceInput = newValue;
                this.applyDistance(newValue);
              },
              onBeginEditing: (): void => {
                this.cellShouldBeVisisble = ROW_DISTANCE;
                this.typePickerOpen = false;
              },
              onEndEditing: (): void => {
                this.endEditing(ROW_DISTANCE);
              }
            })
            /** Source: the steps row's title is DATA-BOUND to the chosen type (plan: type_cycling). */
            TextInputSetting({
              title: this.workoutType === WorkoutType.CYCLING
                ? localizedString('Workout.Strokes') : localizedString('Workout.Steps'),
              value: this.stepsText(),
              placeholder: localizedString('NotSet'),
              keyboardType: 'number',
              onValueChanged: (newValue: string): void => {
                this.applySteps(newValue);
              },
              onBeginEditing: (): void => {
                this.cellShouldBeVisisble = ROW_STEPS;
                this.typePickerOpen = false;
              },
              onEndEditing: (): void => {
                this.endEditing(ROW_STEPS);
              }
            })
            DatePickerSetting({
              title: localizedString('Workout.StartDate'),
              dateText: CustomTimeFormatting.fullDateString(this.startDate),
              selected: this.startDate,
              onDateSelected: (date: Date): void => {
                this.startDate = date;
                this.validateData();
              }
            })
            TimeIntervalPickerSetting({
              title: localizedString('Workout.Duration'),
              intervalText: this.durationText(),
              interval: this.duration,
              onIntervalSelected: (seconds: number): void => {
                this.duration = seconds;
                this.validateData();
              }
            })
            SwitchSetting({
              title: localizedString('Workout.Race'),
              isOn: this.isRace,
              rowId: 'race',
              /** The last row of the Info section — its rule runs edge to edge. */
              lastInSection: true,
              onToggle: (newValue: boolean): void => {
                this.isRace = newValue;
                this.validateData();
              }
            })
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
          /** Source: `SettingSection(title: LS["Workout.Comment"])`. */
          Column() {
            Text(localizedString('Workout.Comment').toUpperCase())
              .fontSize(12)
              .fontWeight(FontWeight.Medium)
              .fontColor($r('app.color.secondary_color'))
              .width('100%')
              .padding({ left: 16, right: 16, top: 20, bottom: 6 })
            Divider()
              .strokeWidth(0.5)
              .color($r('app.color.table_view_separator'))
            TextViewSetting({
              text: this.comment !== null ? this.comment : '',
              placeholder: localizedString('Workout.Comment'),
              /** The only row of the Comment section — its rule runs edge to edge. */
              lastInSection: true,
              onTextChanged: (newValue: string): void => {
                this.comment = newValue === '' ? null : newValue;
                this.validateData();
              },
              onBeginEditing: (): void => {
                this.cellShouldBeVisisble = ROW_COMMENT;
                this.typePickerOpen = false;
              },
              onEndEditing: (): void => {
                this.endEditing(ROW_COMMENT);
              }
            })
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
        }
        .width('100%')
      }
      .layoutWeight(1)
      .width('100%')
      .align(Alignment.Top)
      .scrollBar(BarState.Off)
      /*
       * Source: the inherited `keyboardWillShow` contentInset — UIKit never resizes the view for the
       * keyboard, so the controller insets the table itself. HarmonyOS DOES resize the page window
       * (the capture's page box shrank from 2597px to 1596px with the keyboard up), so insetting
       * again compensated twice and collapsed the fixed-height bar and Done toolbar out of the tree.
       */
      /**
       * Source: `UITextField.addDoneToolbar()` / `UITextView.addDoneToolbar()` — the field's
       * inputAccessoryView, so it exists only while that field is editing (plan variant
       * keyboard_visible).
       */
      if (this.cellShouldBeVisisble >= 0) {
        Row() {
          Blank()
          Text(localizedString('Done'))
            .fontSize(17)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.accent_color'))
            .id('keyboard_done')
            .onClick(() => {
              this.dismissKeyboard();
            })
        }
        .width('100%')
        .height(45)
        .padding({ left: 16, right: 16 })
        .backgroundColor($r('app.color.foreground_color'))
        .border({ width: { top: 0.5 }, color: $r('app.color.table_view_separator') })
      }
    }
    .id('EditWorkoutControllerPage')
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background_color'))
  }

  /** Source: `viewDidLoad`'s `if let workout = workout { ... }` pre-fill block. */
  private loadWorkout(uuid: string): void {
    DataManager.workout(uuid).then((stored: Workout | null): void => {
      if (stored === null) {
        return;
      }
      DataManager.hydrate(stored).then((workout: Workout): void => {
        this.workout = workout;
        this.workoutType = workoutTypeFromRaw(workout.workoutType);
        this.distance = workout.distance / 1000;
        this.steps = workout.steps;
        this.startDate = workout.startDate;
        this.duration = (workout.endDate.getTime() - workout.startDate.getTime()) / 1000;
        this.isRace = workout.isRace;
        this.comment = workout.comment;
        this.pauseResumeEvents = EditWorkoutControllerPage.pauseEvents(workout.workoutEvents);
        this.isFormValid = true;
      }).catch((err: Error): void => {
        this.reportLoadFailure();
      });
    }).catch((err: Error): void => {
      this.reportLoadFailure();
    });
  }

  /** Source: the pause/resume filter + `TempWorkoutEvent(workoutEvent:)` map. */
  private static pauseEvents(events: WorkoutEvent[]): TempWorkoutEvent[] {
    const staged: TempWorkoutEvent[] = [];
    for (const event of events) {
      const type: WorkoutEventType = workoutEventTypeFromRaw(event.eventType);
      if (type === WorkoutEventType.PAUSE || type === WorkoutEventType.AUTO_PAUSE
        || type === WorkoutEventType.RESUME || type === WorkoutEventType.AUTO_RESUME) {
        staged.push(TempWorkoutEvent.fromEvent(event));
      }
    }
    return staged;
  }

  private reportLoadFailure(): void {
    showErrorAlert(localizedString('EditWorkoutController.SaveWorkout.Error')).catch(
      (err: Error): void => {
      });
  }

  /** Source: the distance row's `textFieldText` closure — stored km shown in the preferred unit. */
  private distanceText(): string {
    const stored: number | null = this.distance;
    if (stored === null) {
      return '';
    }
    const shown: number = UserPreferences.distanceMeasurementType.convert(stored, true);
    const text: string | null = CustomNumberFormatting.string(shown, 2);
    return text !== null ? text : '';
  }

  /** Source: the steps row's `textFieldText` closure — nil renders as the placeholder. */
  private stepsText(): string {
    const stored: number | null = this.steps;
    if (stored === null) {
      return '';
    }
    const text: string | null = CustomNumberFormatting.string(stored, 0);
    return text !== null ? text : '';
  }

  /** Source: the duration cell's detail label — the interval as h:mm:ss. */
  private durationText(): string {
    const total: number = Math.floor(this.duration);
    const hours: number = Math.floor(total / 3600);
    const minutes: number = Math.floor((total % 3600) / 60);
    const seconds: number = total % 60;
    return `${hours}:${EditWorkoutControllerPage.pad(minutes)}:${EditWorkoutControllerPage.pad(seconds)}`;
  }

  private static pad(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
  }

  /** Source: the distance row's `textFieldValueAction` — parse, convert back to km, re-validate. */
  private applyDistance(text: string): void {
    const parsed: number | null = CustomNumberFormatting.number(text);
    if (parsed === null) {
      return;
    }
    this.distance = UserPreferences.distanceMeasurementType.convert(parsed, false, false);
    this.validateData();
  }

  /** Source: the steps row's `textFieldValueAction` — a blank field stores nil. */
  private applySteps(text: string): void {
    const parsed: number | null = CustomNumberFormatting.number(text);
    this.steps = parsed !== null ? Math.round(parsed) : null;
    this.validateData();
  }

  /** Source: `textFieldShouldEndEditing` / `textViewDidEndEditing` — the row is released. */
  private endEditing(row: number): void {
    if (this.cellShouldBeVisisble === row) {
      this.cellShouldBeVisisble = -1;
    }
  }

  /**
   * Source: the Done toolbar item's `#selector(self.endEditing(_:))` — it resigns first responder,
   * which ends editing and so commits the field through its end-editing action.
   */
  private dismissKeyboard(): void {
    this.cellShouldBeVisisble = -1;
    inputMethod.getController().stopInputSession().catch((err: Error): void => {
    });
  }

  /** Source: `validateData()`. */
  private validateData(): void {
    const end: number = this.startDate.getTime() + this.duration * 1000;
    this.isFormValid = this.distance !== null && this.duration !== 0 && end <= Date.now();
  }

  /** Source: `saveWorkout()` — alterWorkout in edit mode, saveWorkout in new mode. */
  private saveWorkout(): void {
    /** Source: `addItem.isEnabled = validateData()` — the item does nothing while it is disabled. */
    if (!this.isFormValid) {
      return;
    }
    const existing: Workout | null = this.workout;
    if (existing !== null) {
      this.alterExisting(existing);
    } else {
      this.insertNew();
    }
  }

  /** Source: `DataManager.alterWorkout(...)` with only the CHANGED fields, plus the health sync. */
  private alterExisting(workout: Workout): void {
    const endDate: Date = new Date(this.startDate.getTime() + this.duration * 1000);
    const distanceInMeters: number = (this.distance !== null ? this.distance : 0) * 1000;
    const changes: WorkoutChanges = new WorkoutChanges();
    changes.type = this.workoutType !== workoutTypeFromRaw(workout.workoutType)
      ? this.workoutType : null;
    changes.startDate = this.startDate.getTime() !== workout.startDate.getTime()
      ? this.startDate : null;
    changes.endDate = endDate.getTime() !== workout.endDate.getTime() ? endDate : null;
    changes.distance = distanceInMeters !== workout.distance ? distanceInMeters : null;
    changes.setSteps = this.steps !== workout.steps;
    changes.steps = this.steps;
    changes.isRace = this.isRace !== workout.isRace ? this.isRace : null;
    changes.setComment = this.comment !== workout.comment;
    changes.comment = this.comment;
    const weightBefore: number = this.weightBeforeWorkout(
      workoutTypeFromRaw(workout.workoutType), distanceInMeters);
    changes.weightBeforeWorkout = weightBefore > 0 ? weightBefore : null;

    DataManager.alterWorkout(workout, changes).then((altered: Workout | null): void => {
      if (altered === null) {
        this.reportSaveFailure();
        return;
      }
      if (UserPreferences.synchronizeWorkoutsWithAppleHealth.value) {
        this.syncAltered(altered);
      } else {
        this.closeAndShow(altered);
      }
    }).catch((err: Error): void => {
      this.reportSaveFailure();
    });
  }

  /**
   * Source: `HealthStoreManager.alterHealthWorkout` falling back to
   * `DataManager.removeHealthKitWorkoutUUID` when the health store refuses the change.
   */
  private syncAltered(workout: Workout): void {
    HealthStoreManager.alterHealthWorkout(workout).then((success: boolean): void => {
      if (success) {
        this.closeAndShow(workout);
        return;
      }
      DataManager.removeHealthKitWorkoutUUID(workout).then((removed: boolean): void => {
        if (!removed) {
          showErrorAlert(localizedString('EditWorkoutController.AlterWorkout.AppleHealth.Error'))
            .then((): void => {
              this.closeAndShow(workout);
            }).catch((err: Error): void => {
            });
          return;
        }
        this.closeAndShow(workout);
      }).catch((err: Error): void => {
        this.closeAndShow(workout);
      });
    }).catch((err: Error): void => {
      this.closeAndShow(workout);
    });
  }

  /** Source: `DataManager.saveWorkout(withType:...isUserModified: true...)` in the new-workout half. */
  private insertNew(): void {
    const endDate: Date = new Date(this.startDate.getTime() + this.duration * 1000);
    const draft: WorkoutDraft = new WorkoutDraft(this.workoutType, this.startDate, endDate,
      (this.distance !== null ? this.distance : 0) * 1000);
    draft.steps = this.steps;
    draft.isRace = this.isRace;
    draft.isUserModified = true;
    draft.comment = this.comment;

    DataManager.saveWorkout(draft).then((saved: Workout | null): void => {
      if (saved === null) {
        this.reportSaveFailure();
        return;
      }
      if (UserPreferences.synchronizeWorkoutsWithAppleHealth.value) {
        HealthStoreManager.saveHealthWorkout(saved).then((uuid: string | null): void => {
          if (uuid === null) {
            showErrorAlert(localizedString('EditWorkoutController.SaveWorkout.AppleHealth.Error'))
              .then((): void => {
                this.close();
              }).catch((err: Error): void => {
              });
            return;
          }
          this.closeAndShow(saved);
        }).catch((err: Error): void => {
          this.closeAndShow(saved);
        });
        return;
      }
      this.closeAndShow(saved);
    }).catch((err: Error): void => {
      this.reportSaveFailure();
    });
  }

  /** Source: `getWeightBeforeWorkout(for:with:)`. */
  private weightBeforeWorkout(type: WorkoutType, distance: number): number {
    const weight: number | null = UserPreferences.weight.value;
    if (weight === null) {
      return 0;
    }
    const burned: number = BurnedEnergyCalculator
      .calculateBurnedCalories(type, distance, weight).doubleValue();
    return BurnedEnergyCalculator.calculeWeightBeforeWorkout(type, distance, burned);
  }

  private reportSaveFailure(): void {
    showErrorAlert(localizedString('EditWorkoutController.SaveWorkout.Error')).catch(
      (err: Error): void => {
      });
  }

  /** Source: `closeAndShowController(for:)` — dismiss, then show the saved workout's detail page. */
  private closeAndShow(workout: Workout): void {
    // The form is dismissed first, so Back from the detail never lands on it again. Editing also
    // dismisses the detail page the form came from (source: `oldController.dismiss`), so that
    // page is the one replaced.
    if (this.workout !== null && Number.parseInt(router.getLength(), 10) > 1) {
      router.back();
    }
    router.replaceUrl({
      url: 'pages/WorkoutViewControllerPage',
      params: { 'workoutUUID': workout.uuid } as Record<string, string | null>
    });
  }

  /**
   * Source: `closeSelector()` / `close(completion:)` — dismiss(animated: true) from Cancel, back to
   * the presenter: the workout's detail screen when editing one, the workout list when the editor
   * was opened to add a workout by hand.
   */
  private close(): void {
    const current: Workout | null = this.workout;
    const uuid: string | null = current !== null ? current.uuid : null;
    if (uuid !== null) {
      const params: Record<string, string> = { 'workoutUUID': uuid };
      closeTo('pages/WorkoutViewControllerPage', params);
      return;
    }
    closeTo('pages/WorkoutListViewControllerPage');
  }
}
