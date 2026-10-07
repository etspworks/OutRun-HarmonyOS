/*
 * S3 structure — port of `DeleteWorkoutView` (OutRun/Views/Workout/DeleteWorkoutView.swift): the
 * WorkoutActionView titled LS["Delete"] in .systemRed. Its destructive confirmation chain (delete
 * alert, then the 'also delete in Apple Health?' alert when healthKitUUID is set) belongs to the
 * screen, which owns the services those steps call.
 */
import { localizedString } from '../common/LocalizedStrings';
import { WorkoutActionView } from './WorkoutActionView';

@Component
export struct DeleteWorkoutView {
  /** Source: `action(button:)` — the confirm alert chain, run by the screen. */
  onDelete?: () => void;

  build() {
    WorkoutActionView({
      title: localizedString('Delete'),
      buttonId: 'workout_detail_delete',
      destructive: true,
      onAction: (): void => {
        this.delete();
      }
    })
  }

  private delete(): void {
    if (this.onDelete !== undefined) {
      this.onDelete();
    }
  }
}
