import html2canvas from 'html2canvas-pro';
import { CAPTURE_IGNORE_ATTRIBUTE, pageRectForRegion } from './frameSource';
import { type TabFrame } from './tabFrame';

/**
 * Draws the visible part of the page from the DOM, so the browser never
 * asks to share the tab. Only works when everything on screen is same origin.
 */
export const grabDomFrame = async (region: DOMRect): Promise<TabFrame> => {
    const rect = pageRectForRegion(
        {
            x: region.left,
            y: region.top,
            width: region.width,
            height: region.height,
        },
        { width: window.innerWidth, height: window.innerHeight },
        { x: window.scrollX, y: window.scrollY },
    );
    if (rect.width === 0 || rect.height === 0) {
        throw new Error('Capture area is off screen');
    }
    const canvas = await html2canvas(document.documentElement, {
        ...rect,
        // Same pixel density as a tab capture frame.
        scale: window.devicePixelRatio || 1,
        useCORS: true,
        logging: false,
        // The pill and the ink are drawn on afterwards, never in the frame.
        ignoreElements: (element) =>
            element.hasAttribute(CAPTURE_IGNORE_ATTRIBUTE),
    });
    const bitmap = await createImageBitmap(canvas);
    return { bitmap };
};
