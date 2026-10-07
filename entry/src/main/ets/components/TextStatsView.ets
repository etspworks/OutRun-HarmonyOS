/*
 * S3 structure — port of `TextStatsView` (OutRun/Views/Stats/TextStatsView.swift): a
 * the comment label under the card's WorkoutHeaderView, which the screen renders (this view is not a
 * StatsView subclass in source, so its header is a sibling). Its text is the source's
 * three-way composition — comment + blank line + the 'manually added' disclaimer when both apply,
 * the disclaimer alone when only isUserModified, otherwise the comment.
 */
import { localizedString } from '../common/LocalizedStrings';

@Component
export struct TextStatsView {
  /** Source: `workout.comment.value`. */
  @Prop comment: string = '';
  /** Source: `workout.isUserModified.value`. */
  @Prop isUserModified: boolean = false;

  build() {
    Column() {
      /** Source: `commentLabel` — systemFont 14, .secondaryColor, unlimited lines, left aligned. */
      Text(this.commentText())
        .width('100%')
        .fontSize(14)
        .fontColor($r('app.color.secondary_color'))
        .lineHeight(19)
        .textAlign(TextAlign.Start)
    }
    /* Source: `commentLabel` is inset 20 each side and 5 top/bottom of the card. */
    .width('100%')
    .padding({ left: 20, right: 20, top: 5, bottom: 5 })
    .backgroundColor($r('app.color.background_color'))
  }

  private commentText(): string {
    const modified: string = localizedString('Workout.IsUserModified.Text');
    if (this.isUserModified && this.comment !== '') {
      return `${this.comment}\n\n${modified}`;
    }
    return this.isUserModified ? modified : this.comment;
  }
}
