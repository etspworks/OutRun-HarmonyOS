/*
 * Port of `WorkoutMapViewManager` (MapManagement/Views/WorkoutMapViewManager.swift:24-43) together
 * with `WorkoutMapViewDelegate` (MapManagement/Views/WorkoutMapViewDelegate.swift), which existed
 * only to style the route: accent stroke, 8pt wide.
 *
 * The LIVE map — the workout-detail route map and the recording map — is Map Kit's MapComponent;
 * this is the non-UI half it calls once the component has a controller: turn the workout's route
 * samples into a polyline, add it, and move the camera so the whole route fits with the source's
 * edge padding (top 40, left 20, bottom 40, right 20). The component itself is Phase 3's.
 *
 * Map Kit is an HMS service needing the app registered in AppGallery Connect; with no map
 * credentials the overlay call rejects, which is reported and swallowed here so the screen around
 * the map still works.
 */
import { map, mapCommon } from '@kit.MapKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { Workout } from '../model/Workout';
import { DataManager } from './DataManager';

const DOMAIN: number = 0x0000;
const TAG: string = 'WorkoutMapViewManager';

/** Source: `WorkoutMapViewDelegate` — `renderer.strokeColor = .accentColor`, `lineWidth = 8.0`. */
const ROUTE_COLOR: number = 0xFFFF9200;
const ROUTE_WIDTH: number = 8;

/** Source: the `customEdgePadding` default of `setupRoute`. */
const DEFAULT_EDGE_PADDING: mapCommon.Padding = { top: 40, left: 20, bottom: 40, right: 20 };

export class WorkoutMapViewManager {

  /**
   * Source: `setupRoute(forWorkout:mapView:customEdgePadding:completion:)`. Resolves once the route
   * is on the map and the camera has been moved; resolves with nothing added when the workout has
   * no route samples, exactly as the source's empty MKPolyline did.
   */
  static async setupRoute(workout: Workout, controller: map.MapComponentController,
    edgePadding: mapCommon.Padding = DEFAULT_EDGE_PADDING): Promise<void> {
    try {
      await DataManager.hydrate(workout);

      const locations: mapCommon.LatLng[] = [];
      let north: number = -90;
      let south: number = 90;
      let east: number = -180;
      let west: number = 180;
      for (const sample of workout.routeData) {
        locations.push({ latitude: sample.latitude, longitude: sample.longitude });
        north = Math.max(north, sample.latitude);
        south = Math.min(south, sample.latitude);
        east = Math.max(east, sample.longitude);
        west = Math.min(west, sample.longitude);
      }
      if (locations.length === 0) {
        return;
      }

      const polyline: mapCommon.MapPolylineOptions = {
        points: locations,
        color: ROUTE_COLOR,
        width: ROUTE_WIDTH,
        clickable: false
      };
      await controller.addPolyline(polyline);

      // Source: `setVisibleMapRect(route.boundingMapRect, edgePadding:, animated: true)`.
      const bounds: mapCommon.LatLngBounds = {
        northeast: { latitude: north, longitude: east },
        southwest: { latitude: south, longitude: west }
      };
      controller.animateCamera(map.newLatLngBounds(bounds, edgePadding));
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to set up the route map: %{public}s', JSON.stringify(err));
    }
  }
}
