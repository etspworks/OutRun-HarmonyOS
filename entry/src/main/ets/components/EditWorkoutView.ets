/*
 * S3 structure — port of `EditWorkoutView` (OutRun/Views/Workout/EditWorkoutView.swift): the
 * WorkoutActionView titled LS["Edit"] whose action shows EditWorkoutController for this workout.
 */
import { localizedString } from '../common/LocalizedStrings';
import { WorkoutActionView } from './WorkoutActionView';

@Component
export struct EditWorkoutView {
  /** Source: `showDetailViewController(NavigationController(EditWorkoutController))`. */
  onEdit?: () => void;

  build() {
    WorkoutActionView({
      title: localizedString('Edit'),
      buttonId: 'workout_detail_edit',
      onAction: (): void => {
        this.edit();
      }
    })
  }

  private edit(): void {
    if (this.onEdit !== undefined) {
      this.onEdit();
    }
  }
}
