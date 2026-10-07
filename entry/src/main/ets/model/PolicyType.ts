/*
 * Port of `PolicyManager.PolicyType` (OutRun/Models/Settings/PolicyManager.swift:74-95),
 * including its two computed properties `title` and `urlExtension`.
 *
 * The fetch itself (PolicyManager.query, base URL + no-cache request) is a service and lives in
 * common/PolicyManager.ts over @ohos.net.http.
 */
import { localizedString } from '../common/LocalizedStrings';

export enum PolicyType {
  TERMS_OF_SERVICE = 'termsOfService',
  PRIVACY_POLICY = 'privacyPolicy'
}

/** Source: `PolicyType.title` — the screen title for this policy. */
export function policyTitle(type: PolicyType): string {
  return type === PolicyType.TERMS_OF_SERVICE
    ? localizedString('Settings.TermsOfService')
    : localizedString('Settings.PrivacyPolicy');
}

/** Source: `PolicyType.urlExtension` — appended to PolicyManager's base URL. */
export function policyUrlExtension(type: PolicyType): string {
  return type === PolicyType.TERMS_OF_SERVICE ? 'terms-of-service.txt' : 'privacy-policy.txt';
}
