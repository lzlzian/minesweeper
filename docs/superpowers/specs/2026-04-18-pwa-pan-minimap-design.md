# PWA + Pan/Minimap — Design Spec

**Date:** 2026-04-18
**Status:** Draft
**Problem:** On mobile, boards ≥16×16 become unreadable and hard to tap. The current `fitBoard()` uniformly scales the entire board to fit the viewport, which shrinks cells below usable size on phones. Numbers blur, fat-finger taps hit the wrong cell, and the overview is too dense to plan routes. Additionally, iOS Safari browser chrome (pinch-zoom, double-tap zoom, pull-to-refresh, address bar) sabotages gameplay even on well-sized boards.

Two fixes land together because they share the same mobile-polish goal and the PWA removes several browser quirks that would otherwise complicate the pan/tap arbitration.

## Goals

- Cells stay readable and reliably tappable on phones regardless of board size.
- Large boards (16×16+) remain playable on phones — bigger boards are where the game is most fun, so we adapt presentation rather than shrinking the game.
- Overview of the whole board remains accessible at all times — anchors, merchant, exit, player — so route planning still works.
- iOS browser chrome stops interfering with taps and gestures.

## Non-goals

- Offline play (no service worker in this iteration).
- Android/desktop install flows beyond what PWA gives for free.
- Changing game rules, board size, anchors, merchant, items, or any gameplay system.
- Desktop UX improvements beyond "still works."

---

## Part 1 — PWA (Progressive Web App)

### What the player experiences

On iOS: Safari → Share → *Add to Home Screen* → a Mining Crawler icon appears on the home screen. Launching from the icon opens the game full-screen with no Safari chrome, no URL bar, no pinch-zoom, no double-tap zoom, no pull-to-refresh.

On Android: Chrome auto-prompts "Install app?" the second or third visit, or user picks *Install app* from the menu. Same full-screen standalone experience.

On desktop Chrome: an install icon appears in the URL bar. Optional install; the normal web version works fine either way.

### Files added / changed

- **New:** `manifest.json` at project root.
- **New:** `assets/icon-192.png`, `assets/icon-512.png` (PWA icons).
- **New:** `assets/apple-touch-icon.png` (180×180, for iOS home screen).
- **Changed:** `index.html` `<head>` gets manifest link, iOS meta tags, updated viewport meta.

### `manifest.json`

```json
{
  "name": "Mining Crawler",
  "short_name": "Mining",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    { "src": "assets/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### `index.html` `<head>` additions

```html
<link rel="manifest" href="manifest.json">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Mining">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<meta name="theme-color" content="#000000">
```

Updated viewport meta (replaces current):

```html
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover">
```

### Icons

Placeholder icons will be generated (simple ⛏️ on dark background) for the first pass. Can be replaced later with custom art without any code change.

### What PWA does NOT change

- `game.js` — no code changes required for the PWA portion.
- Audio unlock on first user gesture — still required (iOS WebKit behavior).
- Long-press handler — still required (no native contextmenu on iOS).
- Save/resume via localStorage — works identically.

### Detection (optional, for debugging)

```js
const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true;
```

Not used for gameplay branching; useful only for logs if something diverges.

---

## Part 2 — Pan + Minimap

### Core change

`fitBoard()` and its `transform: scale()` approach are removed. Board renders at a **fixed cell size (40px)** regardless of board dimensions. Board overflows the viewport on mobile when the board is larger than the screen. Two mechanisms handle overflow:

1. **Pan** — drag on the board to scroll the view.
2. **Minimap** — small overlay showing the whole board; tap to recenter the main view.

Auto-recenter on player keeps the active cell in view without requiring constant manual panning.

### DOM structure

```
#viewport (new, overflow: hidden, relative)
  #board (translated via transform)
    .cell × N²
#minimap (new, canvas, sibling to viewport — positioned absolute over it)
```

The existing `#board` stays; it's wrapped in a new `#viewport` container. The minimap is a **sibling** to the viewport (not a child) so that minimap taps are not captured by the viewport's pan arbiter. The minimap is absolutely positioned to overlay the top-right of the viewport area.

### Fixed cell size

- **40px** square cells.
- Applies to both desktop and mobile — single code path.
- At 40px: 10×10 = 400×400, 14×14 = 560×560, 16×16 = 640×640, 20×20 = 800×800.
- Phone width ~390px: 20×20 needs panning; 10×10 barely fits.
- Desktop laptop (1440px+): all board sizes fit, pan is a no-op (clamped immediately).

### Pan mechanics

**Board position:** `transform: translate(panX, panY)` on `#board`. `panX`/`panY` are in pixels, negative values pan the board up/left.

**Pointer state machine** (replaces current touch/click handlers on cells):

- `pointerdown` on `#viewport`: record `startX`, `startY`, `startTime`, cell under pointer. State = `pending`.
- `pointermove`:
  - If cumulative Euclidean distance from start > **8px**, transition to `drag`. Cancel any pending long-press timer. Update `panX`/`panY` by the pointer delta since last move event.
  - If still < 8px, stay in `pending`.
- `pointerup`:
  - If state is `drag`: end pan. Take no cell action.
  - If state is `pending` and the long-press timer has NOT yet fired: fire **tap** — invoke existing cell-click handler for the recorded cell (walk, dig, or pickaxe target depending on mode). Cancel the long-press timer.
  - If state is `pending` and the long-press timer has already fired (flag was placed): no tap action.
- **Long-press timer:** started on `pointerdown`, fires at 400ms if state is still `pending`. Invokes existing flag handler and marks long-press as fired. Cleared on `pointerup`, `pointercancel`, or state transition to `drag`.

**State is per-pointer.** Multi-touch is ignored for now (no pinch) — second pointer starts a fresh state machine but its cell-tap is cancelled if first pointer is still active.

### Auto-recenter

After any player state change (walk, dig, pickaxe use, scanner use, anchor-cascade auto-walk if any, retry, new level), check whether the player cell is inside the **center 60% rectangle** of the viewport:

- Center rectangle: `[0.2×viewportW, 0.2×viewportH, 0.8×viewportW, 0.8×viewportH]`
- Player cell screen position = `cellR * 40 + panY + 20`, `cellC * 40 + panX + 20`.
- If outside the rectangle, animate `panX`/`panY` over 200ms to re-center the player (translate so player cell is at viewport center).

**Honor manual scouting:** if the user panned manually within the last **2000ms**, skip auto-recenter for this action. Next player action after the 2s window resumes auto-recenter. This lets the player scout ahead without the view snapping back.

### Pan clamping

The board can be panned, but not arbitrarily far:

- `overshootX = viewportW * 0.5`, `overshootY = viewportH * 0.5` (allow corner cells to reach viewport center)
- When `boardW >= viewportW`: clamp `panX` to `[viewportW - boardW - overshootX, overshootX]`
- When `boardW < viewportW`: clamp `panX` so board is centered horizontally (`panX = (viewportW - boardW) / 2`)
- Same rules for `panY` / `boardH` / `viewportH`.

Re-clamp on orientation change (`resize` / `orientationchange` events).

### Minimap

**Element:** `<canvas id="minimap">`, positioned fixed in top-right of viewport, `10px` margin from edges. CSS size ~100×100px (square boards — matches board aspect ratio; all current boards are square). Semi-transparent dark background (`rgba(0,0,0,0.7)`), thin border (`1px solid rgba(255,255,255,0.2)`).

**High-DPI rendering:** canvas internal size = CSS size × `devicePixelRatio`. Transformed with `ctx.scale(dpr, dpr)` at draw time for crisp pixels.

**Pixel-per-cell:** `floor(minimapCSSSize / boardSize)`. At 100px on 20×20: 5px/cell. On 10×10: 10px/cell.

**Color scheme:**

| Cell state | Color |
|---|---|
| Unrevealed | `#222` |
| Revealed floor | `#666` |
| Revealed wall | `#333` |
| Detonated gas (revealed) | `#666` (same as floor; no special marker) |
| Player | `#ffdd00` (2×2 px box, drawn last so it's always visible) |
| Exit | `#33ff33` (2×2 px box) |
| Merchant (if spawned) | `#ff33ff` (2×2 px box) |

Items and gold are NOT shown on the minimap — they're main-view rewards for exploration.

**Redraw triggers** (not per-frame):

- `revealCell` completes (any cell flipped to revealed)
- Player moves (position change)
- `initLevel` (new board — full redraw)
- Merchant spawn completes (once per level)
- Orientation/resize (canvas may need re-sizing)

One function `renderMinimap()` does the full draw; called on any of the above. Cheap at these resolutions.

**Interaction:** `click`/`tap` on minimap canvas → compute board coordinate from tap position (reverse the pixel-per-cell mapping) → animate `panX`/`panY` over 200ms to center that coordinate in the main viewport. Does NOT move the player, does NOT reveal cells — it's a camera command.

Minimap is always shown — desktop and mobile, small and large boards. Consistent.

### Existing code removed

- `fitBoard()` function
- `resize`/`orientationchange` listener that called `fitBoard()` (replaced with re-clamp listener)
- `transform: scale(...)` on `#board` (replaced with `transform: translate(...)`)

### Existing code unchanged

- `revealCell`, cascade logic, `initLevel`, `ensureSafeStart`, anchor placement, merchant spawn, item/gold placement and pickup, shop UI, HUD, save/resume, death/retry, win/lose flow, HP, audio (Web Audio + HTML5), BGM.
- Pickaxe targeting mode — tap still selects target cell, identical feel.
- All existing cell click/flag/long-press handlers — they keep their logic; they just get dispatched from the new pointer arbiter instead of being directly bound to cell DOM.

---

## Edge cases

- **Out-of-bounds pan:** clamped per Pan Clamping rules; `overshoot` allows corners to be centered.
- **Orientation change on mobile:** viewport dimensions change, clamp values change — re-clamp and re-center on player.
- **Small board on large viewport:** board fits entirely; pan clamped so board is centered; pan gestures produce no visible movement; minimap still renders.
- **Tap that starts as drag:** 8px threshold resolves this; if the user starts to drag-then-release within threshold, it's a tap on the original cell.
- **Long-press during drag:** drag cancels the long-press timer; user must stop moving for 400ms to flag.
- **Rapid tap (double-click desktop):** each click is an independent `pointerdown`/`pointerup` cycle; existing handlers fire once per tap. No new multi-tap gestures introduced.
- **iOS PWA standalone:** pinch-zoom and double-tap zoom are disabled by `display: standalone` + `user-scalable=no`. Pan/tap arbitration is unchanged from browser mode.
- **iOS browser (not PWA):** user may still pinch-zoom the page. This is existing behavior and not worse. PWA is the recommended play mode; a subtle "add to home screen" prompt for iOS users is out of scope for this iteration.
- **Minimap tap while panning with other finger:** minimap tap is on a separate DOM element, uses its own handler, does not interfere with viewport pan state.

## Testing plan

Manual playtest, all paths:

- **Desktop browser (Chrome):**
  - 10×10: board fits, pan is no-op, tap walks, right-click flags, minimap tap recenters (trivially).
  - 20×20: board overflows, drag pans, tap walks, right-click flags, minimap tap recenters.
  - Pickaxe targeting: tap selects target, cascade renders.
  - Full run through death, retry, new run, merchant buy, save/resume.

- **Mobile Safari (browser, not installed):**
  - 16×16 and 20×20: drag pans, short tap walks, long-press flags, minimap tap recenters.
  - Orientation change: recenters on player, clamp adjusts.
  - Pickaxe targeting: tap target, cascade renders.

- **Mobile Safari (PWA via Add to Home Screen):**
  - Confirm no Safari chrome visible.
  - Confirm pinch-zoom and double-tap zoom do nothing.
  - Full gameplay path including merchant, items, anchors, death/retry, save/resume across re-launches.

- **Android Chrome (browser + PWA):**
  - Same as iOS checks.

## Rollout

Single commit (or small stack) since PWA and pan/minimap are interdependent only in testing — either can ship first technically, but bundling them avoids a weird intermediate state where the board fixed-size overflows without PWA zoom-lock.

No feature flag. Save data format unchanged.

## Tuning knobs (adjustable in playtest)

| Knob | Default | Range | Effect |
|---|---|---|---|
| Cell size | 40px | 32–48 | Too small → tap reliability drops. Too large → tiny boards fill screen, big boards need more panning. |
| Drag threshold | 8px | 5–15 | Too small → every tap becomes a drag. Too large → drags feel unresponsive. |
| Long-press duration | 400ms | 300–600 | Unchanged from current. |
| Auto-recenter margin | 60% center rect | 40–80% | Too tight → constant snapping. Too loose → player can walk offscreen. |
| Scout skip window | 2000ms | 1000–4000 | How long manual pan disables auto-recenter. |
| Minimap size | 100px CSS | 80–140 | Bigger eats gameplay area; smaller drops legibility. |
| Pan animation duration | 200ms | 100–400 | |
