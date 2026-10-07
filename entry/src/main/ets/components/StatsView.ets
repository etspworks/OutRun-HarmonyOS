/*
 * S3 structure — port of `StatsView` (OutRun/Views/Stats/StatsView.swift): a WorkoutHeaderView over a
 * content view in which SMALL stat views are paired two-per-row (the source's fillEqually stack) and
 * BIG stat views (the diagrams) take a full row of their own. The card's children are passed in,
 * because each subclass — Distance/Time/Speed/Energy — decides which tiles exist from the stats.
 */
import { WorkoutHeaderView } from './WorkoutHeaderView';

@Component
export struct StatsView {
  @Prop title: string = '';
  @BuilderParam content: () => void;

  build() {
    Column() {
      WorkoutHeaderView({ title: this.title })
      Column() {
        this.content()
      }
      /*
       * Source: `contentView` (StatsView.swift:41-45) — 5 below the header and inset 20 each side;
       * its stat rows are 7 apart (`make.top.equalTo(last.snp.bottom).offset(7)`).
       */
      .width('100%')
      .padding({ left: 20, right: 20 })
      .margin({ top: 5 })
    }
    .width('100%')
    .backgroundColor($r('app.color.background_color'))
  }
}
