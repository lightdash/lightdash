import { type PixelRect, type Size } from './frameGeometry';
import { type CaptureFrameSource } from './types';

/** URL parameter and localStorage key that pick how screenshots are taken. */
const FRAME_SOURCE_KEY = 'inlineCapture';
/** Elements carrying this attribute are left out of a DOM-rendered frame. */
export const CAPTURE_IGNORE_ATTRIBUTE = 'data-inline-capture-ignore';

// The page draws itself unless "tab" asks for the shared tab instead.
// The URL wins over localStorage.
export const resolveFrameSource = (input: {
    search: string;
    stored: string | null;
}): CaptureFrameSource => {
    const fromUrl = new URLSearchParams(input.search).get(FRAME_SOURCE_KEY);
    return (fromUrl ?? input.stored) === 'tab' ? 'tab' : 'dom';
};

export const readFrameSource = (): CaptureFrameSource => {
    let stored: string | null = null;
    try {
        stored = window.localStorage.getItem(FRAME_SOURCE_KEY);
    } catch {
        // Storage can be blocked; the URL parameter still works.
    }
    return resolveFrameSource({ search: window.location.search, stored });
};

// The part of the region that is on screen, in page (scrolled) coordinates.
export const pageRectForRegion = (
    region: PixelRect,
    viewport: Size,
    scroll: { x: number; y: number },
): PixelRect => {
    const left = Math.max(0, region.x);
    const top = Math.max(0, region.y);
    const right = Math.min(viewport.width, region.x + region.width);
    const bottom = Math.min(viewport.height, region.y + region.height);
    return {
        x: Math.round(left + scroll.x),
        y: Math.round(top + scroll.y),
        width: Math.round(Math.max(0, right - left)),
        height: Math.round(Math.max(0, bottom - top)),
    };
};

export const frameLogLine = (
    method: CaptureFrameSource | 'app',
    ms: number,
    size: Size | null,
): string =>
    `method=${method} ms=${Math.round(ms)} ${
        size ? `size=${size.width}x${size.height}` : 'failed'
    }`;
