/*
 * Port of `enum ApplicationState` (OutRun/Models/Data/ApplicationState.swift:23-25).
 *
 * Foreground/background is the only state the app observes; on HarmonyOS it is raised from
 * UIAbility onForeground/onBackground (see common/ApplicationStateObservation.ts).
 */
export enum ApplicationState {
  FOREGROUND = 'foreground',
  BACKGROUND = 'background'
}
