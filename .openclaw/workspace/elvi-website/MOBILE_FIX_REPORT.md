# Mobile Touch Scrolling Fix Report

## Problem Summary

Mobile devices cannot scroll the 3D parallax experience. Touch gestures have no effect, leaving users stuck on the Hero section.

---

## Root Causes Identified

### 1. Passive Event Listeners (Critical)

**Location:** `App.tsx` lines 290-293

```javascript
// BROKEN - passive: true prevents preventDefault()
container.addEventListener('touchstart', handleTouchStart, { passive: true });
container.addEventListener('touchmove', handleTouchMove, { passive: true });
```

**Why it fails:** When `passive: true`, the browser optimises for smooth scrolling by ignoring any `preventDefault()` calls. Even though our handlers don't currently call it, the browser may still trigger native behaviors (pull-to-refresh, overscroll bounce, etc.) that compete with our custom scroll.

---

### 2. Missing `preventDefault()` in Touch Handler

**Location:** `App.tsx` line 241-248

```javascript
const handleTouchMove = (e: TouchEvent) => {
  if (!isTouching.current) return;
  // Missing: e.preventDefault() to stop native scroll
  const deltaY = lastTouchY.current - e.touches[0].clientY;
  targetZ.current = Math.max(0, Math.min(targetZ.current + deltaY * 4, MAX_Z));
  lastTouchY.current = e.touches[0].clientY;
};
```

**Why it fails:** Without `preventDefault()`, the browser may still attempt native scrolling, overscroll effects, or pull-to-refresh, causing our custom Z-translation to be overridden or ignored.

---

### 3. Unscaled Scroll Multiplier

**Location:** `App.tsx` line 246

```javascript
targetZ.current = Math.max(0, Math.min(targetZ.current + deltaY * 4, MAX_Z));
```

**Why it fails:** `deltaY * 4` uses raw pixel values. A 100px swipe on a 900px mobile screen represents 11% of viewport, but on a 1400px desktop it's only 7%. This causes:
- Erratic, oversensitive scrolling on mobile
- Inconsistent feel across devices

---

### 4. Duplicate `touch-action` Declarations

**Locations:**
- `index.html` body: `touch-action: none`
- `App.tsx` container: `style={{ touchAction: 'none' }}`

**Why it's problematic:** While not directly causing failure, this redundancy can cause unexpected behavior on some mobile browsers. The rule should be applied only to the scroll container.

---

## Recommended Fixes

### Fix 1: Non-Passive Touch Listeners

```javascript
container.addEventListener('touchstart', handleTouchStart, { passive: false });
container.addEventListener('touchmove', handleTouchMove, { passive: false });
container.addEventListener('touchend', handleTouchEnd, { passive: false });
container.addEventListener('touchcancel', handleTouchEnd, { passive: false });
```

### Fix 2: Add `preventDefault()` to Touch Handlers

```javascript
const handleTouchStart = (e: TouchEvent) => {
  e.preventDefault(); // Stop native touch behaviors
  isTouching.current = true;
  touchStartY.current = e.touches[0].clientY;
  lastTouchY.current = e.touches[0].clientY;
};

const handleTouchMove = (e: TouchEvent) => {
  if (!isTouching.current) return;
  e.preventDefault(); // Critical: stop native scroll
  lastScrollTime.current = Date.now();

  const deltaY = lastTouchY.current - e.touches[0].clientY;
  // ... rest of handler
};
```

### Fix 3: Viewport-Normalised Scroll Sensitivity

```javascript
const handleTouchMove = (e: TouchEvent) => {
  if (!isTouching.current) return;
  e.preventDefault();
  lastScrollTime.current = Date.now();

  const currentY = e.touches[0].clientY;
  const deltaY = lastTouchY.current - currentY;

  // Normalise by viewport height for consistent feel
  const scrollFactor = deltaY / window.innerHeight;
  const scrollAmount = scrollFactor * 2500; // ~1/3 of MAX_Z per full swipe

  targetZ.current = Math.max(0, Math.min(targetZ.current + scrollAmount, MAX_Z));
  lastTouchY.current = currentY;
};
```

### Fix 4: Remove `touch-action` from Body

In `index.html`, remove:
```css
touch-action: none;
```

Keep only in the React container:
```jsx
<div style={{ touchAction: 'none' }}>
```

---

## Do / Don't Guide for Mobile-First Behavior

### ✅ DO

| Practice | Reason |
|----------|--------|
| Use `{ passive: false }` for custom scroll handlers | Allows `preventDefault()` to block native behaviors |
| Call `e.preventDefault()` in touchmove | Stops pull-to-refresh, overscroll bounce |
| Normalise scroll delta by viewport | Consistent experience across screen sizes |
| Apply `touch-action: none` only to scroll container | Avoids global touch blocking |
| Test on real devices, not just emulators | Chrome DevTools touch emulation misses edge cases |
| Clamp scroll values with `Math.max/min` | Prevents overshooting bounds |
| Add velocity/momentum for natural feel | Users expect inertia on mobile |

### ❌ DON'T

| Anti-Pattern | Consequence |
|--------------|-------------|
| Use `passive: true` with custom scroll | Browser ignores your `preventDefault()` |
| Apply `touch-action: none` to `body` | Blocks all touch globally, breaks form inputs |
| Use raw pixel multipliers | Erratic behavior across devices |
| Forget `touchcancel` handler | Scroll gets stuck if touch interrupted |
| Block touch on interactive elements | Buttons/inputs become unusable |
| Skip the `isTouching` guard | Handlers fire without valid touch state |

---

## Testing Checklist

- [ ] Swipe up scrolls forward (Hero → Services)
- [ ] Swipe down scrolls backward (Services → Hero)
- [ ] Pull-to-refresh is blocked
- [ ] Overscroll bounce is prevented
- [ ] Snap to section works after swipe
- [ ] Form inputs in Contact section are touchable
- [ ] Nav dots are tappable
- [ ] Audio toggle button works
- [ ] No horizontal scroll triggered by diagonal swipes

---

## Browser Compatibility Notes

| Browser | Notes |
|---------|-------|
| iOS Safari | Most strict about passive listeners; requires `{ passive: false }` |
| Chrome Android | Generally permissive but respects passive flag |
| Samsung Internet | Similar to Chrome; test on actual device |
| Firefox Android | Good standards compliance |

---

*Report generated for ZeDigital mobile fix implementation*
