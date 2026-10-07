/*
 * S3 structure — port of `WorkoutViewController`
 * (OutRun/Controllers/Workout/WorkoutViewController.swift) plus the `DetailViewController` chrome it
 * inherits: the headline (the workout's type), the date line, the share and close icon buttons, and
 * a scrolling stack of stats cards over the three action rows.
 *
 * WHICH cards exist is decided by the DATA, as in source (plan variants has_route_and_energy /
 * has_route / has_energy / no_route_no_energy / has_comment_or_modified): Distance, Time and Speed
 * always; the Energy card only with an energy value; the Route card only with route samples; the
 * Comment card only with a comment or the user-modified flag. Until DataQueryManager.queryStats
 * returns there is only the chrome and a centred LoadingView (variant stats_loading), and a nil
 * result raises the source's loading error whose dismissal closes the screen (stats_failed).
 * Every tile is bound to svc_data_query_manager / svc_workout_stats for THIS workout — no number
 * comes from the capture. No styling in S3.
 */
import { router } from '@kit.ArkUI';
import { relationalStore } from '@kit.ArkData';
import { image } from '@kit.ImageKit';
import { drawing, common2D } from '@kit.ArkGraphics2D';
import { Workout } from '../model/Workout';
import { WorkoutStats, CachedStatsSeries } from '../model/WorkoutStats';
import { WorkoutMapImageSize } from '../model/WorkoutMapImageSize';
import { WorkoutType, workoutTypeDescription, workoutTypeFromRaw } from '../model/WorkoutType';
import { RelativeMeasurement } from '../model/RelativeMeasurement';
import { Measurement } from '../common/Measurement';
import { LineChartData } from '../common/ChartData';
import { DataManager, TABLE_WORKOUT } from '../common/DataManager';
import { closeTo } from '../common/NavBack';
import { WorkoutStatsService } from '../common/WorkoutStatsService';
import { WorkoutMapImageManager, WorkoutMapImageRequest } from '../common/WorkoutMapImageManager';
import { WorkoutMapViewManager } from '../common/WorkoutMapViewManager';
import { map, mapCommon } from '@kit.MapKit';
import { HealthStoreManager } from '../common/HealthStoreManager';
import { UserPreferences } from '../common/UserPreferences';
import { CustomMeasurementFormatting, CustomTimeFormatting } from '../common/Formatting';
import { localizedString } from '../common/LocalizedStrings';
import { showConfirmAlert, showErrorAlert } from '../common/AlertDialogs';
import { WorkoutShareAlertPage } from './WorkoutShareAlertPage';
import { LoadingView } from '../components/LoadingView';
import { WorkoutHeaderView } from '../components/WorkoutHeaderView';
import { StatsView } from '../components/StatsView';
import { LabelledDataView } from '../components/LabelledDataView';
import { LabelledRelativeDataView } from '../components/LabelledRelativeDataView';
import { LabelledTimeView } from '../components/LabelledTimeView';
import { LabelledDiagramView } from '../components/LabelledDiagramView';
import { DistanceStatsView } from '../components/DistanceStatsView';
import { TimeStatsView } from '../components/TimeStatsView';
import { SpeedStatsView } from '../components/SpeedStatsView';
import { EnergyStatsView } from '../components/EnergyStatsView';
import { RouteStatsView } from '../components/RouteStatsView';
import { TextStatsView } from '../components/TextStatsView';
import { WorkoutActionView } from '../components/WorkoutActionView';
import { EditWorkoutView } from '../components/EditWorkoutView';
import { DeleteWorkoutView } from '../components/DeleteWorkoutView';

/**
 * S5 style: a `DetailViewController` — the date line and headline at the top left, the share and
 * close glyphs at the top right, both black template PNGs tinted by `window.tintColor =
 * .accentColor` (AppDelegate.swift:350) through a SRC_IN blend filter (`fillColor` is SVG-only).
 * Each stats card is a `StatsView` on .backgroundColor with an .accentColor header, and every card
 * and action view is 20 below the last one (`setupContent()`).
 */
const ACCENT: common2D.Color = { alpha: 255, red: 255, green: 146, blue: 0 };
const ACCENT_TINT: drawing.ColorFilter =
  drawing.ColorFilter.createBlendModeColorFilter(ACCENT, drawing.BlendMode.SRC_IN);
/** The overlay THIS page hosts (the AppStorage key `EntryAbility` leaves a deep-link in is
 * 'deepLinkOverlay', read by the @StorageLink below): the share button on
 * `WorkoutViewController` presents `WorkoutShareAlert`. */
const SHARE_ALERT_OVERLAY: string = 'WorkoutShareAlert';
/** How long after the share sheet opens a tap on its mask is still treated as part of the opening tap. */
const SHEET_TAP_GUARD_MS: number = 500;
/** The route thumbnail's inset, like the source snapshot's 10% slack around the route. */
const THUMBNAIL_ROUTE_PADDING: mapCommon.Padding = { top: 30, left: 30, bottom: 30, right: 30 };

@Entry
@Component
struct WorkoutViewControllerPage {
  /** Source: `workout` — handed in by the list (here its uuid, through the route param). */
  @State workout: Workout | null = null;
  /** Source: `DataQueryManager.queryStats(for:)`. */
  @State stats: WorkoutStats | null = null;
  /** Source: `loadingView.isHidden = true` once the query returns (plan variant stats_loading). */
  @State isLoading: boolean = true;
  /** Source: `stats.queryAltitudes { ... }` — the Distance card's diagram. */
  @State altitudeSeries: LineChartData | null = null;
  /** Source: `stats.querySpeeds { ... }` — the Speed card's diagram. */
  @State speedSeries: LineChartData | null = null;
  /** Source: `RouteStatsView.loadImage()` — WorkoutMapImageManager's render for this workout. */
  @State routeMapImage: image.PixelMap | null = null;
  /** Source: `share()` presenting WorkoutShareAlert — the hosted overlay's state. */
  @State isShareAlertShown: boolean = false;
  /** Source: `appleHealthView.titleClosure()` — re-read after a successful add/remove. */
  @State healthKitUUID: string | null = null;
  /**
   * The overlay deep-link channel, READ REACTIVELY. `EntryAbility` stamps this key on EVERY deep
   * link — cold (before `loadContent`) and warm (`onNewWant`, where this page is already on the
   * router stack and `aboutToAppear` never runs again), so consuming it only in `aboutToAppear`
   * mounted the sheet on the first launch of this host and on no later one. `@Watch` fires on the
   * warm write, `onPageShow()` covers a return to this page, and the consume clears the key back
   * to '' — which is also what makes re-arming the SAME overlay a CHANGE the watch can see.
   */
  @StorageLink('deepLinkOverlay') @Watch('onDeepLinkOverlayChanged') deepLinkOverlay: string = '';

  private shareAlert: CustomDialogController = new CustomDialogController({
    builder: WorkoutShareAlertPage({
      /** Source: `WorkoutShareAlert(workout: workout, controller: self)` — the sheet exports the
       * host's current workout itself, as the source's two options do. */
      workout: this.workout,
      isShown: $isShareAlertShown
    }),
    autoCancel: true,
    /**
     * S5: a UIAlertController `.actionSheet` rises from the BOTTOM and draws its own two inset
     * cards (capture S0061), so ArkUI's white container and insets are dropped and the dialog is
     * bottom-aligned; the dim behind it is the dialog's default mask, as UIKit's is.
     */
    customStyle: true,
    alignment: DialogAlignment.Bottom,
    /*
     * UIKit ignores touches while a sheet is still presenting, so a double tap on Share leaves the
     * sheet open. Here the second tap lands on the mask and closed it again: a touch-outside within
     * SHEET_TAP_GUARD_MS of opening is swallowed; every other dismissal goes through.
     */
    onWillDismiss: (action: DismissDialogAction): void => {
      if (action.reason === DismissReason.TOUCH_OUTSIDE
        && Date.now() - this.shareOpenedAt < SHEET_TAP_GUARD_MS) {
        return;
      }
      this.isShareAlertShown = false;
      action.dismiss();
    }
  });
  private shareOpenedAt: number = 0;

  /** Source: `viewDidLoad` -> `setupContent()`. */
  aboutToAppear(): void {
    const params: Record<string, string> = router.getParams() as Record<string, string>;
    let uuid: string | undefined = params !== undefined && params !== null
      ? params['workoutUUID'] : undefined;
    if (uuid === undefined || uuid === null || uuid === '') {
      // A deep link's `workoutUUID` (EntryAbility) stands in for the router param, read once.
      uuid = AppStorage.get<string>('deepLinkWorkoutUUID');
      AppStorage.setOrCreate<string>('deepLinkWorkoutUUID', '');
    }
    if (uuid === undefined || uuid === null || uuid === '') {
      /* No workout in the params: resolve the one the source's list would have handed over. */
      this.loadMostRecentWorkout();
      this.presentDeepLinkOverlay();
      return;
    }
    this.setupContent(uuid);
    this.presentDeepLinkOverlay();
  }

  /** The warm half of the deep-link channel: this page is already up, so nothing re-runs
   * `aboutToAppear` — the AppStorage write itself has to mount the overlay. */
  onDeepLinkOverlayChanged(): void {
    this.presentDeepLinkOverlay();
  }

  /** A deep link that pushed this page again, or a return to it, shows it without constructing
   * it — the key is still armed in both cases. */
  onPageShow(): void {
    this.presentDeepLinkOverlay();
  }

  /**
   * The pipeline's deep-link channel for the overlay this page HOSTS: `EntryAbility` cannot route to
   * `WorkoutShareAlert` (it is a `@CustomDialog`, not a page), so it opens this host and leaves the
   * overlay's name in AppStorage for us to mount — the same channel the change log uses on the
   * timeline. Source-faithful in WHAT it shows: the sheet's own options read `this.workout`, so on a
   * store with no workout it offers them over an empty detail rather than inventing one.
   */
  private presentDeepLinkOverlay(): void {
    if (this.deepLinkOverlay !== SHARE_ALERT_OVERLAY) {
      return;
    }
    this.deepLinkOverlay = '';
    if (this.isShareAlertShown) {
      return;
    }
    this.isShareAlertShown = true;
    this.shareAlert.open();
  }

  build() {
    Column() {
      /** Source: `headlineContainerView` — the date line over the headline, share and close. */
      Row() {
        Column() {
          /** Source: `dateLabel` — 14 .bold .secondaryColor, uppercased, sitting on the headline. */
          Text(this.dateText())
            .fontSize(14)
            .fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.secondary_color'))
            .maxLines(1)
            /* Capture S0050: the date line occupies y 80-97 (17pt) over the 39pt headline. */
            .lineHeight(17)
            .width('100%')
          /** Source: `headline = workout?.type.description` — 32 .heavy .withLowerCaseSmallCaps. */
          Text(this.headline())
            .fontSize(32)
            .fontWeight(900)
            .fontFeature('"smcp" 1')
            .lineHeight(39)
            .fontColor($r('app.color.primary_color'))
            .maxLines(1)
            .width('100%')
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        /*
         * S6: the headline block sits BELOW the bar buttons, not level with them — capture S0050
         * has close at y 18 and the date line at y 33 in this page's own coordinates.
         */
        .margin({ top: 15 })
        Blank()
        /** Source: `shareButton` -> share(), 32x32 tinted by window.tintColor = .accentColor. */
        Image($r('app.media.share'))
          .width(32)
          .height(32)
          .objectFit(ImageFit.Contain)
          .colorFilter(ACCENT_TINT)
          .margin({ right: 10 })
          .id('workout_detail_share')
          .onClick(() => {
            this.share();
          })
        /** Source: `DetailViewController.closeButton` -> close(). */
        Image($r('app.media.close'))
          .width(36)
          .height(36)
          .objectFit(ImageFit.Contain)
          .colorFilter(ACCENT_TINT)
          .id('detail_close')
          .onClick(() => {
            this.close();
          })
      }
      .width('100%')
      .alignItems(VerticalAlign.Top)
      /*
       * Source: headlineLabel top 40 / left 20 / bottom -10; closeButton top 8 / right -10.
       * S6, measured off capture S0050 in this page's own coordinates (window minus the 47pt
       * status bar the app never draws under): close at y 18, first stats header at y 98.
       */
      .padding({ left: 20, right: 10, top: 18, bottom: 10 })
      /** Source: `loadingView` over the content until queryStats returns — centred in the body. */
      if (this.isLoading) {
        Column() {
          LoadingView()
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      } else if (this.stats !== null) {
        /* Source: the stats views are only built in queryStats' success branch; a nil result shows
         * the load-error alert over the bare headline, never a set of '--' cards. */
        Scroll() {
          /* Source: `setupContent()` — every card and action view is 20 below the last one. */
          Column({ space: 20 }) {
            /**
             * Source: `DistanceStatsView(stats:)` — a StatsView subclass. ArkUI has no struct
             * inheritance, so the titled frame is StatsView and the card body is the subclass's
             * view, handed the tiles its `init` chose from the stats.
             */
            StatsView({ title: localizedString('Workout.Distance') }) {
              DistanceStatsView() {
                this.distanceTiles()
              }
            }
            StatsView({ title: localizedString('WorkoutStats.Time') }) {
              TimeStatsView() {
                this.timeTiles()
              }
            }
            StatsView({ title: localizedString('WorkoutStats.Speed') }) {
              SpeedStatsView() {
                this.speedTiles()
              }
            }
            /** Source: `if stats.hasEnergyValue` — the card is absent otherwise. */
            if (this.hasEnergyValue()) {
              StatsView({ title: localizedString('WorkoutStats.BurnedEnergy') }) {
                EnergyStatsView() {
                  this.energyTiles()
                }
              }
            }
            /** Source: `if stats.hasRouteSamples` — the route card is the last content view. */
            if (this.hasRouteSamples()) {
              Column() {
                /** Source: RouteStatsView's own headerView — a sibling, not a StatsView frame. */
                WorkoutHeaderView({ title: localizedString('WorkoutStats.Route') })
                RouteStatsView({
                  hasRouteData: this.hasRouteSamples(),
                  mapImage: this.routeMapImage,
                  onOpenMap: (): void => {
                    this.openMap();
                  },
                  onDrawRoute: (controller: map.MapComponentController): void => {
                    const current: Workout | null = this.workout;
                    if (current !== null) {
                      WorkoutMapViewManager.setupRoute(current, controller, THUMBNAIL_ROUTE_PADDING);
                    }
                  }
                })
              }
              .width('100%')
            }
            /** Source: `if workout.comment != nil || workout.isUserModified`. */
            if (this.hasComment()) {
              Column() {
                /** Source: TextStatsView's own headerView — also a sibling in source. */
                WorkoutHeaderView({ title: localizedString('Workout.Comment') })
                TextStatsView({
                  comment: this.commentText(),
                  isUserModified: this.isUserModified()
                })
              }
              .width('100%')
            }
            /** Source: `appleHealthView` — its title follows the workout's health link. */
            WorkoutActionView({
              title: this.healthKitUUID !== null
                ? localizedString('AppleHealth.Remove') : localizedString('AppleHealth.Add'),
              buttonId: 'workout_detail_apple_health',
              onAction: (): void => {
                this.toggleAppleHealth();
              }
            })
              /* Source: `appleHealthView` is inset 20 each side. */
              .margin({ left: 20, right: 20 })
            /* Source: `editView.right.equalTo(deleteView.snp.left).offset(-20)`, equal widths. */
            Row({ space: 20 }) {
              EditWorkoutView({
                onEdit: (): void => {
                  this.openEditor();
                }
              })
                .layoutWeight(1)
              DeleteWorkoutView({
                onDelete: (): void => {
                  this.deleteWorkout();
                }
              })
                .layoutWeight(1)
            }
            .width('100%')
            .padding({ left: 20, right: 20 })
          }
          .width('100%')
          /* Source: `deleteView.bottom.equalToSuperview().offset(-20)`. */
          .padding({ bottom: 20 })
        }
        .layoutWeight(1)
        .width('100%')
        .align(Alignment.Top)
        .scrollBar(BarState.Off)
      }
    }
    .id('WorkoutViewControllerPage')
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background_color'))
  }

  /**
   * Source: `DistanceStatsView.init(stats:)` — Distance always; Steps (titled 'Pedal Strokes' for a
   * cycling workout) only when stats.steps != nil; Ascending/Descending altitude only when present;
   * the 'Altitude Over Time' diagram only when the workout has route samples.
   */
  @Builder
  distanceTiles() {
    Row({ space: 10 }) {
      LabelledDataView({
        title: localizedString('Workout.Distance'),
        value: this.measurementText(this.distanceValue(), false)
      })
      if (this.steps() !== null) {
        LabelledDataView({ title: this.stepsTitle(), value: this.measurementText(this.steps(), false) })
      }
    }
    .width('100%')
    Row({ space: 10 }) {
      if (this.ascendingAltitude() !== null) {
        LabelledDataView({
          title: localizedString('WorkoutStats.AscendingAltitude'),
          value: this.measurementText(this.ascendingAltitude(), false)
        })
      }
      if (this.descendingAltitude() !== null) {
        LabelledDataView({
          title: localizedString('WorkoutStats.DescendingAltitude'),
          value: this.measurementText(this.descendingAltitude(), false)
        })
      }
    }
    .width('100%')
    if (this.hasRouteSamples()) {
      LabelledDiagramView({
        title: localizedString('WorkoutStats.AltitudeOverTime'),
        data: $altitudeSeries,
        selectionEnabled: false
      })
    }
  }

  /**
   * Source: `TimeStatsView.init(stats:)` — without a pause: Active Duration, pace, Start, End; with
   * one: Active Duration, Pause Duration, Start, End and the pace LAST (plan variant has_pause).
   */
  @Builder
  timeTiles() {
    Row({ space: 10 }) {
      LabelledDataView({
        title: localizedString('Workout.ActiveDuration'),
        value: this.measurementText(this.activeDuration(), true)
      })
      if (this.pauseDuration() !== 0) {
        LabelledDataView({
          title: localizedString('Workout.PauseDuration'),
          value: this.measurementText(this.pauseMeasurement(), true)
        })
      } else {
        LabelledRelativeDataView({ value: this.paceText(), relativeUnit: this.paceUnit() })
      }
    }
    .width('100%')
    Row({ space: 10 }) {
      LabelledTimeView({
        title: localizedString('WorkoutStats.StartTime'),
        timeText: this.timeText(this.startDate())
      })
      LabelledTimeView({
        title: localizedString('WorkoutStats.EndTime'),
        timeText: this.timeText(this.endDate())
      })
    }
    .width('100%')
    if (this.pauseDuration() !== 0) {
      Row({ space: 10 }) {
        LabelledRelativeDataView({ value: this.paceText(), relativeUnit: this.paceUnit() })
      }
      .width('100%')
    }
  }

  /**
   * Source: `SpeedStatsView.init(stats:)` — Average Speed always; Top Speed and the
   * 'Speed Over Time' diagram only when the workout has route samples.
   */
  @Builder
  speedTiles() {
    Row({ space: 10 }) {
      LabelledDataView({
        title: localizedString('WorkoutStats.AverageSpeed'),
        value: this.measurementText(this.averageSpeed(), false)
      })
      if (this.hasRouteSamples()) {
        LabelledDataView({
          title: localizedString('WorkoutStats.TopSpeed'),
          value: this.measurementText(this.topSpeed(), false)
        })
      }
    }
    .width('100%')
    if (this.hasRouteSamples()) {
      LabelledDiagramView({
        title: localizedString('WorkoutStats.SpeedOverTime'),
        data: $speedSeries,
        selectionEnabled: false
      })
    }
  }

  /** Source: `EnergyStatsView.init(stats:)` — Total Energy plus the time-relative energy. */
  @Builder
  energyTiles() {
    LabelledDataView({
      title: localizedString('WorkoutStats.TotalEnergy'),
      value: this.measurementText(this.burnedEnergy(), false)
    })
    LabelledRelativeDataView({
      value: this.relativeEnergyText(),
      relativeUnit: this.relativeEnergyUnit()
    })
  }

  /** Source: `setupContent()` — load the workout, query its stats, then the two series. */
  private setupContent(uuid: string): void {
    /* A deep link into a COLD start reaches here before the store is open, so wait for it. */
    DataManager.ready().then((): void => {
      DataManager.workout(uuid).then((stored: Workout | null): void => {
        if (stored === null) {
          this.reportLoadingError();
          return;
        }
        DataManager.hydrate(stored).then((workout: Workout): void => {
          this.workout = workout;
          this.healthKitUUID = workout.healthKitUUID;
          this.queryStats(workout);
        }).catch((err: Error): void => {
          this.reportLoadingError();
        });
      }).catch((err: Error): void => {
        this.reportLoadingError();
      });
    }).catch((err: Error): void => {
      this.reportLoadingError();
    });
  }

  /**
   * The source never presents this screen without a workout: `WorkoutListViewController
   * .tableView(_:didSelectRowAt:)` hands over `DataManager.workoutMonitor[section, row]`, whose
   * default sort is day-descending (`WorkoutListSortType.day(true)`). The pipeline's deep link
   * carries no workout id, so a param-less entry resolves the SAME workout that list shows first —
   * the most recent stored one — instead of rendering the nil header. A genuinely empty store
   * keeps the source's nil rendering.
   */
  private loadMostRecentWorkout(): void {
    DataManager.ready().then((): void => {
      const predicates: relationalStore.RdbPredicates =
        new relationalStore.RdbPredicates(TABLE_WORKOUT);
      predicates.orderByDesc('startDate').limitAs(1);
      DataManager.loadWorkouts(predicates, false).then((workouts: Workout[]): void => {
        const uuid: string | null = workouts.length === 0 ? null : workouts[0].uuid;
        if (uuid === null) {
          this.isLoading = false;
          return;
        }
        this.setupContent(uuid);
      }).catch((err: Error): void => {
        this.isLoading = false;
      });
    }).catch((err: Error): void => {
      this.isLoading = false;
    });
  }

  /** Source: `DataQueryManager.queryStats(for:)`; a nil result is the loading error. */
  private queryStats(workout: Workout): void {
    WorkoutStatsService.statsFor(workout).then((stats: WorkoutStats | null): void => {
      this.isLoading = false;
      if (stats === null) {
        this.reportLoadingError();
        return;
      }
      this.stats = stats;
      if (stats.hasRouteSamples) {
        this.queryAltitudes(stats);
        this.querySpeeds(stats);
        this.loadRouteImage(workout);
      }
    }).catch((err: Error): void => {
      this.isLoading = false;
      this.reportLoadingError();
    });
  }

  /** Source: `stats.queryAltitudes { series.convertedForChartView(... altitude unit) }`. */
  private queryAltitudes(stats: WorkoutStats): void {
    WorkoutStatsService.queryAltitudes(stats).then((cached: CachedStatsSeries): void => {
      if (cached.series !== null) {
        this.altitudeSeries = cached.series.convertedForChartView(false,
          UserPreferences.altitudeMeasurementType.safeValue);
      }
    }).catch((err: Error): void => {
    });
  }

  /** Source: `stats.querySpeeds { series.convertedForChartView(... speed unit) }`. */
  private querySpeeds(stats: WorkoutStats): void {
    WorkoutStatsService.querySpeeds(stats).then((cached: CachedStatsSeries): void => {
      if (cached.series !== null) {
        this.speedSeries = cached.series.convertedForChartView(false,
          UserPreferences.speedMeasurementType.safeValue);
      }
    }).catch((err: Error): void => {
    });
  }

  /** Source: `RouteStatsView.loadImage()` — WorkoutMapImageRequest(size: .stats, highPriority). */
  private loadRouteImage(workout: Workout): void {
    const request: WorkoutMapImageRequest = new WorkoutMapImageRequest(workout.uuid,
      WorkoutMapImageSize.STATS, true,
      (success: boolean, mapImage: image.PixelMap | null): void => {
        this.routeMapImage = mapImage;
      });
    WorkoutMapImageManager.execute(request).catch((err: Error): void => {
    });
  }

  /** Source: `displayError(LS["WorkoutViewController.LoadingError"]) { self.close() }`. */
  private reportLoadingError(): void {
    this.isLoading = false;
    showErrorAlert(localizedString('WorkoutViewController.LoadingError')).then((): void => {
      this.close();
    }).catch((err: Error): void => {
    });
  }

  /** Source: `headline = workout?.type.description ?? "ERROR"` — the fallback is the source's. */
  private headline(): string {
    const current: Workout | null = this.workout;
    return current !== null
      ? workoutTypeDescription(workoutTypeFromRaw(current.workoutType)) : 'ERROR';
  }

  /**
   * Source: `dateLabel.text` — the day string, plus ' - RACE' when the workout is a race. With no
   * workout the source still draws the line, off `Date(timeIntervalSince1970: 0)`
   * (WorkoutViewController.swift:52), so the header is never an empty label.
   */
  private dateText(): string {
    const current: Workout | null = this.workout;
    const date: Date = current !== null ? current.startDate : new Date(0);
    const day: string = CustomTimeFormatting.dayString(date).toUpperCase();
    return current !== null && current.isRace
      ? `${day} - ${localizedString('Workout.Race').toUpperCase()}` : day;
  }

  private hasRouteSamples(): boolean {
    const current: WorkoutStats | null = this.stats;
    return current !== null ? current.hasRouteSamples : false;
  }

  private hasEnergyValue(): boolean {
    const current: WorkoutStats | null = this.stats;
    return current !== null ? current.hasEnergyValue : false;
  }

  /** Source: `workout.comment != nil || workout.isUserModified`. */
  private hasComment(): boolean {
    const current: Workout | null = this.workout;
    if (current === null) {
      return false;
    }
    return current.comment !== null || current.isUserModified;
  }

  private commentText(): string {
    const current: Workout | null = this.workout;
    if (current === null || current.comment === null) {
      return '';
    }
    return current.comment;
  }

  private isUserModified(): boolean {
    const current: Workout | null = this.workout;
    return current !== null ? current.isUserModified : false;
  }

  /** Source: `share()` — present WorkoutShareAlert for this workout. */
  private share(): void {
    this.shareOpenedAt = Date.now();
    this.isShareAlertShown = true;
    this.shareAlert.open();
  }

  /**
   * Source: `appleHealthView`'s action — save when the workout has no health link, delete when it
   * has one; on success the title flips, on failure the source's error alert is shown.
   */
  private toggleAppleHealth(): void {
    const current: Workout | null = this.workout;
    if (current === null) {
      return;
    }
    if (this.healthKitUUID === null) {
      HealthStoreManager.saveHealthWorkout(current).then((uuid: string | null): void => {
        if (uuid === null) {
          this.reportHealthError('AppleHealth.Add.Error');
          return;
        }
        this.healthKitUUID = uuid;
      }).catch((err: Error): void => {
        this.reportHealthError('AppleHealth.Add.Error');
      });
      return;
    }
    HealthStoreManager.deleteHealthWorkout(current).then((success: boolean): void => {
      if (!success) {
        this.reportHealthError('AppleHealth.Remove.Error');
        return;
      }
      this.healthKitUUID = null;
    }).catch((err: Error): void => {
      this.reportHealthError('AppleHealth.Remove.Error');
    });
  }

  private reportHealthError(key: string): void {
    showErrorAlert(localizedString(key)).catch((err: Error): void => {
    });
  }

  /**
   * Source: `DeleteWorkoutView.action(button:)` — the destructive confirm alert, then, when the
   * workout is linked to the health store, a second 'also delete there?' alert; either way
   * DataManager.delete runs and the screen closes on success.
   */
  private deleteWorkout(): void {
    /*
     * Source `DeleteWorkoutView.action(button:)` raises the alert UNCONDITIONALLY — the workout is
     * only needed once Delete is confirmed. Guarding the whole chain on a loaded workout made the
     * destructive button a silent no-op whenever the store had not handed one back.
     */
    const current: Workout | null = this.workout;
    showConfirmAlert(localizedString('WorkoutDeletion.Title'),
      localizedString('WorkoutDeletion.Message'), localizedString('Delete'), true)
      .then((confirmed: boolean): void => {
        if (!confirmed || current === null) {
          return;
        }
        /* Re-bound non-null so the nested alert closures below need no further narrowing. */
        const workout: Workout = current;
        if (workout.healthKitUUID === null) {
          this.performDelete(workout);
          return;
        }
        showConfirmAlert(localizedString('WorkoutDeletion.AppleHealth.Title'),
          localizedString('WorkoutDeletion.AppleHealth.Message'), localizedString('Delete'), true)
          .then((alsoHealth: boolean): void => {
            if (!alsoHealth) {
              this.performDelete(workout);
              return;
            }
            HealthStoreManager.deleteHealthWorkout(workout).then((success: boolean): void => {
              if (!success) {
                showErrorAlert(localizedString('WorkoutDeletion.Error.AppleHealth.Message'))
                  .then((): void => {
                    this.performDelete(workout);
                  }).catch((err: Error): void => {
                  });
                return;
              }
              this.performDelete(workout);
            }).catch((err: Error): void => {
              this.performDelete(workout);
            });
          }).catch((err: Error): void => {
          });
      }).catch((err: Error): void => {
      });
  }

  /** Source: `deleteWorkout()` — DataManager.delete, then close on success. */
  private performDelete(workout: Workout): void {
    DataManager.delete(workout).then((success: boolean): void => {
      if (!success) {
        showErrorAlert(localizedString('WorkoutDeletion.Error.Message')).catch(
          (err: Error): void => {
          });
        return;
      }
      this.close();
    }).catch((err: Error): void => {
      showErrorAlert(localizedString('WorkoutDeletion.Error.Message')).catch((err: Error): void => {
      });
    });
  }

  /** Source: every tile's `measurement` argument — svc_workout_stats, via svc_formatting. */
  private measurementText(measurement: Measurement | null, asClock: boolean): string {
    if (measurement === null) {
      return '';
    }
    return CustomMeasurementFormatting.string(measurement,
      CustomMeasurementFormatting.typeForUnit(measurement.unit, asClock));
  }

  private distanceValue(): Measurement | null {
    const current: WorkoutStats | null = this.stats;
    return current !== null ? current.distance : null;
  }

  private steps(): Measurement | null {
    const current: WorkoutStats | null = this.stats;
    return current !== null ? current.steps : null;
  }

  /** Source: `stats.type == .cycling ? LS["Workout.Strokes"] : LS["Workout.Steps"]`. */
  private stepsTitle(): string {
    const current: WorkoutStats | null = this.stats;
    const cycling: boolean = current !== null && current.type === WorkoutType.CYCLING;
    return cycling ? localizedString('Workout.Strokes') : localizedString('Workout.Steps');
  }

  private ascendingAltitude(): Measurement | null {
    const current: WorkoutStats | null = this.stats;
    return current !== null ? current.ascendingAltitude : null;
  }

  private descendingAltitude(): Measurement | null {
    const current: WorkoutStats | null = this.stats;
    return current !== null ? current.descendingAltitude : null;
  }

  private activeDuration(): Measurement | null {
    const current: WorkoutStats | null = this.stats;
    return current !== null ? current.activeDuration : null;
  }

  private pauseMeasurement(): Measurement | null {
    const current: WorkoutStats | null = this.stats;
    return current !== null ? current.pauseDuration : null;
  }

  /**
   * Source: `stats.pauseDuration.doubleValue` — the value the TimeStatsView branches on
   * (`if stats.pauseDuration.doubleValue == 0`): the Pause Duration tile and the tile ORDER both
   * depend on it (plan variant has_pause).
   */
  private pauseDuration(): number {
    const pause: Measurement | null = this.pauseMeasurement();
    return pause !== null ? pause.doubleValue() : 0;
  }

  private startDate(): Date | null {
    const current: WorkoutStats | null = this.stats;
    return current !== null ? current.startDate : null;
  }

  private endDate(): Date | null {
    const current: WorkoutStats | null = this.stats;
    return current !== null ? current.endDate : null;
  }

  private timeText(date: Date | null): string {
    return date !== null ? CustomTimeFormatting.timeString(date) : '';
  }

  /** Source: `stats.pace` — relative to the user's preferred distance unit. */
  private pace(): RelativeMeasurement | null {
    const current: WorkoutStats | null = this.stats;
    return current !== null
      ? current.pace(UserPreferences.distanceMeasurementType.safeValue) : null;
  }

  private paceText(): string {
    const value: RelativeMeasurement | null = this.pace();
    return value !== null ? value.stringRepresentation() : '';
  }

  private paceUnit(): string {
    const value: RelativeMeasurement | null = this.pace();
    return value !== null ? value.relativeUnit() : '';
  }

  private averageSpeed(): Measurement | null {
    const current: WorkoutStats | null = this.stats;
    return current !== null ? current.averageSpeed : null;
  }

  private topSpeed(): Measurement | null {
    const current: WorkoutStats | null = this.stats;
    return current !== null ? current.topSpeed : null;
  }

  private burnedEnergy(): Measurement | null {
    const current: WorkoutStats | null = this.stats;
    return current !== null ? current.burnedEnergy : null;
  }

  /** Source: `stats.timeRelativeBurnedEnergy` — in the user's preferred energy unit. */
  private relativeEnergy(): RelativeMeasurement | null {
    const current: WorkoutStats | null = this.stats;
    return current !== null
      ? current.timeRelativeBurnedEnergy(UserPreferences.energyMeasurementType.safeValue) : null;
  }

  private relativeEnergyText(): string {
    const value: RelativeMeasurement | null = this.relativeEnergy();
    return value !== null ? value.stringRepresentation() : '';
  }

  private relativeEnergyUnit(): string {
    const value: RelativeMeasurement | null = this.relativeEnergy();
    return value !== null ? value.relativeUnit() : '';
  }

  /**
   * Source: `close()` — dismiss(animated: true) back to the workout list (the screen's pop
   * target). `closeTo` keeps that true when this page was opened as the router root.
   */
  private close(): void {
    closeTo('pages/WorkoutListViewControllerPage');
  }

  /** Source: `EditWorkoutView.action(button:)` — EditWorkoutController for this workout. */
  private openEditor(): void {
    const current: Workout | null = this.workout;
    router.pushUrl({
      url: 'pages/EditWorkoutControllerPage',
      params: { 'workoutUUID': current !== null ? current.uuid : null } as Record<string, string | null>
    });
  }

  /** Source: `RouteStatsView.openMapController()` — WorkoutMapViewController for this workout. */
  private openMap(): void {
    const current: Workout | null = this.workout;
    router.pushUrl({
      url: 'pages/WorkoutMapViewControllerPage',
      params: { 'workoutUUID': current !== null ? current.uuid : null } as Record<string, string | null>
    });
  }
}
