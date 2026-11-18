export type Size = { width: number; height: number };
export type PixelRect = { x: number; y: number; width: number; height: number };

const ASPECT_TOLERANCE = 0.02;
// Chrome's sharing bar can shrink the viewport after the first frame.
const LOOSE_ASPECT_TOLERANCE = 0.1;
const SAME_SCREEN_MAX_DIFF = 4;

// A capture of this tab has the viewport's shape; another window rarely does.
export const isFrameFromThisTab = (
    frame: Size,
    viewport: Size,
    tolerance: number = ASPECT_TOLERANCE,
): boolean => {
    if (frame.width <= 0 || frame.height <= 0) return false;
    if (viewport.width <= 0 || viewport.height <= 0) return false;
    const frameAspect = frame.width / frame.height;
    const viewportAspect = viewport.width / viewport.height;
    return Math.abs(frameAspect - viewportAspect) / viewportAspect <= tolerance;
};

// The capture handle identifies this exact tab; shape is only a fallback.
export const isThisTab = (input: {
    captureHandle: string | null;
    expectedHandle: string;
    displaySurface: string | null;
    frame: Size;
    viewport: Size;
}): boolean => {
    if (input.captureHandle !== null) {
        return input.captureHandle === input.expectedHandle;
    }
    if (input.displaySurface !== null && input.displaySurface !== 'browser') {
        return false;
    }
    return isFrameFromThisTab(
        input.frame,
        input.viewport,
        LOOSE_ASPECT_TOLERANCE,
    );
};

export const cropRectForRegion = (
    region: PixelRect,
    viewport: Size,
    frame: Size,
): PixelRect => {
    const left = Math.max(0, region.x);
    const top = Math.max(0, region.y);
    const right = Math.min(viewport.width, region.x + region.width);
    const bottom = Math.min(viewport.height, region.y + region.height);
    const scaleX = frame.width / viewport.width;
    const scaleY = frame.height / viewport.height;
    return {
        x: Math.round(left * scaleX),
        y: Math.round(top * scaleY),
        width: Math.round(Math.max(0, right - left) * scaleX),
        height: Math.round(Math.max(0, bottom - top) * scaleY),
    };
};

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
