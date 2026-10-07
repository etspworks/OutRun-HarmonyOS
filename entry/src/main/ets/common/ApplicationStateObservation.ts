/*
 * Port of `ApplicationStateObservation` (OutRun/Models/Data/ApplicationStateObservation.swift:23-53)
 * and the `ApplicationStateObserver` protocol (OutRun/Protocols/ApplicationStateObserver.swift).
 *
 * Who wants to know when the app goes to the background: the map-image renderer (it suspends its
 * render process so the system does not terminate a backgrounded app) and the workout recorder.
 * The source raised the state from the AppDelegate; here EntryAbility's onForeground/onBackground
 * call `stateChanged`.
 *
 * The source's `observations` was [ObjectIdentifier: Observation] holding a WEAK observer, so a
 * deallocated observer dropped itself on the next broadcast. ArkTS has no weak reference for this,
 * so the registry holds the observer and `removeObserver` is what unregisters — which every source
 * observer already calls (`stopObservingApplicationState`). A broadcast still skips and drops an
 * observer whose callback throws, which is the nearest thing to the source's self-cleaning.
 */
import { hilog } from '@kit.PerformanceAnalysisKit';
import { ApplicationState } from '../model/ApplicationState';

const DOMAIN: number = 0x0000;
const TAG: string = 'ApplicationStateObservation';

/** Source: `protocol ApplicationStateObserver`. */
export interface ApplicationStateObserver {
  didUpdateApplicationState(state: ApplicationState): void;
}

export class ApplicationStateObservation {
  /** Source: `static var observations`. */
  private static observations: Set<ApplicationStateObserver> = new Set<ApplicationStateObserver>();

  /** Source: `addObserver(_:)`. */
  static addObserver(observer: ApplicationStateObserver): void {
    ApplicationStateObservation.observations.add(observer);
  }

  /** Source: `removeObserver(_:)`. */
  static removeObserver(observer: ApplicationStateObserver): void {
    ApplicationStateObservation.observations.delete(observer);
  }

  /** Source: `stateChanged(to:)` — raised from EntryAbility.onForeground / onBackground. */
  static stateChanged(state: ApplicationState): void {
    const broken: ApplicationStateObserver[] = [];
    for (const observer of ApplicationStateObservation.observations) {
      try {
        observer.didUpdateApplicationState(state);
      } catch (err) {
        hilog.error(DOMAIN, TAG, 'observer failed, dropping it: %{public}s', JSON.stringify(err));
        broken.push(observer);
      }
    }
    for (const observer of broken) {
      ApplicationStateObservation.observations.delete(observer);
    }
  }
}

/** Source: the protocol extension's `startObservingApplicationState()`. */
export function startObservingApplicationState(observer: ApplicationStateObserver): void {
  ApplicationStateObservation.addObserver(observer);
}

/** Source: the protocol extension's `stopObservingApplicationState()`. */
export function stopObservingApplicationState(observer: ApplicationStateObserver): void {
  ApplicationStateObservation.removeObserver(observer);
}
