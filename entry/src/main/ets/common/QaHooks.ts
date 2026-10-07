/*
 * QA fault injection for test cases whose precondition is a failure the UI cannot produce (a start
 * action that fails, a store that refuses a save, a slow or failing statistics query). Faults arrive
 * on the test deep link — `aa start ... --ps qaFault startFail,saveFail,statsSlow,statsNull,
 * noMailHandler,noUrlHandler,policySlow,continueFail,healthFail` — are
 * set again on every launch or link (so a plain launch clears them), and are honoured only in debug
 * builds: a release build ignores the parameter entirely.
 */
import { Config } from './Config';

const QA_FAULT_KEY: string = 'qaFault';
/** How long `statsSlow` holds the statistics query, long enough to see the loading view. */
export const QA_SLOW_STATS_MS: number = 3000;

export function setQaFaults(raw: string): void {
  AppStorage.setOrCreate<string>(QA_FAULT_KEY, raw);
}

export function qaFault(name: string): boolean {
  if (!Config.isDebug) {
    return false;
  }
  const raw: string | undefined = AppStorage.get<string>(QA_FAULT_KEY);
  return raw !== undefined && raw.split(',').includes(name);
}
