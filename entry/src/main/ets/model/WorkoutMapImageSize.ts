/*
 * Port of `WorkoutMapImageSize`
 * (OutRun/Models/Workout/MapManagement/Images/WorkoutMapImageSize.swift:22-46).
 *
 * The two sizes a rendered workout-route map image is cached at: the two-up thumbnail in the
 * workout list, and the full-width image on the stats screen.
 * `rawSize` read `UIScreen.main.bounds.width` directly. A model must not reach into the display,
 * so the screen width is a parameter — common/WorkoutMapImageManager.ts passes the vp width it
 * already holds. The arithmetic is the source's, unchanged (list: half of the width less 50, at
 * 120 high; stats: the width less 40, at 300 high).
 * `identifier` is load-bearing, not cosmetic: it is part of the cache key
 * (`WorkoutMapImageRequest.cacheIdentifier` = "<uuid>_<identifier>_<appearance>"), so the two
 * strings must stay exactly "list" and "stats".
 */
export enum WorkoutMapImageSize {
  LIST = 'LIST',
  STATS = 'STATS'
}

/** A `CGSize` — vp, not px. */
export class MapImageSize {
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}

/** Source: `rawSize`, with the screen width passed in rather than read off UIScreen. */
export function workoutMapImageRawSize(size: WorkoutMapImageSize, screenWidth: number): MapImageSize {
  if (size === WorkoutMapImageSize.LIST) {
    return new MapImageSize((screenWidth - 50) / 2, 120);
  }
  return new MapImageSize(screenWidth - 40, 300);
}

/** Source: `identifier` — part of the image cache key; do not change these two strings. */
export function workoutMapImageSizeIdentifier(size: WorkoutMapImageSize): string {
  return size === WorkoutMapImageSize.LIST ? 'list' : 'stats';
}
