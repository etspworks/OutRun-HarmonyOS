/*
 * Port of `BurnedEnergyCalculator` (OutRun/Models/Workout/BurnedEnergyCalculator.swift:23-48).
 *
 * The app's energy model, in two lines of arithmetic and its inverse:
 *   calories == MET(speed in km/h * METSpeedMultiplier) * weight * hours
 *            == kilometers * METSpeedMultiplier * weight
 * so distance and body weight are enough and the duration cancels out. The per-type multiplier is
 * `workoutTypeMetSpeedMultiplier` (model/WorkoutType.ts), the source's `METSpeedMultiplier`.
 *
 * common/DataManager.ts currently carries a private copy of the forward formula
 * (`burnedKilocalories`, DataManager.ts:241) from before this module existed; it should import
 * `calculateBurnedCalories` instead, and takes kcal as a plain number where this returns the
 * source's Measurement.
 */
import { Measurement, Unit } from './Measurement';
import { WorkoutType, workoutTypeMetSpeedMultiplier } from '../model/WorkoutType';

export class BurnedEnergyCalculator {

  /**
   * Source: `calculateBurnedCalories(for:distance:weight:)`.
   * @param distance metres, as stored on the workout. @param weight kilograms.
   */
  static calculateBurnedCalories(type: WorkoutType, distance: number, weight: number): Measurement {
    const kilometers: number = distance / 1000;
    const burnedCal: number = kilometers * workoutTypeMetSpeedMultiplier(type) * weight;
    return new Measurement(burnedCal, Unit.KILOCALORIES);
  }

  /**
   * Source: `calculeWeightBeforeWorkout(for:distance:burnedCal:)` (the source's spelling) — the
   * same equation solved for weight, used when a workout arrives with an energy value but the user
   * has no weight on file. Infinite for a zero distance, exactly as in the source.
   */
  static calculeWeightBeforeWorkout(type: WorkoutType, distance: number, burnedCal: number): number {
    const kilometers: number = distance / 1000;
    return burnedCal / (kilometers * workoutTypeMetSpeedMultiplier(type));
  }
}
