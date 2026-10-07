/*
 * Port of `Contribution.Contributor` and `Contribution.readContributors`
 * (OutRun/Models/Contribution.swift:23-57).
 *
 * Source behaviour kept: one bundled JSON file holds three lists; a read failure logs and yields
 * an empty list rather than throwing, so the About screen still renders.
 * iOS read `contribution.json` from the app bundle with Data(contentsOf:); the assets pass put the
 * same file in resources/rawfile, so it is read with resourceManager.getRawFileContentSync.
 * The source's static lets were eager and read the file three times; these cache one parse.
 */
import { application } from '@kit.AbilityKit';
import { resourceManager } from '@kit.LocalizationKit';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';
import { describeError } from '../common/ErrorText';

export interface Contributor {
  name: string;
  url: string;
}

interface ContributionsObject {
  maintainers: Contributor[];
  contributors: Contributor[];
  translators: Contributor[];
}

const CONTRIBUTION_FILE: string = 'contribution.json';

let cached: ContributionsObject | null = null;

function contributions(): ContributionsObject | null {
  if (cached !== null) {
    return cached;
  }
  try {
    const manager: resourceManager.ResourceManager = application.getApplicationContext().resourceManager;
    const bytes: Uint8Array = manager.getRawFileContentSync(CONTRIBUTION_FILE);
    const text: string = util.TextDecoder.create('utf-8').decodeToString(bytes);
    cached = JSON.parse(text) as ContributionsObject;
  } catch (err) {
    console.error(`Contribution: ${describeError(err as BusinessError)}`);
    cached = null;
  }
  return cached;
}

/**
 * Source: `Contribution.readContributors(for:)`. The Swift keypath selected one of the three
 * lists; ArkTS has no keypath, so the list is named. Returns [] on any read/parse failure.
 */
export function readContributors(list: string): Contributor[] {
  const object: ContributionsObject | null = contributions();
  if (object === null) {
    return [];
  }
  if (list === 'maintainers') {
    return object.maintainers;
  }
  if (list === 'translators') {
    return object.translators;
  }
  return object.contributors;
}

/** Source: `Contribution.maintainers`. */
export function maintainers(): Contributor[] {
  return readContributors('maintainers');
}

/** Source: `Contribution.contributors`. */
export function contributors(): Contributor[] {
  return readContributors('contributors');
}

/** Source: `Contribution.translators`. */
export function translators(): Contributor[] {
  return readContributors('translators');
}
