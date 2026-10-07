/*
 * Port of `WorkoutCompletionActionHandler`
 * (OutRun/Models/Workout/WorkoutCompletionActionHandler.swift:24-124), together with the
 * BEHAVIOUR of `WorkoutCompletionBanner` (OutRun/Views/Workout/WorkoutCompletionBanner.swift):
 * its three buttons and, crucially, its `onDismiss` — letting the banner time out SAVES the
 * workout, which is why `duration` lives here.
 *
 * `DataManager.saveWorkout(tempWorkout:)` is async on HarmonyOS (relationalStore), so the
 * confirmation banner is shown from the promise instead of from a completion block; the source's
 * fire-and-forget call site is unchanged — nothing awaits the result.
 *
 * The builder is held as `WorkoutContinuable` rather than as `WorkoutBuilder`: WorkoutBuilder.ts
 * imports this module to construct the handler, so typing the field with the concrete class would
 * make the two modules import each other.
 */
import { hilog } from '@kit.PerformanceAnalysisKit';
import { TempWorkout } from '../model/TempWorkout';
import { Workout } from '../model/Workout';
import { DataManager } from './DataManager';
import { localizedString } from './LocalizedStrings';
import { qaFault } from './QaHooks';
import {
  Banner,
  BannerAction,
  BannerKind,
  BannerPosition,
  DEFAULT_BANNER_DURATION
} from './BannerQueue';

const DOMAIN: number = 0x0001;
const TAG: string = 'WorkoutCompletionActionHandler';

/** What this handler needs of a `WorkoutBuilder` — see the module comment. */
export interface WorkoutContinuable {
  continueWorkout(snapshot: TempWorkout): void;
}

export class WorkoutCompletionActionHandler {
  /** Source: `snapshot`. */
  private snapshot: TempWorkout;
  /** Source: `builder` (a weak reference there; ArkTS has none, so it is plain). */
  private builder: WorkoutContinuable | null;
  /** Source: `didPerformAction` — every action is a no-op once one has been taken. */
  private didPerformAction: boolean = false;
  /**
   * Source: `ORBaseBanner.duration` as the completion banner uses it — the seconds the user has to
   * choose before `onDismiss` saves the workout for them.
   */
  readonly duration: number = DEFAULT_BANNER_DURATION;

  constructor(snapshot: TempWorkout, builder: WorkoutContinuable | null) {
    this.snapshot = snapshot;
    this.builder = builder;
  }

  /**
   * Source: `display()` — `WorkoutCompletionBanner(handler: self).show(queuePosition: .front)`.
   * The banner is not dismissable by the user (the source passed `isDismissable: false`) and its
   * timeout saves, so the workout is never silently lost.
   */
  display(): void {
    const banner: Banner = new Banner(BannerKind.WORKOUT_COMPLETION,
      localizedString('NewWorkoutCompletion.Title'), this.completionActions(), false);
    banner.duration = this.duration;
    banner.onDismiss = (): void => {
      // Source: `onDismiss = { banner in self.saveWorkout() }` — guarded by didPerformAction, so a
      // dismissal that followed a button press does nothing.
      this.saveWorkout();
    };
    banner.show(BannerPosition.FRONT);
  }

  /** The three buttons, with the source's own accessibility identifiers as their slugs. */
  private completionActions(): BannerAction[] {
    return [
      new BannerAction('workout_completion_save', localizedString('Save'), (): void => {
        this.saveWorkout();
      }),
      new BannerAction('workout_completion_continue', localizedString('Continue'), (): void => {
        this.continueWorkout();
      }),
      new BannerAction('workout_completion_discard', localizedString('Discard'), (): void => {
        this.discardWorkout();
      })
    ];
  }

  /** Source: `saveWorkout()`. */
  saveWorkout(): void {
    if (this.didPerformAction) {
      return;
    }
    this.didPerformAction = true;

    DataManager.saveTempWorkout(this.snapshot).then((workout: Workout | null): void => {
      this.showResultBanner(workout !== null);
    }).catch((err: Error): void => {
      hilog.error(DOMAIN, TAG, 'saving the recorded workout failed: %{public}s',
        JSON.stringify(err));
      this.showResultBanner(false);
    });
  }

  /** Source: `continueWorkout()` — handing the snapshot back to a builder that may be gone. */
  continueWorkout(): void {
    if (this.didPerformAction) {
      return;
    }
    this.didPerformAction = true;

    // QA fault `continueFail`: act as if the builder had been released, the state the source's weak
    // reference allowed and this port's strong one never reaches (TC-RECORD-130).
    const builder: WorkoutContinuable | null = qaFault('continueFail') ? null : this.builder;
    let messageKey: string = '';
    if (builder !== null) {
      builder.continueWorkout(this.snapshot);
      messageKey = 'NewWorkoutCompletion.Continue.Success';
    } else {
      messageKey = 'NewWorkoutCompletion.Continue.Error';
    }

    const banner: Banner = Banner.text(localizedString(messageKey));
    banner.duration = 5;
    banner.show();
  }

  /** Source: `discardWorkout()` — the snapshot is simply dropped. */
  discardWorkout(): void {
    if (this.didPerformAction) {
      return;
    }
    this.didPerformAction = true;
  }

  /** Source: the completion block of `DataManager.saveWorkout` — a 5 s text banner either way. */
  private showResultBanner(success: boolean): void {
    const banner: Banner = Banner.text(
      localizedString('NewWorkoutCompletion.Save.' + (success ? 'Success' : 'Error')));
    banner.duration = 5;
    banner.show();
  }
}
