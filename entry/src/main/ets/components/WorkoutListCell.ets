/*
 * S3 structure — port of `WorkoutListCell` (OutRun/Views/Workout/WorkoutListCell.swift).
 *
 * Source tree: lineView + circleView (the timeline rail) and containerView holding infoView
 * (typeLabel / distanceLabel / durationLabel) beside mapImageView.
 *
 * The source cell also owns `headerView` (a WorkoutListHeader per cell — it uses no table section
 * headers). That header is rendered by the list row in WorkoutListViewControllerPage directly above
 * this cell, which draws the same tree: WorkoutListHeader carries its own rail segment, so the
 * split is pixel-equivalent and keeps the day label where the page can bind it.
 *
 * Every value is bound to the row's own Workout, through the migrated services:
 *   typeLabel     workout.type().description.uppercased()
 *   distanceLabel CustomMeasurementFormatting.string(distance in metres, .distance, .wholeNumbers)
 *   durationLabel CustomMeasurementFormatting.string(activeDuration in seconds, .time, .wholeNumbers)
 *   mapImageView  WorkoutMapImageManager.execute(WorkoutMapImageRequest(uuid, .list)) — hidden when
 *                 the workout has no route data, and hidden again when the render returns no image
 *   containerView accent border when workout.isRace
 *
 * S5 style, from the source verbatim:
 *   cell           .backgroundColor
 *   lineView       4pt wide, left 18, .accentColor at 25% alpha, full height
 *   circleView     20x20, cornerRadius 10, .backgroundColor fill, 4pt .accentColor border,
 *                  centred on the line and on the container
 *   containerView  .foregroundColor, cornerRadius 25, clipped, 120pt tall, 18pt right of the
 *                  line, right/bottom inset 10, top = header.bottom + 10;
 *                  4pt .accentColor border when the workout is a race
 *   infoView       left 20, centred vertically
 *   typeLabel      .secondaryColor / systemFont 14 .bold
 *   distanceLabel  attributedStringWithBigNumbers(fontSize: 36) — 36 .bold, the unit in
 *                  lower-case small caps, .primaryColor
 *   durationLabel  the same at 24, .secondaryColor
 *   mapImageView   right half of the container, 120pt tall, scaleAspectFill
 */
import { image } from '@kit.ImageKit';
import { mediaquery } from '@kit.ArkUI';
import { MapComponent, map, mapCommon } from '@kit.MapKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { Workout } from '../model/Workout';
import { ApplicationState } from '../model/ApplicationState';
import { WorkoutType, workoutTypeDescription } from '../model/WorkoutType';
import { WorkoutMapImageSize } from '../model/WorkoutMapImageSize';
import { CustomMeasurementFormatting, FormattingMeasurementType, FormattingRoundingType } from '../common/Formatting';
import { Measurement, Unit } from '../common/Measurement';
import { WorkoutMapImageManager, WorkoutMapImageRequest } from '../common/WorkoutMapImageManager';
import { WorkoutMapViewManager } from '../common/WorkoutMapViewManager';
import { CustomImageCache } from '../common/CustomImageCache';
import { DataQueryManager } from '../common/DataQueryManager';
import { ApplicationStateObserver, startObservingApplicationState, stopObservingApplicationState }
  from '../common/ApplicationStateObservation';

/** Route inset inside the 120pt thumbnail, so the line never touches the card's rounded edge. */
const LIST_ROUTE_PADDING: mapCommon.Padding = { top: 24, left: 24, bottom: 24, right: 24 };
/**
 * How long the live fallback map gets, after its camera has come to rest on the route, to load the
 * tiles before it is snapshotted. ponytail: fixed delay; a blank-tile snapshot would be cached, so
 * raise this if thumbnails ever come out grey on a slow network.
 */
const SNAPSHOT_DELAY_MS: number = 1500;
/** Snapshot anyway if the map never reports the camera at rest. */
const SNAPSHOT_FALLBACK_MS: number = 8000;

/**
 * Source: `WorkoutListCell: ApplicationStateObserver` — `didUpdateApplicationState(to: .foreground)`
 * calls `loadImage()` again (the renderer is suspended while the app is backgrounded). An ArkUI
 * struct cannot implement an interface, so the observer is this adapter.
 */
class CellForegroundObserver implements ApplicationStateObserver {
  private readonly onForeground: () => void;

  constructor(onForeground: () => void) {
    this.onForeground = onForeground;
  }

  didUpdateApplicationState(state: ApplicationState): void {
    if (state === ApplicationState.FOREGROUND) {
      this.onForeground();
    }
  }
}

@Component
export struct WorkoutListCell {
  /** Source: `WorkoutListCell.workout`. */
  workout: Workout = new Workout();
  /** Source: `mapImageView.image`, filled by the WorkoutMapImageRequest completion. */
  @State mapImage: image.PixelMap | null = null;
  /** Source: `mapImageView.isHidden` — set when the render returns no image. */
  @State mapImageFailed: boolean = false;
  /**
   * The static-map render needs an AppGallery Connect config this build does not bundle, so it
   * never returns an image (TC-HISTORY-202). The cell then draws the route on a small live map,
   * snapshots it once into the same image cache the render would have filled, and shows that image:
   * the next time this row appears the cached thumbnail answers and no live map is built.
   */
  @State liveMapFallback: boolean = false;
  /**
   * Source: `workout.hasRouteData`. The list's workouts are not hydrated (their `routeData` is
   * empty), so the answer comes from the store instead; false until that query returns.
   */
  @State hasRoute: boolean = false;

  private foregroundObserver: CellForegroundObserver = new CellForegroundObserver((): void => {
    this.reloadImage();
  });
  /** The color-mode signal behind `traitCollectionDidChange` — see `reloadImage()`. */
  private darkModeListener: mediaquery.MediaQueryListener | null = null;

  aboutToAppear(): void {
    /** Source: `WorkoutListCell` starts observing the application state in `setup()`. */
    startObservingApplicationState(this.foregroundObserver);
    /**
     * Source: `traitCollectionDidChange(_:)` — on a color-appearance change the cell drops the
     * rendered map image and renders it again, because the snapshot carries the theme
     * (WorkoutMapImageManager.darkMode is the flag its renderer and cache key read).
     */
    const listener: mediaquery.MediaQueryListener =
      this.getUIContext().getMediaQuery().matchMediaSync('(dark-mode: true)');
    listener.on('change', (result: mediaquery.MediaQueryResult): void => {
      WorkoutMapImageManager.darkMode = result.matches;
      this.reloadImage();
    });
    WorkoutMapImageManager.darkMode = listener.matches;
    this.darkModeListener = listener;
    /** Source: `setup()` — only workouts with route data request an image. */
    const uuid: string | null = this.workout.uuid;
    if (this.workout.hasRouteData()) {
      this.hasRoute = true;
      this.loadImage();
    } else if (uuid !== null) {
      DataQueryManager.hasRouteSamples(uuid).then((hasRoute: boolean): void => {
        this.hasRoute = hasRoute;
        if (hasRoute) {
          this.loadImage();
        }
      });
    }
  }

  aboutToDisappear(): void {
    try {
      stopObservingApplicationState(this.foregroundObserver);
    } finally {
      const listener: mediaquery.MediaQueryListener | null = this.darkModeListener;
      if (listener !== null) {
        listener.off('change');
        this.darkModeListener = null;
      }
    }
  }

  /** Source: the `mapImageView.image = nil; loadImage()` pair both callbacks perform. */
  private reloadImage(): void {
    if (!this.hasRoute) {
      return;
    }
    this.mapImage = null;
    this.mapImageFailed = false;
    this.liveMapFallback = false;
    this.loadImage();
  }

  build() {
    Row() {
      /** Source: `lineView` + `circleView` — the timeline rail. */
      Stack() {
        Divider()
          .vertical(true)
          .strokeWidth(4)
          .color($r('app.color.accent_color'))
          .opacity(0.25)
          .height('100%')
        Circle()
          .width(20)
          .height(20)
          .fill($r('app.color.background_color'))
          .stroke($r('app.color.accent_color'))
          .strokeWidth(4)
      }
      .width(40)
      .height('100%')
      Column() {
        /** Source: `containerView`, bordered when `workout.isRace`. */
        Row() {
          /** Source: `infoView`. */
          Column() {
            Text(this.typeText())
              .fontSize(14)
              .fontWeight(FontWeight.Bold)
              .fontColor($r('app.color.secondary_color'))
              .width('100%')
            Text(this.distanceText())
              .fontSize(36)
              .fontWeight(FontWeight.Bold)
              .lineHeight(43)
              .fontFeature('"smcp" 1')
              .fontColor($r('app.color.primary_color'))
              .maxLines(1)
              .width('100%')
            Text(this.durationText())
              .fontSize(24)
              .fontWeight(FontWeight.Bold)
              .lineHeight(29)
              .fontFeature('"smcp" 1')
              .fontColor($r('app.color.secondary_color'))
              .maxLines(1)
              .width('100%')
          }
          .layoutWeight(1)
          .alignItems(HorizontalAlign.Start)
          .justifyContent(FlexAlign.Center)
          .padding({ left: 20, right: 10 })
          /** Source: `mapImageView` — hidden without route data or when the render failed. */
          if (this.hasRoute && !this.mapImageFailed && this.mapImage !== null) {
            Image(this.mapImage)
              .objectFit(ImageFit.Cover)
              .width('50%')
              .height(120)
          } else if (this.hasRoute && this.liveMapFallback) {
            Stack() {
              MapComponent({
                mapOptions: { position: { target: { latitude: 0, longitude: 0 }, zoom: 14 } },
                mapCallback: (err: BusinessError, controller: map.MapComponentController): void => {
                  if (err !== undefined && err !== null && err.code !== 0) {
                    this.liveMapFallback = false;
                    return;
                  }
                  this.drawAndSnapshot(controller);
                }
              })
                .width('100%')
                .height(120)
              /* The map takes no touch: a tap anywhere on the card still opens the workout. */
              Column()
                .width('100%')
                .height(120)
                .hitTestBehavior(HitTestMode.Block)
            }
            .width('50%')
            .height(120)
          }
        }
        .width('100%')
        .height(120)
        .alignItems(VerticalAlign.Center)
        .backgroundColor($r('app.color.foreground_color'))
        .borderRadius(25)
        .clip(true)
        .borderColor($r('app.color.accent_color'))
        .borderWidth(this.workout.isRace ? 4 : 0)
      }
      .layoutWeight(1)
      .margin({ top: 10, bottom: 10, right: 10 })
    }
    .width('100%')
    /* Source: container 120 tall with 10 above and below; the rail's 100% height needs a bound. */
    .height(140)
    .alignItems(VerticalAlign.Center)
    .backgroundColor($r('app.color.background_color'))
  }

  /** Source: `typeLabel.text = workout.type.description.uppercased()`. */
  private typeText(): string {
    const type: WorkoutType = this.workout.type();
    return workoutTypeDescription(type).toUpperCase();
  }

  /** Source: `loadLabels()` — the distance half. */
  private distanceText(): string {
    return CustomMeasurementFormatting.string(new Measurement(this.workout.distance, Unit.METERS),
      FormattingMeasurementType.DISTANCE, FormattingRoundingType.WHOLE_NUMBERS);
  }

  /** Source: `loadLabels()` — the duration half. */
  private durationText(): string {
    return CustomMeasurementFormatting.string(new Measurement(this.workout.activeDuration, Unit.SECONDS),
      FormattingMeasurementType.TIME, FormattingRoundingType.WHOLE_NUMBERS);
  }

  /** Source: `loadImage()` — WorkoutMapImageManager.execute(request) for the `.list` size. */
  private loadImage(): void {
    const request: WorkoutMapImageRequest = new WorkoutMapImageRequest(
      this.workout.uuid, WorkoutMapImageSize.LIST, false,
      (success: boolean, mapImage: image.PixelMap | null): void => {
        if (mapImage !== null) {
          this.mapImage = mapImage;
          return;
        }
        this.liveMapFallback = true;
      });
    WorkoutMapImageManager.execute(request);
  }

  /** The live-map fallback: draw the route, let the map settle, snapshot it into the image cache. */
  private drawAndSnapshot(controller: map.MapComponentController): void {
    controller.setAllGesturesEnabled(false);
    controller.setZoomControlsEnabled(false);
    controller.setCompassControlsEnabled(false);
    controller.setScaleControlsEnabled(false);
    controller.setMyLocationControlsEnabled(false);
    const darkMode: boolean = WorkoutMapImageManager.darkMode;
    WorkoutMapViewManager.setupRoute(this.workout, controller, LIST_ROUTE_PADDING).then((): void => {
      // setupRoute ends by starting the camera animation; snapshot once it is at rest.
      let scheduled: boolean = false;
      const onIdle = (): void => {
        schedule(SNAPSHOT_DELAY_MS);
      };
      const schedule = (delay: number): void => {
        if (scheduled) {
          return;
        }
        scheduled = true;
        controller.off('cameraIdle', onIdle);
        setTimeout((): void => {
          this.snapshotLiveMap(controller, darkMode);
        }, delay);
      };
      controller.on('cameraIdle', onIdle);
      setTimeout((): void => {
        schedule(0);
      }, SNAPSHOT_FALLBACK_MS);
    }).catch((err: Error): void => {
    });
  }

  private snapshotLiveMap(controller: map.MapComponentController, darkMode: boolean): void {
    if (!this.liveMapFallback) {
      return;
    }
    controller.snapshot().then((snapshot: image.PixelMap): void => {
      const id: string | null = new WorkoutMapImageRequest(this.workout.uuid, WorkoutMapImageSize.LIST,
        false, (): void => {
        }).cacheIdentifier(darkMode);
      if (id !== null && darkMode === WorkoutMapImageManager.darkMode) {
        CustomImageCache.mapImageCache.set(snapshot, id).catch((err: Error): void => {
        });
      }
      this.mapImage = snapshot;
      this.liveMapFallback = false;
    }).catch((err: BusinessError): void => {
      // The live map stays on screen; it already shows the route.
    });
  }
}
