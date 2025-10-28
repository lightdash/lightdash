# Big Number Font Size POC

## Problem Statement
The big number value feels too small by default, with lots of whitespace around it. It doesn't feel impactful on some dashboards, especially in larger tiles.

## Issues Fixed
1. **Title Overlap**: The tile header was cutting into the big number content. Fixed by calculating available height properly (subtracting tile header height before font size calculation).
2. **Removed Bottom Padding**: No longer need `pb={TILE_HEADER_HEIGHT}` since we account for header in size calculation.

## Current Implementation
- **Value Font Size**: 24px (min) → 64px (max)
- **Label Font Size**: 14px (min) → 32px (max)
- **Comparison Font Size**: 12px (min) → 22px (max)

## Proposed Changes (POC)
- **Value Font Size**: 24px (min) → **96px (max)** (+50% increase)
- **Label Font Size**: 14px (min) → **40px (max)** (+25% increase)
- **Comparison Font Size**: 12px (min) → 22px (max) (unchanged)

## Testing Instructions

### 1. Enable POC
The POC is already enabled in the code. Check the console logs for debugging information.

### 2. Test Different Tile Sizes
Test the following tile configurations on a dashboard:

#### Small Tiles (1x1 or 2x1)
- **Expected behavior**: Font size should stay at minimum (24px for value)
- **Goal**: Ensure small tiles don't get oversized text

#### Medium Tiles (2x2 or 3x2)
- **Expected behavior**: Font size should scale proportionally
- **Goal**: Verify readability and "big number" impact

#### Large Tiles (4x3 or larger)
- **Expected behavior**: Font size should reach near maximum (96px for value)
- **Goal**: Maximize visual impact without overwhelming the design

### 3. Check Console Logs
Open browser DevTools and check console for logs like:
```
[BigNumber POC] Tile size: {
  width: 500,
  height: 300,
  boundWidth: 500,
  boundHeight: 300,
  valueFontSize: 64,
  labelFontSize: 28
}
```

### 4. Visual Checklist
For each tile size, verify:
- [ ] Value is prominent and impactful
- [ ] Label is readable but secondary to value
- [ ] Comparison value doesn't overpower the main value
- [ ] Text doesn't overflow or clip
- [ ] Whitespace feels balanced (not too cramped or too sparse)
- [ ] Transition between sizes is smooth when resizing

### 5. Edge Cases to Test
- [ ] Very long numbers (e.g., "1,234,567,890")
- [ ] Numbers with decimals (e.g., "12.34%")
- [ ] Short numbers (e.g., "5")
- [ ] With and without labels
- [ ] With and without comparison values
- [ ] Different comparison value types (positive/negative/neutral)

## Sizing Formula
The component uses linear scaling based on tile dimensions:

```
scalingFactor = min(widthScale, heightScale)
fontSize = fontSizeMin + (fontSizeMax - fontSizeMin) × scalingFactor
```

Where:
- `widthScale = (tileWidth - 150) / (1000 - 150)`
- `heightScale = (tileHeight - 25) / (1000 - 25)`

## Alternative Options to Test

If 96px feels too large, try these alternatives:

### Option 1: Moderate Increase (80px)
```typescript
const VALUE_SIZE_MAX = 80; // +25% from original 64px
const LABEL_SIZE_MAX = 36;  // +12.5% from original 32px
```

### Option 2: Conservative Increase (72px)
```typescript
const VALUE_SIZE_MAX = 72; // +12.5% from original 64px
const LABEL_SIZE_MAX = 34;  // +6.25% from original 32px
```

### Option 3: Aggressive Increase (112px)
```typescript
const VALUE_SIZE_MAX = 112; // +75% from original 64px
const LABEL_SIZE_MAX = 44;   // +37.5% from original 32px
```

## Decision Criteria

Choose the max font size that:
1. ✅ Makes large tiles feel more impactful
2. ✅ Maintains readability across all tile sizes
3. ✅ Doesn't cause text overflow or clipping
4. ✅ Preserves visual hierarchy (value > label > comparison)
5. ✅ Feels balanced with the Mantine design system

## Cleanup After Testing

Once you've chosen the final values, remove:
1. The POC comments in the constants section
2. The console.log debugging statement
3. This POC_FONT_SIZE_TESTING.md file

Update the constants to the chosen values and commit.
