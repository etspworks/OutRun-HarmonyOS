/*
 * Port of `ORBannerQueue` (OutRun/Models/ORBanner/ORBannerQueue.swift:23-139) together with the
 * QUEUE HALF of `ORBaseBanner` (OutRun/Views/ORBanner/ORBaseBanner.swift:23-339) and `TextBanner`
 * (OutRun/Models/ORBanner/TextBanner.swift:25-55).
 *
 * The source's banner is a `UIView` that both carries its state (duration, isBeingDisplayed,
 * isSuspended, the auto-dismiss timer) and draws itself into the key window. Only the state half
 * belongs in the data layer: `Banner` here is the model a Phase-3 overlay binds to, and the queue
 * owns exactly the ordering the source's queue owned. Nothing in this file draws anything.
 *
 * Two deliberate shape changes, both to keep the layers apart:
 *   - the source's `WorkoutCompletionBanner` subclass held a `WorkoutCompletionActionHandler` and
 *     wired three `UIButton`s to it. Here a banner carries `BannerAction`s (slug + label +
 *     callback), so the handler builds its own banner without this module importing it back.
 *   - `display()`/`suspend()`/`resume()`/`dismiss()` keep the source's guards and state flags and
 *     the auto-dismiss scheduling, but not the frame animation — the overlay animates itself.
 */
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN: number = 0x0001;
const TAG: string = 'BannerQueue';

/** Source: `ORBannerQueue.Position` (ORBannerQueue.swift:130-137). */
export enum BannerPosition {
  /** Displayed immediately, suspending whatever is on screen. */
  FRONT = 'FRONT',
  /** Displayed after everything already queued. */
  BACK = 'BACK'
}

/** Which source banner subclass this is, so the overlay knows what to draw. */
export enum BannerKind {
  /** `TextBanner` — one line of text. */
  TEXT = 'TEXT',
  /** `WorkoutCompletionBanner` — title plus the save / continue / discard buttons. */
  WORKOUT_COMPLETION = 'WORKOUT_COMPLETION'
}

/** One button on a banner. `id` is the source control's slug, for the generated `.id()`. */
export class BannerAction {
  readonly id: string;
  readonly label: string;
  readonly run: () => void;

  constructor(id: string, label: string, run: () => void) {
    this.id = id;
    this.label = label;
    this.run = run;
  }
}

/** Notified whenever the queue's contents or the head banner's display state change. */
export interface BannerQueueObserver {
  bannerQueueDidChange(): void;
}

/** Source: `ORBaseBanner.duration` — 10 s unless the caller overrides it. */
export const DEFAULT_BANNER_DURATION: number = 10;

let nextBannerId: number = 0;

export class Banner {
  /** Stable identity — the source compared banner instances with `firstIndex(of:)`. */
  readonly id: number;
  readonly kind: BannerKind;
  readonly text: string;
  readonly actions: BannerAction[];
  /** Source: `isDismissable` — false on the completion banner. */
  readonly isDismissable: boolean;
  /** Source: `duration` in seconds; `null` means the banner never auto-dismisses. */
  duration: number | null = DEFAULT_BANNER_DURATION;
  /** Source: `onDisplay` / `onDismiss`. */
  onDisplay: ((banner: Banner) => void) | null = null;
  onDismiss: ((banner: Banner) => void) | null = null;

  private displayed: boolean = false;
  private suspended: boolean = false;
  private autoDismissTimer: number = -1;
  private queue: BannerQueue | null = null;

  constructor(kind: BannerKind, text: string, actions: BannerAction[], isDismissable: boolean) {
    nextBannerId += 1;
    this.id = nextBannerId;
    this.kind = kind;
    this.text = text;
    this.actions = actions;
    this.isDismissable = isDismissable;
  }

  /** Source: `TextBanner.init(text:)`. */
  static text(text: string): Banner {
    return new Banner(BannerKind.TEXT, text, [], true);
  }

  /** Source: `isBeingDisplayed`. */
  get isBeingDisplayed(): boolean {
    return this.displayed;
  }

  /** Source: `isSuspended`. */
  get isSuspended(): boolean {
    return this.suspended;
  }

  /** Source: `show(queue:queuePosition:)` — a second call while on screen is ignored. */
  show(position: BannerPosition = BannerPosition.BACK,
    queue: BannerQueue = BannerQueue.DEFAULT): void {
    if (this.displayed) {
      return;
    }
    this.queue = queue;
    queue.add(this, position);
  }

  /** Remembers which queue is carrying this banner, so `dismiss()` can advance it. */
  attachTo(queue: BannerQueue): void {
    this.queue = queue;
  }

  /** Source: `display()`. */
  display(): void {
    if (this.displayed) {
      return;
    }
    this.displayed = true;
    this.scheduleAutoDismiss();
    if (this.onDisplay !== null) {
      this.onDisplay(this);
    }
  }

  /** Source: `suspend()` — make room for a banner added at the front. */
  suspend(): void {
    if (!this.displayed || this.suspended) {
      return;
    }
    this.suspended = true;
    this.cancelAutoDismiss();
  }

  /** Source: `resume()` — the front banner is gone, restart this one's dismissal clock. */
  resume(): void {
    if (!this.displayed || !this.suspended) {
      return;
    }
    this.suspended = false;
    this.scheduleAutoDismiss();
    if (this.onDisplay !== null) {
      this.onDisplay(this);
    }
  }

  /** Source: `dismiss()` — fires `onDismiss` and then hands the queue on to the next banner. */
  dismiss(): void {
    if (!this.displayed) {
      return;
    }
    this.displayed = false;
    this.suspended = false;
    this.cancelAutoDismiss();
    if (this.onDismiss !== null) {
      this.onDismiss(this);
    }
    // The source advanced the queue from the dismissal animation's completion block. Here the
    // call is synchronous, so `displayNext()` (which dismisses the head itself) would re-enter and
    // skip a banner; advancing only while still queued keeps one dismissal to one advance.
    const queue: BannerQueue | null = this.queue;
    if (queue !== null && queue.contains(this)) {
      queue.displayNext();
    }
  }

  /** Source: `scheduleAutoDismiss()`; the source's delay is in seconds. */
  private scheduleAutoDismiss(): void {
    this.cancelAutoDismiss();
    const duration: number | null = this.duration;
    if (duration === null) {
      return;
    }
    this.autoDismissTimer = setTimeout(() => {
      this.autoDismissTimer = -1;
      this.dismiss();
    }, duration * 1000);
  }

  /** Source: `cancleAutoDismiss()`. */
  private cancelAutoDismiss(): void {
    if (this.autoDismissTimer !== -1) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = -1;
    }
  }
}

export class BannerQueue {
  /** Source: `ORBannerQueue.default`. */
  static readonly DEFAULT: BannerQueue = new BannerQueue();

  private queued: Banner[] = [];
  private observers: Set<BannerQueueObserver> = new Set<BannerQueueObserver>();

  /** Source: `banners`. */
  get banners(): Banner[] {
    return this.queued;
  }

  /** Source: `count`. */
  get count(): number {
    return this.queued.length;
  }

  /** The banner an overlay should currently be drawing, if any. */
  get current(): Banner | null {
    return this.queued.length > 0 ? this.queued[0] : null;
  }

  addObserver(observer: BannerQueueObserver): void {
    this.observers.add(observer);
  }

  removeObserver(observer: BannerQueueObserver): void {
    this.observers.delete(observer);
  }

  /** Source: `add(_:position:)`. */
  add(banner: Banner, position: BannerPosition = BannerPosition.BACK): void {
    banner.attachTo(this);
    if (position === BannerPosition.BACK) {
      this.queued.push(banner);
      if (this.queued.length === 1) {
        banner.display();
      }
    } else {
      const first: Banner | null = this.current;
      if (first !== null) {
        first.suspend();
      }
      this.queued.unshift(banner);
      banner.display();
    }
    this.notifyObservers();
  }

  /** Whether this banner is still queued — see `Banner.dismiss()`. */
  contains(banner: Banner): boolean {
    return this.indexOf(banner) !== -1;
  }

  /** Source: `remove(_:)`. */
  remove(banner: Banner): void {
    const index: number = this.indexOf(banner);
    if (index !== -1) {
      this.queued.splice(index, 1);
      this.notifyObservers();
    }
  }

  /** Source: `displayNext()` — drop the head, then display or resume whatever is behind it. */
  displayNext(): void {
    if (this.queued.length > 0) {
      const banner: Banner = this.queued[0];
      this.queued.splice(0, 1);
      if (banner.isBeingDisplayed) {
        banner.dismiss();
      }
    }
    const next: Banner | null = this.current;
    if (next !== null) {
      if (next.isSuspended) {
        next.resume();
      } else {
        next.display();
      }
    }
    this.notifyObservers();
  }

  /** Source: `clear()`. */
  clear(): void {
    this.queued = [];
    this.notifyObservers();
  }

  private indexOf(banner: Banner): number {
    for (let i: number = 0; i < this.queued.length; i++) {
      if (this.queued[i].id === banner.id) {
        return i;
      }
    }
    return -1;
  }

  private notifyObservers(): void {
    for (const observer of this.observers) {
      try {
        observer.bannerQueueDidChange();
      } catch (err) {
        hilog.error(DOMAIN, TAG, 'banner observer failed: %{public}s', JSON.stringify(err));
      }
    }
  }
}
