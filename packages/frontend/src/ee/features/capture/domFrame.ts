import html2canvas from 'html2canvas-pro';
import {
    mountedAppFrames,
    type AppFrame,
} from '../../../features/apps/appFrameRegistry';
import { appFramePlacement } from './appFramePlacement';
import { CAPTURE_IGNORE_ATTRIBUTE, pageRectForRegion } from './frameSource';
import { type TabFrame } from './tabFrame';

// How long a frame gets to answer before the picture goes without it.
const APP_FRAME_TIMEOUT_MS = 5000;

const pictureOf = async (frame: AppFrame): Promise<ImageBitmap | null> => {
    let timer = 0;
    const late = new Promise<null>((resolve) => {
        timer = window.setTimeout(() => resolve(null), APP_FRAME_TIMEOUT_MS);
    });
    try {
        const blob = await Promise.race([frame.capture(), late]);
        return blob ? await createImageBitmap(blob) : null;
    } catch {
        // An app that cannot picture itself stays blank, as before.
        return null;
    } finally {
        window.clearTimeout(timer);
    }
};

// A custom chart or app sits in a sandboxed frame the page cannot draw: each
// one in view draws itself and is put in its place.
const drawAppFrames = async (
    canvas: HTMLCanvasElement,
    page: { x: number; y: number; width: number; height: number },
): Promise<void> => {
    const context = canvas.getContext('2d');
    if (!context || page.width === 0) return;
    const scale = canvas.width / page.width;
    const inView = mountedAppFrames().flatMap((frame) => {
        const element = frame.getElement();
        if (!element?.isConnected) return [];
        if (element.closest(`[${CAPTURE_IGNORE_ATTRIBUTE}]`)) return [];
        const box = element.getBoundingClientRect();
        const onPage = {
            x: box.left + window.scrollX,
            y: box.top + window.scrollY,
            width: box.width,
            height: box.height,
        };
        const visible = appFramePlacement({
            frame: onPage,
            page,
            scale,
            picture: { width: 1, height: 1 },
        });
        return visible ? [{ frame, onPage }] : [];
    });
    await Promise.all(
        inView.map(async ({ frame, onPage }) => {
            const picture = await pictureOf(frame);
            if (!picture) return;
            const placed = appFramePlacement({
                frame: onPage,
                page,
                scale,
                picture: { width: picture.width, height: picture.height },
            });
            if (placed) {
                context.drawImage(
                    picture,
                    placed.source.x,
                    placed.source.y,
                    placed.source.width,
                    placed.source.height,
                    placed.target.x,
                    placed.target.y,
                    placed.target.width,
                    placed.target.height,
                );
            }
            picture.close();
        }),
    );
};

/**
 * Draws the visible part of the page from the DOM, so the browser never
 * asks to share the tab. Sandboxed app frames add their own pictures.
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
    await drawAppFrames(canvas, rect);
    const bitmap = await createImageBitmap(canvas);
    return { bitmap };
};
