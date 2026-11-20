export type Size = { width: number; height: number };
export type PixelRect = { x: number; y: number; width: number; height: number };

const SAME_SCREEN_MAX_DIFF = 4;

// Compares two greyscale thumbnails by mean absolute difference.
export const sameScreen = (
    a: Uint8ClampedArray,
    b: Uint8ClampedArray,
): boolean => {
    if (a.length !== b.length || a.length === 0) return false;
    let total = 0;
    for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
    return total / a.length < SAME_SCREEN_MAX_DIFF;
};
