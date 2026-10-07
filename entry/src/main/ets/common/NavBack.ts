/*
 * The one place the source's `close()` is translated. Every OutRun close/cancel control is
 * `dismiss(animated: true)` — it returns to whoever PRESENTED the screen.
 *
 * `router.back()` is that, EXCEPT on a page that is the router ROOT. The pipeline opens each
 * screen as its own cold deep-link launch (`want.parameters.targetPage`), which makes the closed
 * page the only entry on the stack; there `back()` pops nothing, the ability goes to the
 * background and the device lands on the HarmonyOS launcher instead of the caller. So check the
 * stack first and fall back to an explicit replace to the presenter the source returns to
 * (the screen's own `navOut` pop target in the plan).
 */
import { router } from '@kit.ArkUI';

/**
 * A close is a single dismissal: UIKit ignores a second tap on a close button while the screen is
 * already animating out. Without this, a double tap called `router.back()` twice and popped the
 * presenter as well (TC-MAP-004). ponytail: one app-wide window, not per page; no human closes two
 * screens within it.
 */
const CLOSE_GUARD_MS: number = 600;
let lastCloseAt: number = 0;

export function closeTo(callerUrl: string, params: Record<string, string> | null = null): void {
  const now: number = Date.now();
  if (now - lastCloseAt < CLOSE_GUARD_MS) {
    return;
  }
  lastCloseAt = now;
  if (Number.parseInt(router.getLength(), 10) > 1) {
    router.back();
    return;
  }
  const options: router.RouterOptions = params !== null
    ? { url: callerUrl, params: params } : { url: callerUrl };
  router.replaceUrl(options).catch((err: Error): void => {
  });
}

/*
 * The back item every pushed screen draws (chevron + the previous title). UIKit's chevron is a
 * bold glyph that stands taller than its 17pt title, with a small gap before the title (owner
 * review, TC-MANUAL-005).
 */
export const BACK_CHEVRON_SIZE: number = 24;
export const BACK_CHEVRON_GAP: number = 6;
