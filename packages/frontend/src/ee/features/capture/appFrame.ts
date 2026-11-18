import { type Size } from './frameGeometry';
import { toThumb, type TabFrame } from './useTabFrame';

// Spike (PROD-13181): the surface draws its own picture instead of tab capture.
type FrameSourceMode = 'tab' | 'app';
type FrameSourceChoice =
    | { source: 'app'; ms: number }
    | {
          source: 'tab';
          reason: 'switch-off' | 'no-app-source' | 'timeout' | 'error';
      };

const SWITCH_KEY = 'inlineCapture';
/** An app that has not answered by now is taken to have no handler. */
export const APP_PROBE_TIMEOUT_MS = 1500;
/** Once the app has answered the probe, a frame may take this long. */
const APP_FRAME_TIMEOUT_MS = 5000;
// The app renders at min(2, devicePixelRatio); a scrollbar narrows it a little.
const APP_MAX_PIXEL_RATIO = 2;
const WIDTH_TOLERANCE = 0.03;

export const logInlineCapture = (message: string): void => {
    // eslint-disable-next-line no-console
    console.info(`[inline-capture] ${message}`);
};

/** The app sends its own picture unless `inlineCapture=tab` asks for the shared tab; the URL wins over the stored value. */
export const readFrameSourceMode = (
    search: string,
    stored: string | null,
): FrameSourceMode => {
    const fromUrl = new URLSearchParams(search).get(SWITCH_KEY);
    return (fromUrl ?? stored) === 'tab' ? 'tab' : 'app';
};

export const currentFrameSourceMode = (): FrameSourceMode => {
    let stored: string | null = null;
    try {
        stored = window.localStorage.getItem(SWITCH_KEY);
    } catch {
        // Storage can be blocked; the URL switch still works.
    }
    return readFrameSourceMode(window.location.search, stored);
};

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
 * Decides, once per recording, where pictures come from. The app is asked for
 * one picture; no valid answer in time means tab capture for this recording.
 */
export const resolveFrameSource = async ({
    mode,
    probe,
    timeoutMs = APP_PROBE_TIMEOUT_MS,
    now = () => performance.now(),
}: {
    mode: FrameSourceMode;
    probe: (() => Promise<unknown>) | null;
    timeoutMs?: number;
    now?: () => number;
}): Promise<FrameSourceChoice> => {
    if (mode !== 'app') return { source: 'tab', reason: 'switch-off' };
    if (!probe) return { source: 'tab', reason: 'no-app-source' };
    const startedAt = now();
    try {
        const answer = await withTimeout(probe(), timeoutMs);
        if (!isAppImage(answer)) return { source: 'tab', reason: 'error' };
        return { source: 'app', ms: Math.round(now() - startedAt) };
    } catch (error) {
        return {
            source: 'tab',
            reason: error instanceof AppFrameTimeoutError ? 'timeout' : 'error',
        };
    }
};

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

/**
 * Asks the surface for its picture (the whole page, from the top) and keeps
 * the part the size of the region. The app does not report how far it has
 * scrolled, so a scrolled app still gives the top of the page.
 */
export const grabAppFrame = async (
    grabImage: () => Promise<unknown>,
    region: Size,
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
        context.drawImage(page, 0, 0);
        const bitmap = await createImageBitmap(canvas);
        return { bitmap, thumb: toThumb(bitmap) };
    } finally {
        page.close();
    }
};
