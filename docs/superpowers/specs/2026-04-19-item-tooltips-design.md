# Item Tooltips — Design

**Date:** 2026-04-19
**Status:** Design approved, ready for implementation plan

## Goal

When the player hovers over an item on desktop, or long-presses an item on mobile, show a tooltip describing what the item does.

Rationale: the rules screen previously listed item descriptions but they were removed (commit `e21de00`) because that was not the right home for them. Tooltips put the information where the player actually needs it — at the point of decision (use it or not? buy it or not?).

## Scope

Tooltips appear on:
1. The six item-bar buttons (`#item-bar .item-btn`) — always present in HUD during a run
2. The merchant shop slots (`.shop-slot`) — shown in the merchant overlay

Out of scope (deferred):
- Grid cells (would collide with existing long-press flag toggle)
- Fountain / merchant / chest tiles on the grid
- HUD HP / gold / level display
- Settings / rules / menu items

## User-facing behavior

### Desktop
- Mouse enters an item trigger → after a **300ms** delay, tooltip appears above the trigger
- Mouse leaves → tooltip hides immediately
- 300ms delay prevents flashes when sweeping across the item bar
- Normal click still uses the item / opens the buy flow; tooltip is purely informational

### Mobile
- Pointer down on an item trigger → after a **400ms** hold, tooltip appears (same timing as existing grid long-press)
- Pointer release → tooltip hides
- If the long-press fired, the subsequent synthesized click is **suppressed** — long-press is "inspect only," the item is NOT used and a purchase is NOT made
- Short tap (<400ms release, or movement >8px before 400ms) behaves exactly as it does today
- Movement threshold: if the pointer moves more than 8px before 400ms, the long-press is cancelled (treat as scroll intent — the item bar can overflow horizontally on narrow screens)
- `pointercancel` (e.g., OS-level scroll takeover): cancel the long-press, hide tooltip if shown

### Both
- Tooltip with pickaxe targeting active still works — no suppression
- Tooltip is dismissed on window `scroll` or `resize` (simpler than repositioning)

## Tooltip content

One data table in `game.js`:

```js
const ITEM_TOOLTIPS = {
  potion:  { name: 'Potion',      desc: 'Restore 1 ❤️.',                                          howto: 'Tap to use instantly.' },
  scanner: { name: 'Scanner',     desc: 'Reveal the 3×3 around you.',                              howto: 'Tap to use instantly.' },
  pickaxe: { name: 'Pickaxe',     desc: 'Break one wall tile.',                                    howto: 'Tap, then select a wall.' },
  row:     { name: 'Row Scan',    desc: 'Reveal along your row until walls stop it.',              howto: 'Tap to use instantly.' },
  column:  { name: 'Column Scan', desc: 'Reveal along your column until walls stop it.',           howto: 'Tap to use instantly.' },
  cross:   { name: 'Cross Scan',  desc: 'Reveal along all four diagonals until walls stop them.',  howto: 'Tap to use instantly.' },
};
```

Rendered layout:
```
Potion            <- bold, name
Restore 1 ❤️.     <- normal weight, description
Tap to use instantly.  <- dimmer / italic, how-to
```

## Architecture

### One shared tooltip element
A single `<div id="tooltip">` in `index.html` (sibling of `#overlay`, outside `#viewport` so it is never clipped by pan or overflow). Repositioned per trigger. `position: fixed`, `pointer-events: none`.

### Helper module in `game.js`
```
ITEM_TOOLTIPS                     // data
attachTooltip(el, itemKey)        // wire pointer events onto any element
showTooltip(triggerEl, itemKey)   // render content, position, unhide
hideTooltip()                     // hide shared element, clear state
positionTooltip(triggerEl)        // compute top/left with flip + clamp
```

### Call sites
1. **Item-bar buttons** — attached once during init. The six `.item-btn` elements are static in HTML, keyed by `data-item`.
2. **Shop slots** — attached at the end of `renderMerchant`, after the slot HTML is injected. Slots re-render on buy/reroll, so this re-runs per render. Each `.shop-slot` uses the `slot.type` for its tooltip key.

### Click suppression
When a long-press fires, set `triggerEl._suppressNextClick = true`. Consumers early-return if that flag is set:
- `onItemButtonClick(itemKey)` — look up the button via `document.getElementById('item-' + itemKey)`, read and clear the flag, early-return if true
- `buyFromMerchant(idx)` — look up the slot via `document.querySelectorAll('#overlay-content .shop-slot')[idx]`, read and clear the flag, early-return if true. Long-press is attached to the `.shop-slot`; since pointer events bubble, long-pressing the inner Buy button also triggers it, and the suppress flag is set on the slot

## Interaction state machine (per trigger)

States: `idle` → `pending` → `shown`

**Desktop (mouse):**
- `pointerenter` → `pending`, start 300ms timer
- timer fires → `shown`
- `pointerleave` → clear timer, `hideTooltip()`, → `idle`

**Mobile (touch / pen):**
- `pointerdown` → `pending`, start 400ms timer, record `startX/startY`
- `pointermove` → if `|dx|² + |dy|² > 64` (8px), clear timer, → `idle`
- timer fires → `shown`, set `triggerEl._suppressNextClick = true`
- `pointerup` → if `shown`, `hideTooltip()`; → `idle`. If `pending` (released before 400ms), clear timer without showing; → `idle`
- `pointercancel` → clear timer, `hideTooltip()` if shown, → `idle`

Pointer type is distinguished via `event.pointerType`: `'mouse'` uses the desktop branch, `'touch' | 'pen'` uses the mobile branch.

## Positioning

`positionTooltip(triggerEl)` uses `getBoundingClientRect()`.

1. **Preferred:** above trigger, horizontally centered on it, 8px gap, downward-pointing tail
2. **Flip below** if `trigger.top - tooltipHeight - 8 < 8` (would clip viewport top) — tail flips upward
3. **Horizontal clamp:** `left = max(8, min(preferredLeft, viewportWidth - tooltipWidth - 8))`. Tail remains centered on the trigger; tail can be off-center relative to the tooltip body when clamped

## Visual style

- Background: `#16213e` (matches item buttons)
- Border: `1px solid #3a4a6a`
- Border-radius: 8px
- Padding: 0.5rem 0.65rem
- Max-width: 220px
- Tail: 6px triangle via `::before` pseudo-element, matching bg + border
- `z-index`: above `#overlay` (currently no items sit above overlay except overlay content — use something like 1000)
- `pointer-events: none`
- Text: `.tooltip-name` bold, `.tooltip-desc` normal, `.tooltip-howto` dimmer (`#aab` or similar) and italic
- No entrance animation — instant show/hide, keeps it feeling snappy

## Files to modify

- `index.html` — add `<div id="tooltip" class="hidden" role="tooltip"></div>` as sibling of `#overlay`
- `style.css` — `#tooltip` base, `.tooltip-name/desc/howto`, tail pseudo-element + `.tooltip-below` flipped variant
- `game.js`:
  - `ITEM_TOOLTIPS` constant
  - `attachTooltip`, `showTooltip`, `hideTooltip`, `positionTooltip` (≈80 LOC)
  - Init call: attach once per `.item-btn` with its `data-item`
  - In `renderMerchant`: after injecting overlay HTML, query `.shop-slot` elements and attach with `slot.type`
  - Early-return guard in `onItemButtonClick` checking `button._suppressNextClick`
  - Early-return guard in `buyFromMerchant` checking the slot element's `_suppressNextClick`

## Test plan

Manual testing covers:

**Desktop:**
- Hover each of the 6 item-bar buttons → tooltip appears after 300ms, positioned above when space, flipped below near top
- Sweep cursor across the bar quickly → no tooltips flash
- Hover each shop slot → tooltip shows with item info; Buy button still clicks normally
- Hover into a clamped position (narrow window, leftmost/rightmost slot) → tooltip stays on screen, tail stays on trigger

**Mobile (simulated via devtools + real device if available):**
- Long-press each item-bar button → tooltip appears at 400ms; release does NOT use the item
- Short tap each item-bar button → item uses as today (potion heals, pickaxe enters targeting, etc.)
- Long-press a shop slot → tooltip; release does NOT buy
- Short tap Buy on a shop slot → purchase fires as today
- Start hold, drag >8px → no tooltip, no item use, no purchase
- Narrow viewport (350px): tooltip clamps horizontally, tail on trigger

**Edge cases:**
- Pickaxe targeting mode active → long-press/hover on item bar still shows tooltip; targeting state preserved
- Scroll item bar horizontally during tooltip → tooltip hides on scroll
- Resize window with tooltip showing → tooltip hides

## Rejected alternatives

- **Per-button CSS `:hover` tooltips** — clean for desktop but sticky hover on mobile fires conflicting tooltips after tap; also duplicates tooltip markup per shop slot since slots re-render
- **Tap-to-show / tap-to-use two-step** — changes the primary action flow for every item every time; too intrusive
- **Tooltip content showing price context** — redundant with existing shop slot visuals (price + discount badge)
- **Instant desktop show with no delay** — flashes when sweeping across the bar
