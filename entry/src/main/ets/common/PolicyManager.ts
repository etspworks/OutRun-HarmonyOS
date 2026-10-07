/*
 * Port of `PolicyManager` (OutRun/Models/Settings/PolicyManager.swift:23-89) — the fetch behind the
 * Terms of Service and Privacy Policy rows in Settings.
 *
 * Endpoints: api_policy_terms_of_service / api_policy_privacy_policy, both
 * https://outrun.tadris.de/policies/<extension>, plain text. `PolicyType` and its `urlExtension`
 * are model/PolicyType.ts.
 *
 * The source set `cachePolicy = .reloadIgnoringLocalAndRemoteCacheData`: always the live document,
 * never a cached one. That is `usingCache: false` plus the no-store request headers, because the
 * HTTP cache the source was bypassing is both the local one and any intermediary's.
 */
import { http } from '@kit.NetworkKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { QA_SLOW_STATS_MS, qaFault } from './QaHooks';
import { PolicyType, policyUrlExtension } from '../model/PolicyType';

const DOMAIN: number = 0x0000;
const TAG: string = 'PolicyManager';

/** Source: the `(Bool, Error?, String?)` triple the completion closure took. */
export class PolicyQueryResult {
  readonly success: boolean;
  readonly error: BusinessError | null;
  readonly content: string | null;

  constructor(success: boolean, error: BusinessError | null, content: string | null) {
    this.success = success;
    this.error = error;
    this.content = content;
  }
}

export class PolicyManager {
  /** Source: `PolicyManager.baseURL`. */
  static readonly BASE_URL: string = 'https://outrun.tadris.de/policies/';

  /** Source: `query(for:completion:)`. Resolves (never rejects), like the source's closure. */
  static async query(type: PolicyType): Promise<PolicyQueryResult> {
    const url: string = PolicyManager.BASE_URL + policyUrlExtension(type);
    const request: http.HttpRequest = http.createHttp();
    try {
      if (qaFault('policySlow')) {
        // QA fault: a slow network, so the loading state lasts long enough to act on.
        await new Promise<void>((resolve: () => void): void => {
          setTimeout(resolve, QA_SLOW_STATS_MS);
        });
      }
      const headers: Record<string, string> = {
        'Cache-Control': 'no-cache, no-store',
        'Pragma': 'no-cache'
      };
      const options: http.HttpRequestOptions = {
        method: http.RequestMethod.GET,
        expectDataType: http.HttpDataType.STRING,
        usingCache: false,
        header: headers
      };
      const response: http.HttpResponse = await request.request(url, options);
      if (response.responseCode !== http.ResponseCode.OK) {
        hilog.error(DOMAIN, TAG, 'policy request answered %{public}d', response.responseCode);
        return new PolicyQueryResult(false, null, null);
      }
      const body: string = `${response.result}`;
      if (body.length === 0) {
        // Source: `data` present but undecodable / empty -> (false, nil, nil), no error to show.
        return new PolicyQueryResult(false, null, null);
      }
      // Both served policies open with "... apply to the iOS app "OutRun" ...". This build is not
      // the iOS app, so that one platform phrase is dropped (QA: Settings > Support, row 196).
      // ponytail: client-side rewrite of a legal text; a HarmonyOS policy on the website replaces it.
      return new PolicyQueryResult(true, null, body.replace('the iOS app "OutRun"', 'the app "OutRun"'));
    } catch (err) {
      const error: BusinessError = err as BusinessError;
      hilog.error(DOMAIN, TAG, 'policy request failed: %{public}s', JSON.stringify(error));
      return new PolicyQueryResult(false, error, null);
    } finally {
      request.destroy();
    }
  }
}
