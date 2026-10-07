/*
 * S3 structure — port of `RouteStatsView` (OutRun/Views/Stats/RouteStatsView.swift): a
 * 300pt route image under the card's WorkoutHeaderView, which the screen renders (this view is not
 * a StatsView subclass in source either, so its header is a sibling). The image is the
 * svc_map_image_manager render for this workout; with no route data the source shows
 * LS["NoDataAvailable"] INSTEAD of a tap target, which is why the tap only exists in the other branch.
 */
import { image } from '@kit.ImageKit';
import { MapComponent, map } from '@kit.MapKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { localizedString } from '../common/LocalizedStrings';

@Component
export struct RouteStatsView {
  /** Source: `workout.hasRouteData` — decided by the workout's own route samples. */
  @Prop hasRouteData: boolean = false;
  /** Source: `mapImageView.image` — WorkoutMapImageManager's render, null until it arrives. */
  mapImage: image.PixelMap | null = null;
  /** Source: `openMapController()` — showDetailViewController(WorkoutMapViewController). */
  onOpenMap?: () => void;
  /**
   * Draws the route into the live fallback map (see build()). The host owns the workout, so it
   * fills the controller: `WorkoutMapViewManager.setupRoute`.
   */
  onDrawRoute?: (controller: map.MapComponentController) => void;

  build() {
    /* Source: the map is inset 20 each side, 5 under the header and 5 above the card's bottom. */
    Column() {
      if (this.hasRouteData) {
        /** Source: `mapImageView` with its tap recogniser; the image arrives asynchronously. */
        Column() {
          if (this.mapImage !== null) {
            Image(this.mapImage)
              .width('100%')
              .height(300)
              .objectFit(ImageFit.Cover)
              /** Source: `imageView.layer.cornerRadius = 25`, clipsToBounds. */
              .borderRadius(25)
          } else {
            /*
             * The static-map render needs an AppGallery Connect config this build does not bundle,
             * so no image ever arrives. A live MapComponent (which the signing profile IS entitled
             * to) draws the same thumbnail: route fitted to the card, every gesture and control off,
             * and a transparent layer on top so a tap anywhere opens the map screen as the image did.
             */
            Stack() {
              MapComponent({
                mapOptions: { position: { target: { latitude: 0, longitude: 0 }, zoom: 14 } },
                mapCallback: (err: BusinessError, controller: map.MapComponentController): void => {
                  if (err !== undefined && err !== null && err.code !== 0) {
                    return;
                  }
                  controller.setAllGesturesEnabled(false);
                  controller.setZoomControlsEnabled(false);
                  controller.setCompassControlsEnabled(false);
                  controller.setScaleControlsEnabled(false);
                  controller.setMyLocationControlsEnabled(false);
                  if (this.onDrawRoute !== undefined) {
                    this.onDrawRoute(controller);
                  }
                }
              })
                .width('100%')
                .height(300)
              Column()
                .width('100%')
                .height(300)
                .id('workout_detail_route_map_tap')
                .onClick(() => {
                  this.openMap();
                })
            }
            .width('100%')
            .height(300)
          }
        }
        .id('workout_detail_route_map')
        .width('100%')
        .height(300)
        .borderRadius(25)
        .clip(true)
        .backgroundColor($r('app.color.foreground_color'))
        .onClick(() => {
          this.openMap();
        })
      } else {
        /** Source: `noDataLabel.isHidden = false` — no image, no tap target. */
        Text(localizedString('NoDataAvailable'))
          .width('100%')
          .height(300)
          .textAlign(TextAlign.Center)
          .fontSize(14)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.secondary_color'))
          .padding({ left: 30, right: 30 })
      }
    }
    .width('100%')
    .padding({ left: 20, right: 20, top: 5, bottom: 5 })
    .backgroundColor($r('app.color.background_color'))
  }

  private openMap(): void {
    if (this.onOpenMap !== undefined) {
      this.onOpenMap();
    }
  }
}
