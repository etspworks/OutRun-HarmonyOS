/*
 * S3 structure — port of `NewWorkoutViewController`
 * (OutRun/Controllers/Workout/NewWorkoutViewController.swift) plus the parts of
 * `MapViewControllerWithContainerView` / `DetailViewController` it uses.
 *
 * Source tree: a full-screen map behind a blur, the headline and close button at the top, the type
 * FloatingButton (left) and the readiness indicator (right) sitting above the stats container, the
 * Recenter FloatingButton above the indicator, and inside the container a 2x2 grid of live tiles
 * (Distance, Duration, Speed OR Pace, Burned Calories) over the action button. The completion banner
 * is the queued `WorkoutCompletionBanner` the builder's `finish` displays.
 *
 * Every tile is bound to svc_workout_builder through `WorkoutBuilderDelegate` — the capture is an
 * IDLE screen with no GPS fix, so its zero values are what the builder reports at rest, never
 * literals. This screen is the app's only workout-WRITE path: Stop hands the snapshot to
 * WorkoutCompletionActionHandler, whose Save persists it through svc_data_manager.
 * No styling in S3 — S5 applies the blur, radii, colours and the grid's spacing.
 */
import { router } from '@kit.ArkUI';
import { common } from '@kit.AbilityKit';
import { geoLocationManager } from '@kit.LocationKit';
import { MapComponent, map, mapCommon } from '@kit.MapKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { drawing, common2D } from '@kit.ArkGraphics2D';
import { WorkoutType, workoutTypeFromRaw } from '../model/WorkoutType';
import { WorkoutBuilderStatus, workoutBuilderStatusIsActive } from '../model/WorkoutBuilderStatus';
import { RelativeMeasurement } from '../model/RelativeMeasurement';
import { Measurement } from '../common/Measurement';
import { WorkoutBuilder, WorkoutBuilderDelegate } from '../common/WorkoutBuilder';
import { PermissionManager } from '../common/PermissionManager';
import { LocationPermissionStatus } from '../model/LocationPermissionStatus';
import { Banner, BannerKind, BannerQueue, BannerQueueObserver } from '../common/BannerQueue';
import { UserPreferences } from '../common/UserPreferences';
import { CustomMeasurementFormatting } from '../common/Formatting';
import { localizedString } from '../common/LocalizedStrings';
import { showConfirmAlert, showDismissableAlert, showErrorAlert } from '../common/AlertDialogs';
import { WorkoutTypeAlertPage } from './WorkoutTypeAlertPage';
import { FloatingButton } from '../components/FloatingButton';
import { WorkoutBuilderTypeView } from '../components/WorkoutBuilderTypeView';
import { WorkoutBuilderReadinessIndicationView }
  from '../components/WorkoutBuilderReadinessIndicationView';
import { NewWorkoutControllerActionButton }
  from '../components/NewWorkoutControllerActionButton';
import { LabelledDataView } from '../components/LabelledDataView';
import { LabelledRelativeDataView } from '../components/LabelledRelativeDataView';
import { ORBaseBanner } from '../components/ORBaseBanner';
import { TextBanner } from '../components/TextBanner';
import { WorkoutCompletionBanner } from '../components/WorkoutCompletionBanner';
import { closeTo } from '../common/NavBack';

/** Source: `MKMapCamera(lookingAtCenter:fromDistance: 200, pitch: 0, heading:)`. */
const CAMERA_ZOOM: number = 17;
/** Map Kit `cameraMoveStart` reason for a move the user's gesture started (2/3 = API animations). */
const CAMERA_MOVE_REASON_GESTURE: number = 1;
/** Source: `WorkoutMapViewDelegate` — accent stroke, 8pt, as the recording route is drawn. */
const ROUTE_COLOR: number = 0xFFFF9200;
const ROUTE_WIDTH: number = 8;

/** Source: `ORBannerQueue`'s observer — the queue holds the completion and text banners. */
class QueueObserver implements BannerQueueObserver {
  private readonly onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
  }

  bannerQueueDidChange(): void {
    this.onChange();
  }
}

/**
 * S5 style: `NewWorkoutViewController` is a `MapViewControllerWithContainerView`, itself a
 * `DetailViewController` — the map fills the screen, the headline and close button float over its
 * top, and the stats container is a .backgroundColor card with 25pt top corners whose children are
 * laid out on the controller's own `let spacing: CGFloat = 20`. The `close` glyph is a black
 * template PNG tinted by `window.tintColor = .accentColor` (AppDelegate.swift:350), which
 * ArkUI's SVG-only `fillColor` cannot do — hence the SRC_IN blend filter.
 */
const STATS_SPACING: number = 20;
const ACCENT: common2D.Color = { alpha: 255, red: 255, green: 146, blue: 0 };
const ACCENT_TINT: drawing.ColorFilter =
  drawing.ColorFilter.createBlendModeColorFilter(ACCENT, drawing.BlendMode.SRC_IN);

@Entry
@Component
struct NewWorkoutViewControllerPage {
  /** Source: `builder.status` via `didUpdate(status:)`. */
  @State status: WorkoutBuilderStatus = WorkoutBuilderStatus.WAITING;
  /** Source: `type` — initially UserPreferences.standardWorkoutType, changed by the type alert. */
  @State workoutType: WorkoutType =
    workoutTypeFromRaw(UserPreferences.standardWorkoutType.value);
  /** Source: `didUpdate(distanceMeasurement:)`. */
  @State distance: Measurement | null = null;
  /** Source: `didUpdate(durationMeasurement:)`. */
  @State duration: Measurement | null = null;
  /** Source: `didUpdate(speedMeasurement:rolling:)`. */
  @State speed: Measurement | null = null;
  /** Source: `didUpdate(paceMeasurement:rolling:)`. */
  @State pace: RelativeMeasurement | null = null;
  /** Source: `didUpdate(energyMeasurement:)`. */
  @State burnedEnergy: Measurement | null = null;
  /** Source: `didUpdate(routeData:)` — the polyline's coordinates. */
  @State routeData: mapCommon.LatLng[] = [];
  /** Source: `UserPreferences.shouldShowMap.value` (plan variant map_shown). */
  @State shouldShowMap: boolean = UserPreferences.shouldShowMap.value;
  /** Source: `UserPreferences.usePaceForSpeedDisplay.value` (plan variants speed/pace_display). */
  @State usePaceForSpeedDisplay: boolean = UserPreferences.usePaceForSpeedDisplay.value;
  /** Source: `userMovedMap` — set by the pan/pinch recognisers (plan variant map_moved). */
  @State userMovedMap: boolean = false;
  /** Source: `didUpdate(uiUpdatesSuspended:)` — the map leaves the hierarchy while backgrounded. */
  @State uiUpdatesSuspended: boolean = false;
  /** Source: `WorkoutTypeAlert(action:).present(on: self)` — the hosted type overlay. */
  @State isTypeAlertShown: boolean = false;
  /**
   * Source: the snapshot `finish(shouldProvideCompletionActions: true)` hands to
   * WorkoutCompletionActionHandler. The handler owns the snapshot in this port, so the page's
   * observable counterpart is the completion banner it queued (plan variant builder_completed).
   */
  @State completionSnapshot: Banner | null = null;
  /** The queue's current banner, drawn over this screen as the source's banner window did. */
  @State currentBanner: Banner | null = null;

  /** Source: `WorkoutBuilderDelegate` — the view controller was the delegate itself. */
  private delegate: WorkoutBuilderDelegate = new WorkoutBuilderDelegate();
  private builder: WorkoutBuilder | null = null;
  private mapController: map.MapComponentController | null = null;
  private routeOverlay: map.MapPolyline | null = null;
  private queueObserver: QueueObserver = new QueueObserver((): void => {
    this.readQueue();
  });

  /**
   * Source: the type FloatingButton presenting `WorkoutTypeAlert(action:)` with NO manualAction,
   * so the 'Enter Manually' option is absent here.
   */
  private typeAlert: CustomDialogController = new CustomDialogController({
    builder: WorkoutTypeAlertPage({
      isShown: $isTypeAlertShown,
      typeAction: (type: WorkoutType): void => {
        this.applyWorkoutType(type);
      }
    }),
    autoCancel: true,
    /**
     * S5: the alert draws its OWN 270pt card (radius 14, .foreground_color) measured off the
     * capture, so `customStyle` drops ArkUI's white container and insets; UIKit dims what is
     * behind an `.alert`, which is the dialog's default mask.
     */
    customStyle: true,
    alignment: DialogAlignment.Center
  });

  /** Source: `viewDidLoad` — WorkoutBuilder(workoutType:delegate:) plus the delegate callbacks. */
  aboutToAppear(): void {
    /*
     * Source: `TabBarController.swift:134-149` — the type alert creates the controller and sets
     * `controller.type = type` before presenting it; `showNewWorkoutController()` (:151-154)
     * presents it with no type, leaving `UserPreferences.standardWorkoutType`. A routed page
     * cannot be assigned a property, so the chosen type arrives as a route param.
     */
    this.readRoutedWorkoutType();
    this.bindDelegate();
    BannerQueue.DEFAULT.addObserver(this.queueObserver);
    this.readQueue();
    /*
     * iOS authorizes location and motion implicitly the moment CLLocationManager / CMPedometer
     * start (Setup asked through PermissionManager first). HarmonyOS grants nothing implicitly and
     * `geoLocationManager.on('locationChange')` THROWS without the grant, so the recording screen
     * asks before the builder subscribes — otherwise the builder never leaves .waiting, Start stays
     * disabled and this screen, the app's only workout-WRITE path, cannot record at all. A refusal
     * still creates the builder and raises the source's own insufficient-permission error.
     */
    this.requestRecordingPermissions().then((): void => {
      this.createBuilder();
    }).catch((err: Error): void => {
      this.createBuilder();
    });
  }

  /** Source: `controller.type = type` set by WorkoutTypeAlert before the push. */
  private readRoutedWorkoutType(): void {
    const params: Record<string, Object> = router.getParams() as Record<string, Object>;
    if (params === undefined || params === null) {
      return;
    }
    const raw: Object | undefined = params['workoutType'];
    if (typeof raw !== 'number') {
      return;
    }
    this.workoutType = workoutTypeFromRaw(raw as number);
  }

  /** Source: `PermissionManager.checkLocationPermission` / `checkMotionPermission` (Setup's pair). */
  private async requestRecordingPermissions(): Promise<void> {
    const context: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
    const status: LocationPermissionStatus =
      await PermissionManager.checkLocationPermission(context);
    if (status === LocationPermissionStatus.DENIED
      || status === LocationPermissionStatus.ERROR) {
      await showErrorAlert(localizedString('Setup.Permission.Location.Error'));
      return;
    }
    // Source: the step count comes from CMPedometer, which Setup authorizes the same way.
    await PermissionManager.checkMotionPermission(context);
  }

  /** Source: `viewDidLoad`'s `WorkoutBuilder(workoutType: type, delegate: self)`. */
  private createBuilder(): void {
    if (this.builder !== null) {
      return;
    }
    this.builder = new WorkoutBuilder(this.workoutType, this.delegate,
      getContext(this) as common.UIAbilityContext);
    this.delegate.resetAll();
  }

  aboutToDisappear(): void {
    BannerQueue.DEFAULT.removeObserver(this.queueObserver);
  }

  build() {
    Stack() {
      /**
       * Source: `if !UserPreferences.shouldShowMap.value { self.mapView = nil }` and
       * `didUpdate(uiUpdatesSuspended:)` removing it from the hierarchy while backgrounded.
       */
      if (this.shouldShowMap && !this.uiUpdatesSuspended) {
        MapComponent({
          mapOptions: { position: { target: { latitude: 0, longitude: 0 }, zoom: CAMERA_ZOOM } },
          mapCallback: (err: BusinessError, controller: map.MapComponentController): void => {
            this.onMapReady(err, controller);
          }
        })
          .width('100%')
          .height('100%')
      }
      Column() {
        /** Source: `DetailViewController` — the headline and the close button. */
        Row() {
          /** Source: `headlineLabel` — systemFont 32 .heavy .withLowerCaseSmallCaps. */
          Text(localizedString('Workout.NewWorkout'))
            .fontSize(32)
            .fontWeight(900)
            .fontFeature('"smcp" 1')
            .lineHeight(39)
            .fontColor($r('app.color.primary_color'))
            .maxLines(1)
            .layoutWeight(1)
            .margin({ top: 32 })
          Blank()
          /** Source: `closeButton` — the `close` template tinted by window.tintColor. */
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
         * Source: headlineLabel top 40 / left 20 / bottom -10, closeButton top 8 / right -10.
         * S6, measured off capture S0025 in this page's own coordinates (window minus the 47pt
         * status bar the app never draws under): close at y 18, headline at y 50.
         */
        .padding({ left: 20, right: 10, top: 18, bottom: 10 })
        Blank()
        /** Source: `recenterButton.isHidden = !userMovedMap` (plan variant map_moved). */
        if (this.shouldShowMap && this.userMovedMap) {
          FloatingButton({
            title: localizedString('NewWorkoutViewController.Recenter'),
            buttonId: 'new_workout_recenter',
            onAction: (): void => {
              this.recenter();
            }
          })
            /* Source: 10 above the readiness pill, 10 in from the safe area's right. */
            .margin({ right: 10, bottom: 10 })
        }
        Row() {
          /** Source: `typeView` — a FloatingButton whose label is the builder's workout type. */
          FloatingButton({
            buttonId: 'new_workout_type',
            onAction: (): void => {
              this.showTypeAlert();
            }
          }) {
            WorkoutBuilderTypeView({ type: this.workoutType })
          }
          Blank()
          /** Source: `readinessIndicatorView` + its tap recogniser. */
          WorkoutBuilderReadinessIndicationView({
            status: this.status,
            onTap: (): void => {
              this.displayIndicationAlert();
            }
          })
        }
        .width('100%')
        /* Source: both pills sit 10 above the container and 10 in from the safe area. */
        .padding({ left: 10, right: 10 })
        .margin({ bottom: 10 })
        /** Source: `containerView` — the blurred stats container above the safe area. */
        Column() {
          Row({ space: STATS_SPACING }) {
            LabelledDataView({
              title: localizedString('Workout.Distance'),
              value: this.measurementText(this.distance, false)
            })
            LabelledDataView({
              title: localizedString('Workout.Duration'),
              value: this.measurementText(this.duration, true)
            })
          }
          .width('100%')
          Row({ space: STATS_SPACING }) {
            /**
             * Source: `let speedIndication = UserPreferences.usePaceForSpeedDisplay.value ?
             * paceView : speedView` (plan variants speed_display / pace_display).
             */
            if (this.usePaceForSpeedDisplay) {
              LabelledRelativeDataView({
                title: this.paceTitle(),
                value: this.paceText(),
                relativeUnit: this.paceUnit()
              })
            } else {
              LabelledDataView({
                title: this.speedTitle(),
                value: this.measurementText(this.speed, false)
              })
            }
            LabelledDataView({
              title: localizedString('Workout.BurnedCalories'),
              value: this.measurementText(this.burnedEnergy, false)
            })
          }
          .width('100%')
          .margin({ top: STATS_SPACING })
          /** Source: `actionButton` — Start while idle, Stop + pause/continue while recording. */
          NewWorkoutControllerActionButton({
            status: this.status,
            onStart: (): void => {
              this.startWorkout();
            },
            onStop: (): void => {
              this.stopWorkout();
            },
            onPauseOrContinue: (): void => {
              this.pauseOrContinueWorkout();
            }
          })
            .margin({ top: STATS_SPACING })
        }
        .width('100%')
        /*
         * Source: `containerView` (MapViewControllerWithContainerView.swift:33-38) —
         * .backgroundColor with a 25pt radius on its TOP corners only, and every child inset by
         * the controller's own 20pt `spacing`.
         */
        .backgroundColor($r('app.color.background_color'))
        .borderRadius({ topLeft: 25, topRight: 25 })
        .padding(STATS_SPACING)
        // The panel is opaque on iOS: a touch on it (or on its disabled Start) never reaches the
        // map behind the now hit-transparent overlay.
        .hitTestBehavior(HitTestMode.BLOCK_HIERARCHY)
      }
      .width('100%')
      .height('100%')
      // This full-screen column sits over the map; with the default hit-test mode it swallowed
      // every drag and pinch aimed at the map (UIKit passes touches through the empty area).
      .hitTestBehavior(HitTestMode.Transparent)
      /** Source: the banner window over this screen — the completion banner, or a text banner. */
      if (this.completionSnapshot !== null) {
        /** ArkUI composes where Swift subclassed: the base banner holds the subclass's content. */
        ORBaseBanner({ banner: this.completionSnapshot }) {
          WorkoutCompletionBanner({ banner: this.completionSnapshot })
        }
      } else if (this.currentBanner !== null) {
        ORBaseBanner({ banner: this.currentBanner }) {
          TextBanner({ banner: this.currentBanner })
        }
      }
    }
    .id('NewWorkoutViewControllerPage')
    .width('100%')
    .height('100%')
    /* Source: the view is `.clear` over the map; with `shouldShowMap` off the blur view behind it
     * is the plain .backgroundColor this falls back to. */
    .backgroundColor($r('app.color.background_color'))
  }

  /** Source: every `didUpdate(...)` method of the delegate conformance. */
  private bindDelegate(): void {
    this.delegate.onDistanceUpdate = (distance: Measurement): void => {
      this.distance = distance;
    };
    this.delegate.onDurationUpdate = (duration: Measurement): void => {
      this.duration = duration;
    };
    this.delegate.onSpeedUpdate = (speed: Measurement, rolling: boolean): void => {
      this.speed = speed;
    };
    this.delegate.onPaceUpdate = (pace: RelativeMeasurement, rolling: boolean): void => {
      this.pace = pace;
    };
    this.delegate.onEnergyUpdate = (energy: Measurement): void => {
      this.burnedEnergy = energy;
    };
    this.delegate.onStatusUpdate = (status: WorkoutBuilderStatus): void => {
      this.status = status;
    };
    this.delegate.onRouteDataUpdate = (locations: geoLocationManager.Location[]): void => {
      this.applyRouteData(locations);
    };
    this.delegate.onCurrentLocationUpdate =
      (location: geoLocationManager.Location, force: boolean): void => {
        this.applyCurrentLocation(location, force);
      };
    this.delegate.onUiUpdatesSuspended = (suspended: boolean): void => {
      this.uiUpdatesSuspended = suspended;
    };
    this.delegate.onInsufficientLocationPermission = (): void => {
      showErrorAlert(localizedString('Setup.Permission.Location.Error')).catch(
        (err: Error): void => {
        });
    };
  }

  /** Source: the queue deciding which banner is on screen. */
  private readQueue(): void {
    const current: Banner | null = BannerQueue.DEFAULT.current;
    this.currentBanner = current;
    this.completionSnapshot =
      current !== null && current.kind === BannerKind.WORKOUT_COMPLETION ? current : null;
  }

  /** Source: `MKMapView` becoming available — the recording map starts empty. */
  private onMapReady(err: BusinessError, controller: map.MapComponentController): void {
    if (err !== undefined && err !== null && err.code !== 0) {
      return;
    }
    this.mapController = controller;
    /*
     * Map Kit draws zoom controls by default (harmonyos-guides/map-controls-and-interaction ▸ Zoom
     * Controls). `MKMapView` has none, so they are two controls the source does not define and the
     * runtime correctness gate reports them as invented — correctly.
     */
    controller.setZoomControlsEnabled(false);
    /*
     * Source: `MapViewControllerWithContainerView` sets `mapView.showsCompass = false`. Map Kit
     * shows its compass by default once the map is rotated, top-right, on top of the close button
     * (TC-MANUAL-001).
     */
    controller.setCompassControlsEnabled(false);
    /** Source: the pan/pinch recognisers — any map interaction stops the auto-follow. */
    controller.on('mapClick', (position: mapCommon.LatLng): void => {
      this.userMovedMap = true;
    });
    // A drag or pinch never fires mapClick; it starts a camera move whose reason is the gesture.
    controller.on('cameraMoveStart', (reason: number): void => {
      if (reason === CAMERA_MOVE_REASON_GESTURE) {
        this.userMovedMap = true;
      }
    });
  }

  /** Source: `didUpdate(routeData:)` — a new MKPolyline replaces the previous overlay. */
  private applyRouteData(locations: geoLocationManager.Location[]): void {
    const points: mapCommon.LatLng[] = [];
    for (const location of locations) {
      points.push({ latitude: location.latitude, longitude: location.longitude });
    }
    this.routeData = points;
    const controller: map.MapComponentController | null = this.mapController;
    if (controller === null || points.length === 0) {
      return;
    }
    const previous: map.MapPolyline | null = this.routeOverlay;
    controller.addPolyline({
      points: points,
      color: ROUTE_COLOR,
      width: ROUTE_WIDTH,
      clickable: false
    }).then((polyline: map.MapPolyline): void => {
      this.routeOverlay = polyline;
      if (previous !== null) {
        previous.remove();
      }
    }).catch((error: Error): void => {
    });
  }

  /** Source: `didUpdate(currentLocation:force:)` — auto-follow stops once the user moved the map. */
  private applyCurrentLocation(location: geoLocationManager.Location, force: boolean): void {
    const controller: map.MapComponentController | null = this.mapController;
    if (controller === null || this.userMovedMap) {
      return;
    }
    const target: mapCommon.LatLng = {
      latitude: location.latitude,
      longitude: location.longitude
    };
    controller.animateCamera(map.newCameraPosition({ target: target, zoom: CAMERA_ZOOM }));
  }

  /** Source: `recenterButton`'s action — clear userMovedMap and re-centre on the last location. */
  private recenter(): void {
    this.userMovedMap = false;
    const controller: map.MapComponentController | null = this.mapController;
    if (controller === null || this.routeData.length === 0) {
      return;
    }
    const last: mapCommon.LatLng = this.routeData[this.routeData.length - 1];
    controller.animateCamera(map.newCameraPosition({ target: last, zoom: CAMERA_ZOOM }));
  }

  /** Source: `typeView`'s action — WorkoutTypeAlert without the manual-entry option. */
  private showTypeAlert(): void {
    this.isTypeAlertShown = true;
    this.typeAlert.open();
  }

  /** Source: the alert's action closure — `builder.workoutType = type`. */
  private applyWorkoutType(type: WorkoutType): void {
    this.isTypeAlertShown = false;
    this.workoutType = type;
    const builder: WorkoutBuilder | null = this.builder;
    if (builder !== null) {
      builder.workoutType = type;
    }
  }

  /** Source: `displayIndicationAlert()` — only while .waiting. */
  private displayIndicationAlert(): void {
    if (this.status !== WorkoutBuilderStatus.WAITING) {
      return;
    }
    showDismissableAlert(localizedString('NewWorkoutViewController.WaitingAlert.Title'),
      localizedString('NewWorkoutViewController.WaitingAlert.Message')).catch(
      (err: Error): void => {
      });
  }

  /** Source: `actionClosure(.start)` -> `builder.startOrResume`. */
  private startWorkout(): void {
    const builder: WorkoutBuilder | null = this.builder;
    if (builder === null) {
      return;
    }
    builder.startOrResume((success: boolean): void => {
      if (!success) {
        this.displayBuilderFailureError();
      }
    });
  }

  /** Source: `actionClosure(.stop)` -> `builder.finish(shouldProvideCompletionActions: true)`. */
  private stopWorkout(): void {
    const builder: WorkoutBuilder | null = this.builder;
    if (builder === null) {
      return;
    }
    builder.finish(true, (success: boolean): void => {
      if (!success) {
        this.displayBuilderFailureError();
      }
    });
  }

  /** Source: `actionClosure(.pauseOrContinue)` — pause while recording, resume while paused. */
  private pauseOrContinueWorkout(): void {
    const builder: WorkoutBuilder | null = this.builder;
    if (builder === null) {
      return;
    }
    if (this.status === WorkoutBuilderStatus.RECORDING) {
      builder.pause((success: boolean): void => {
        if (!success) {
          this.displayBuilderFailureError();
        }
      });
      return;
    }
    builder.startOrResume((success: boolean): void => {
      if (!success) {
        this.displayBuilderFailureError();
      }
    });
  }

  /** Source: `displayBuilderFailureError()`. */
  private displayBuilderFailureError(): void {
    showErrorAlert(localizedString('NewWorkoutViewController.WorkoutBuilder.Error')).catch(
      (err: Error): void => {
      });
  }

  /**
   * Source: `close()` — while a recording is active it asks first, and Stop Recording finishes the
   * workout WITHOUT the completion actions (the snapshot is saved straight away).
   */
  private close(): void {
    if (!workoutBuilderStatusIsActive(this.status)) {
      const builder: WorkoutBuilder | null = this.builder;
      if (builder !== null) {
        builder.actOnDismiss();
      }
      closeTo('pages/WorkoutListViewControllerPage');
      return;
    }
    showConfirmAlert(
      localizedString('NewWorkoutViewController.Cancel.Error.Recording.Title'),
      localizedString('NewWorkoutViewController.Cancel.Error.Recording.Message'),
      localizedString('NewWorkoutViewController.Cancel.Error.Recording.Action.StopRecording'),
      true
    ).then((confirmed: boolean): void => {
      if (!confirmed) {
        return;
      }
      const builder: WorkoutBuilder | null = this.builder;
      if (builder === null) {
        closeTo('pages/WorkoutListViewControllerPage');
        return;
      }
      builder.finish(false, (success: boolean): void => {
        if (!success) {
          this.displayBuilderFailureError();
          return;
        }
        closeTo('pages/WorkoutListViewControllerPage');
      });
    }).catch((err: Error): void => {
    });
  }

  /** Source: `LabelledDataView.setData` — svc_formatting, durations as a clock. */
  private measurementText(measurement: Measurement | null, asClock: boolean): string {
    if (measurement === null) {
      return '';
    }
    return CustomMeasurementFormatting.string(measurement,
      CustomMeasurementFormatting.typeForUnit(measurement.unit, asClock));
  }

  /** Source: `speedView`'s title — rolling speed renames the tile (UserPreferences). */
  private speedTitle(): string {
    return UserPreferences.displayRollingSpeed.value
      ? localizedString('Workout.CurrentSpeed') : localizedString('Workout.AverageSpeed');
  }

  /** Source: `paceView`'s title — 'R. Pace' while rolling, 'T. Pace' otherwise. */
  private paceTitle(): string {
    return UserPreferences.displayRollingSpeed.value
      ? localizedString('Workout.RollingPace') : localizedString('Workout.TotalPace');
  }

  private paceText(): string {
    const value: RelativeMeasurement | null = this.pace;
    return value !== null ? value.stringRepresentation() : '';
  }

  private paceUnit(): string {
    const value: RelativeMeasurement | null = this.pace;
    return value !== null ? value.relativeUnit() : '';
  }
}
