/*
 * Port of `Contribution` (OutRun/Models/Contribution.swift:23-57) — the three credit lists the
 * About screen shows.
 *
 * The JSON read itself (`readContributors`, the `ContributionsObject` shape and its one-parse
 * cache) already lives in model/Contributor.ts; re-implementing it here would be a second reader
 * of the same bundled file. This module is the `Contribution` surface the call sites use, with the
 * source's three static lists resolved once — Swift's `static let` was equally eager.
 */
import { Contributor, readContributors } from '../model/Contributor';

export type { Contributor };
export { readContributors };

/** Source: the list names inside `contribution.json` (Swift selected them by keypath). */
export enum ContributionList {
  MAINTAINERS = 'maintainers',
  CONTRIBUTORS = 'contributors',
  TRANSLATORS = 'translators'
}

export class Contribution {
  private static cached: Map<string, Contributor[]> = new Map<string, Contributor[]>();

  private static list(name: ContributionList): Contributor[] {
    const key: string = name.valueOf();
    const known: Contributor[] | undefined = Contribution.cached.get(key);
    if (known !== undefined) {
      return known;
    }
    const read: Contributor[] = readContributors(key);
    Contribution.cached.set(key, read);
    return read;
  }

  /** Source: `Contribution.maintainers`. */
  static get maintainers(): Contributor[] {
    return Contribution.list(ContributionList.MAINTAINERS);
  }

  /** Source: `Contribution.contributors`. */
  static get contributors(): Contributor[] {
    return Contribution.list(ContributionList.CONTRIBUTORS);
  }

  /** Source: `Contribution.translators`. */
  static get translators(): Contributor[] {
    return Contribution.list(ContributionList.TRANSLATORS);
  }
}
