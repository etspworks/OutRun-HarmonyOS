/*
 * The periodic half of the health-observer substitution (see common/HealthObserver.ts):
 * `HKAnchoredObjectQuery` kept itself alive across app launches, which no HarmonyOS API does, so
 * `workScheduler` repeats this extension and it runs exactly the same poll pass with the app
 * closed. Declared as the `HealthPollAbility` extensionAbility in module.json5.
 */
import WorkSchedulerExtensionAbility from '@ohos.WorkSchedulerExtensionAbility';
import { workScheduler } from '@kit.BackgroundTasksKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { DataManager } from '../common/DataManager';
import { HealthObserver } from '../common/HealthObserver';

const DOMAIN: number = 0x0000;
const TAG: string = 'HealthPollAbility';

export default class HealthPollAbility extends WorkSchedulerExtensionAbility {

  onWorkStart(work: workScheduler.WorkInfo): void {
    hilog.info(DOMAIN, TAG, 'health poll %{public}d started', work.workId);
    HealthPollAbility.runPoll().catch((err: Object): void => {
      hilog.error(DOMAIN, TAG, 'health poll failed: %{public}s', JSON.stringify(err));
    });
  }

  onWorkStop(work: workScheduler.WorkInfo): void {
    hilog.info(DOMAIN, TAG, 'health poll %{public}d stopped', work.workId);
  }

  /** The store is opened for this pass only — this is a separate, short-lived process. */
  private static async runPoll(): Promise<void> {
    try {
      await DataManager.setup((progress: number): void => {
        hilog.info(DOMAIN, TAG, 'store migration %{public}f', progress);
      });
      await HealthObserver.poll();
    } finally {
      await DataManager.close();
    }
  }
}
