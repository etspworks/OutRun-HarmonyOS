/*
 * Port of `Config.ReleaseStatus` (OutRun/Models/Config.swift) and the two release data tables
 * that enum describes: the shipped version list and the per-version changelog.
 *
 * Only the enum and its data live here; the `Config` accessors that DERIVE a release status
 * (isDebug / isRunOnSimulator / hasSanboxReceipt) belong to common/Config.ts, which imports
 * these names rather than redeclaring them.
 */
import { localizedChangeLog } from '../common/LocalizedStrings';

export enum ReleaseStatus {
  DEBUG = 'debug',
  BETA = 'beta',
  RELEASE = 'release'
}

/** Source: `Config.versions` — every version that ever shipped, oldest first. */
export const VERSIONS: string[] = ['1.0', '1.1', '1.1.1', '1.1.2', '1.2', '1.2.1', '1.2.2'];

/**
 * Source: `Config.changeLogs` — version -> changelog text. The source kept one entry (1.2.2);
 * the text itself is localized, so it is read at call time, not frozen into this table.
 */
export function changeLogs(): Map<string, string> {
  const logs: Map<string, string> = new Map<string, string>();
  const latest: string = '1.2.2';
  const text: string = localizedChangeLog(latest);
  if (text.length > 0) {
    logs.set(latest, text);
  }
  return logs;
}
