import { type Size } from './frameGeometry';
import { type TabFrame } from './tabFrame';

/** Once the app has answered the probe, a frame may take this long. */
const APP_FRAME_TIMEOUT_MS = 5000;
// The app renders at min(2, devicePixelRatio); a scrollbar narrows it a little.
const APP_MAX_PIXEL_RATIO = 2;
const WIDTH_TOLERANCE = 0.03;

export class AppFrameTimeoutError extends Error {
    constructor(ms: number) {
        super(`The app did not answer within ${ms} ms`);
        this.name = 'AppFrameTimeoutError';
    }
}

export const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new AppFrameTimeoutError(ms)),
            ms,
        );
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });

/** The app answers with a PNG blob; anything else is not a picture. */
export const isAppImage = (value: unknown): value is Blob =>
    value instanceof Blob && value.size > 0 && value.type.startsWith('image/');

/**
 * Image pixels per CSS pixel of the app's picture. The app's own pixel ratio
 * is exact when the picture's width fits it; a very tall page is scaled down
 * by the renderer, and then only the width tells the scale.
 */
export const appImageScale = (
    image: Size,
    region: Size,
    devicePixelRatio: number,
): number => {
    if (image.width <= 0 || region.width <= 0) return 1;
    const expected = Math.min(APP_MAX_PIXEL_RATIO, devicePixelRatio || 1);
    const measured = image.width / region.width;
    return Math.abs(measured - expected) / expected <= WIDTH_TOLERANCE
        ? expected
        : measured;
};

/** Where the part of the app's picture that is on screen starts, in image pixels. */
export const appImageOffset = (
    scroll: { x: number; y: number },
    scale: number,
): { x: number; y: number } => ({
    x: Math.round(Math.max(0, scroll.x) * scale),
    y: Math.round(Math.max(0, scroll.y) * scale),
});

/**
 * Asks the surface for its picture (the whole page, from the top) and keeps
 * the part that is on screen: the size of the region, from where the app has
 * scrolled to. Marks are made on what is on screen, so they line up with it.
 */
export const grabAppFrame = async (
    grabImage: () => Promise<unknown>,
    region: Size,
    scroll: { x: number; y: number },
    timeoutMs: number = APP_FRAME_TIMEOUT_MS,
): Promise<TabFrame> => {
    const image = await withTimeout(grabImage(), timeoutMs);
    if (!isAppImage(image)) throw new Error('The app sent no picture');
    const page = await createImageBitmap(image);
    try {
        const scale = appImageScale(
            { width: page.width, height: page.height },
            region,
            window.devicePixelRatio,
        );
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(region.width * scale);
        canvas.height = Math.round(region.height * scale);
        if (canvas.width === 0 || canvas.height === 0) {
            throw new Error('Capture area is off screen');
        }
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not draw the capture');
        // A page shorter than the region leaves the rest blank.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const from = appImageOffset(scroll, scale);
        context.drawImage(page, -from.x, -from.y);
        const bitmap = await createImageBitmap(canvas);
        return { bitmap };
    } finally {
        page.close();
    }
};
