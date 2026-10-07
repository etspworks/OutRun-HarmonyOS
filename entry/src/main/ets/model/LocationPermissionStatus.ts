/*
 * Port of `PermissionManager.LocationPermissionStatus`
 * (OutRun/Models/PermissionManager.swift:85-87).
 *
 * The manager that produces this value (checkLocationPermission and friends) lives in
 * common/PermissionManager.ts over @ohos.abilityAccessCtrl; this module is the result type only.
 */
export enum LocationPermissionStatus {
  GRANTED = 'granted',
  RESTRICTED = 'restricted',
  DENIED = 'denied',
  ERROR = 'error'
}
