/*
 * Port of the workout-route thumbnail pipeline:
 *   WorkoutMapImageManager (MapManagement/Images/WorkoutMapImageManager.swift:25-169),
 *   WorkoutMapImageQueue   (MapManagement/Images/WorkoutMapImageQueue.swift:23-68),
 *   WorkoutMapImageRequest (MapManagement/Images/WorkoutMapImageRequest.swift:23-49).
 *
 * One request per (workout, size): answer from CustomImageCache if it holds the image, else render
 * one map image with the route drawn on it, cache it, and hand it back. Requests are rendered ONE
 * at a time through a queue with a high-priority lane (the visible list rows) so scrolling does not
 * start twenty renders, and rendering is suspended while the app is in the background.
 *
 * SUBSTITUTION — the renderer. The source drew the image itself: MKMapSnapshotter produced the map
 * tiles, then it stroked the route into a CoreGraphics context over them. HarmonyOS has no
 * snapshotter and no offscreen map canvas, but Map Kit's `staticMap.getMapImage` takes BOTH the
 * camera and a `path` and returns the finished PixelMap — so the two source steps collapse into one
 * call and the hand-drawing (UIGraphics context, lineWidth 3, round cap, accent stroke) is gone,
 * expressed as the path's `color`/`width` instead. Map Kit is an HMS service needing the app
 * registered in AppGallery Connect; with no map credentials in the test environment the call
 * rejects, which surfaces here as `completion(false, null)` — the same path the source took when
 * the snapshotter failed, so the list shows its placeholder rather than a broken row.
 *
 * Two values the source read off globals are set by the UI instead, because a .ts data-layer module
 * must not reach into the display: `darkMode` (source: `Config.isDarkModeEnabled`, which the render
 * also re-checks afterwards to re-queue an image rendered in the wrong appearance) and
 * `screenWidth` (source: `UIScreen.main.bounds.width`, what WorkoutMapImageSize sizes against).
 */
import { image } from '@kit.ImageKit';
import { mapCommon, staticMap } from '@kit.MapKit';
import { application, common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { CustomImageCache } from './CustomImageCache';
import { DataQueryManager, LocationCoordinate } from './DataQueryManager';
import { MapImageSize, WorkoutMapImageSize, workoutMapImageRawSize, workoutMapImageSizeIdentifier } from '../model/WorkoutMapImageSize';

const DOMAIN: number = 0x0000;
const TAG: string = 'WorkoutMapImageManager';

/** The app's accent color (resources/base/element/color.json), as the source's stroke color. */
const ROUTE_COLOR: number = 0xFFFF9200;
/** Source: `context.setLineWidth(3.0)` on the snapshot. */
const ROUTE_WIDTH: number = 3;
/** Source: `route.boundingMapRect.insetBy(dx: width * -0.1, ...)` — 10% of slack on each side. */
const REGION_INSET: number = 0.1;
const MIN_ZOOM: number = 3;
const MAX_ZOOM: number = 20;
const TILE_SIZE: number = 256;
/**
 * Source: `agconnect-services.json` — the AppGallery Connect client config Map Kit's SERVER APIs
 * (`staticMap.getMapImage` among them) authenticate with.
 */
const AGC_CONFIG_FILE: string = 'agconnect-services.json';

/** `null` until probed once; see `staticMapIsAvailable`. */
let staticMapProbe: boolean | null = null;

/**
 * Whether a static-map request can succeed on THIS build, decided once and without calling the
 * SDK. `staticMap.getMapImage` authenticates through the bundled AppGallery Connect client config;
 * a self-signed build that carries none never gets an image and the SDK logs
 * `OHMapSDK_StaticMap: error.code: undefined, error.message:undefined is not callable` followed by
 * `NapiProcessor: Parameter error. The configName parameter is invalid.` on EVERY call — once per
 * route thumbnail, so opening a workout writes an SDK error into the app's own log.
 *
 * Probing the config instead of the call keeps that error out of the log entirely, and the skipped
 * request takes the path the source took when its snapshotter failed: `completion(false, null)`, so
 * the row shows its placeholder. The live `MapComponent` is a separate capability and is untouched.
 */
function staticMapIsAvailable(context: common.Context): boolean {
  if (staticMapProbe !== null) {
    return staticMapProbe;
  }
  let available: boolean = false;
  try {
    available = context.resourceManager.getRawFileContentSync(AGC_CONFIG_FILE).byteLength > 0;
  } catch (err) {
    available = false;
  }
  if (!available) {
    hilog.info(DOMAIN, TAG, 'no AppGallery Connect config bundled: skipping static map requests');
  }
  staticMapProbe = available;
  return available;
}

/** Source: `WorkoutMapImageManager.Status`. */
export enum WorkoutMapImageStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  SUSPENDED = 'SUSPENDED'
}

export type WorkoutMapImageCompletion = (success: boolean, mapImage: image.PixelMap | null) => void;

/** Source: `WorkoutMapImageRequest`. */
export class WorkoutMapImageRequest {
  readonly workoutUUID: string | null;
  readonly size: WorkoutMapImageSize;
  readonly highPriority: boolean;
  completion: WorkoutMapImageCompletion;

  constructor(workoutUUID: string | null, size: WorkoutMapImageSize, highPriority: boolean,
    completion: WorkoutMapImageCompletion) {
    this.workoutUUID = workoutUUID;
    this.size = size;
    this.highPriority = highPriority;
    this.completion = completion;
  }

  /** Source: `cacheIdentifier(forDarkAppearance:)` — "<uuid>_<size>_<appearance>". */
  cacheIdentifier(usesDarkAppearance: boolean): string | null {
    if (this.workoutUUID === null) {
      return null;
    }
    const appearance: string = usesDarkAppearance ? 'dark' : 'light';
    return `${this.workoutUUID}_${workoutMapImageSizeIdentifier(this.size)}_${appearance}`;
  }

  /** Source: `static func == ` — same workout and same size, whatever the completion is. */
  equals(other: WorkoutMapImageRequest): boolean {
    return this.workoutUUID === other.workoutUUID && this.size === other.size;
  }
}

/** Source: `WorkoutMapImageQueue`. */
export class WorkoutMapImageQueue {
  private highPriorityRequests: WorkoutMapImageRequest[] = [];
  private ordinaryRequests: WorkoutMapImageRequest[] = [];

  /** Source: `pendingRequests` — the high-priority lane first. */
  get pendingRequests(): WorkoutMapImageRequest[] {
    return this.highPriorityRequests.concat(this.ordinaryRequests);
  }

  /**
   * Source: `add(_:)`. Its behaviour is deliberate and looks like a bug: an identical request
   * already in the lane is REMOVED and the new one is not added, so re-requesting the same image
   * cancels the pending render (the row scrolled away and asked again with a fresh completion).
   */
  add(request: WorkoutMapImageRequest): void {
    const lane: WorkoutMapImageRequest[] =
      request.highPriority ? this.highPriorityRequests : this.ordinaryRequests;
    for (let index: number = 0; index < lane.length; index++) {
      if (lane[index].equals(request)) {
        lane.splice(index, 1);
        return;
      }
    }
    lane.push(request);
  }

  /** Source: `remove(_:)` — every identical request in the request's own lane. */
  remove(request: WorkoutMapImageRequest): void {
    if (request.highPriority) {
      this.highPriorityRequests =
        this.highPriorityRequests.filter((pending: WorkoutMapImageRequest): boolean =>
          !pending.equals(request));
      return;
    }
    this.ordinaryRequests =
      this.ordinaryRequests.filter((pending: WorkoutMapImageRequest): boolean =>
        !pending.equals(request));
  }
}

/** The camera `staticMap` needs, derived from the route's bounding box. */
class MapCamera {
  readonly center: mapCommon.LatLng;
  readonly zoom: number;

  constructor(center: mapCommon.LatLng, zoom: number) {
    this.center = center;
    this.zoom = zoom;
  }
}

function mercatorY(latitude: number): number {
  const clamped: number = Math.max(-85, Math.min(85, latitude));
  const radians: number = clamped * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

/**
 * Source: the region it handed the snapshotter — the route's bounding rect, inset by -10% on each
 * axis. staticMap takes a center and a zoom instead of a rect, so the rect becomes the zoom that
 * fits it into the requested image size.
 *
 * ponytail: plain Web-Mercator fit, no account of the map's logo strip or label margins; if a route
 * ever clips at the edge, raise REGION_INSET rather than modelling the projection more closely.
 */
function cameraFor(route: LocationCoordinate[], size: MapImageSize): MapCamera {
  let north: number = route[0].latitude;
  let south: number = route[0].latitude;
  let east: number = route[0].longitude;
  let west: number = route[0].longitude;
  for (const point of route) {
    north = Math.max(north, point.latitude);
    south = Math.min(south, point.latitude);
    east = Math.max(east, point.longitude);
    west = Math.min(west, point.longitude);
  }

  const center: mapCommon.LatLng = {
    latitude: (north + south) / 2,
    longitude: (east + west) / 2
  };

  const latitudeFraction: number =
    Math.abs(mercatorY(north) - mercatorY(south)) * (1 + 2 * REGION_INSET) / (2 * Math.PI);
  const longitudeFraction: number =
    Math.abs(east - west) * (1 + 2 * REGION_INSET) / 360;

  let zoom: number = MAX_ZOOM;
  if (latitudeFraction > 0) {
    zoom = Math.min(zoom, Math.log2(size.height / TILE_SIZE / latitudeFraction));
  }
  if (longitudeFraction > 0) {
    zoom = Math.min(zoom, Math.log2(size.width / TILE_SIZE / longitudeFraction));
  }
  return new MapCamera(center, Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(zoom))));
}

export class WorkoutMapImageManager {
  private static internalStatus: WorkoutMapImageStatus = WorkoutMapImageStatus.IDLE;
  private static requestQueue: WorkoutMapImageQueue = new WorkoutMapImageQueue();

  /** Source: `Config.isDarkModeEnabled`, read by the renderer — set from the UI's color mode. */
  static darkMode: boolean = false;
  /** Source: `UIScreen.main.bounds.width` — the vp width WorkoutMapImageSize sizes against. */
  static screenWidth: number = 360;

  /** Source: `execute(_:)` — a cached image answers straight away, nothing is queued. */
  static async execute(request: WorkoutMapImageRequest): Promise<void> {
    const id: string | null = request.cacheIdentifier(WorkoutMapImageManager.darkMode);
    if (id !== null) {
      const cached: image.PixelMap | null = await CustomImageCache.mapImageCache.getMapImage(id);
      if (cached !== null) {
        request.completion(true, cached);
        return;
      }
    }

    WorkoutMapImageManager.requestQueue.add(request);
    if (WorkoutMapImageManager.internalStatus === WorkoutMapImageStatus.IDLE) {
      await WorkoutMapImageManager.executeNextInQueue();
    }
  }

  /**
   * Source: `suspendRenderProcess()` — "should only be used when the app enters the background, to
   * ensure that it does not get terminated by the system". The source suspended two DispatchQueues;
   * here the status gate stops the next render from starting (a render already in flight finishes,
   * as its snapshotter did).
   */
  static suspendRenderProcess(): void {
    WorkoutMapImageManager.internalStatus = WorkoutMapImageStatus.SUSPENDED;
  }

  /** Source: `resumeRenderProcess()` — plus the `internalStatus` didSet that drains the queue. */
  static async resumeRenderProcess(): Promise<void> {
    if (WorkoutMapImageManager.internalStatus !== WorkoutMapImageStatus.SUSPENDED) {
      return;
    }
    WorkoutMapImageManager.internalStatus = WorkoutMapImageStatus.IDLE;
    await WorkoutMapImageManager.executeNextInQueue();
  }

  /** Source: `executeNextInQueue()`. */
  private static async executeNextInQueue(): Promise<void> {
    if (WorkoutMapImageManager.internalStatus === WorkoutMapImageStatus.SUSPENDED) {
      return;
    }
    const pending: WorkoutMapImageRequest[] = WorkoutMapImageManager.requestQueue.pendingRequests;
    if (pending.length === 0) {
      WorkoutMapImageManager.internalStatus = WorkoutMapImageStatus.IDLE;
      return;
    }

    const request: WorkoutMapImageRequest = pending[0];
    WorkoutMapImageManager.internalStatus = WorkoutMapImageStatus.RUNNING;
    const imageUsesDarkMode: boolean = WorkoutMapImageManager.darkMode;

    let rendered: image.PixelMap | null = null;
    try {
      rendered = await WorkoutMapImageManager.render(request, imageUsesDarkMode);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'failed to render map image: %{public}s', JSON.stringify(err));
    }

    // Source: the completion closure — drop the request, answer, then take the next one.
    WorkoutMapImageManager.requestQueue.remove(request);
    request.completion(rendered !== null, rendered);

    // Source: re-queue when the appearance changed while this image was rendering.
    if (rendered !== null && WorkoutMapImageManager.darkMode !== imageUsesDarkMode) {
      WorkoutMapImageManager.requestQueue.add(request);
    }
    await WorkoutMapImageManager.executeNextInQueue();
  }

  private static async render(request: WorkoutMapImageRequest,
    imageUsesDarkMode: boolean): Promise<image.PixelMap | null> {
    if (request.workoutUUID === null) {
      return null;
    }
    const context: common.Context = application.getApplicationContext();
    if (!staticMapIsAvailable(context)) {
      return null;
    }
    const route: LocationCoordinate[] | null =
      await DataQueryManager.fetchLocationDegreesOfRoute(request.workoutUUID);
    if (route === null || route.length === 0) {
      return null;
    }

    const size: MapImageSize =
      workoutMapImageRawSize(request.size, WorkoutMapImageManager.screenWidth);
    const camera: MapCamera = cameraFor(route, size);
    const locations: mapCommon.LatLng[] = [];
    for (const point of route) {
      locations.push({ latitude: point.latitude, longitude: point.longitude });
    }
    const path: staticMap.StaticMapPath = {
      locations: locations,
      color: ROUTE_COLOR,
      width: ROUTE_WIDTH
    };
    const options: staticMap.StaticMapOptions = {
      location: camera.center,
      zoom: camera.zoom,
      imageWidth: Math.round(size.width),
      imageHeight: Math.round(size.height),
      path: path,
      dayNightMode: imageUsesDarkMode ? mapCommon.DayNightMode.NIGHT : mapCommon.DayNightMode.DAY
    };

    const mapImage: image.PixelMap = await staticMap.getMapImage(context, options);

    const id: string | null = request.cacheIdentifier(imageUsesDarkMode);
    if (id !== null) {
      await CustomImageCache.mapImageCache.set(mapImage, id);
    }
    return mapImage;
  }
}
