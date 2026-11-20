import { type PixelRect, type Size } from './frameGeometry';

/** Elements carrying this attribute are left out of a DOM-rendered frame. */
export const CAPTURE_IGNORE_ATTRIBUTE = 'data-capture-ignore';

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
