import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AppFrameTimeoutError,
    appImageOffset,
    appImageScale,
    grabAppFrame,
    isAppImage,
    withTimeout,
} from './appFrame';

const png = () => new Blob(['x'], { type: 'image/png' });

describe('isAppImage', () => {
    it('accepts an image blob', () => {
        expect(isAppImage(png())).toBe(true);
    });

    it('rejects anything that is not a non-empty image blob', () => {
        expect(isAppImage(new Blob([], { type: 'image/png' }))).toBe(false);
        expect(isAppImage(new Blob(['x'], { type: 'text/html' }))).toBe(false);
        expect(isAppImage('data:image/png;base64,AAAA')).toBe(false);
        expect(isAppImage({ type: 'image/png', size: 4 })).toBe(false);
        expect(isAppImage(null)).toBe(false);
    });
});

describe('withTimeout', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('passes a prompt answer through', async () => {
        await expect(withTimeout(Promise.resolve(7), 100)).resolves.toBe(7);
    });

    it('rejects when the answer is late', async () => {
        const late = withTimeout(new Promise(() => {}), 100).catch(
            (error: unknown) => error,
        );
        await vi.advanceTimersByTimeAsync(100);
        expect(await late).toBeInstanceOf(AppFrameTimeoutError);
    });

    it('passes a failure through', async () => {
        await expect(
            withTimeout(Promise.reject(new Error('boom')), 100),
        ).rejects.toThrow('boom');
    });
});

describe('appImageScale', () => {
    it('uses the device pixel ratio, at most 2', () => {
        expect(
            appImageScale(
                { width: 1600, height: 4000 },
                { width: 800, height: 600 },
                2,
            ),
        ).toBe(2);
        expect(
            appImageScale(
                { width: 1600, height: 4000 },
                { width: 800, height: 600 },
                3,
            ),
        ).toBe(2);
        expect(
            appImageScale(
                { width: 800, height: 900 },
                { width: 800, height: 600 },
                1,
            ),
        ).toBe(1);
    });

    it('stays exact when a scrollbar narrows the page', () => {
        expect(
            appImageScale(
                { width: 1570, height: 4000 },
                { width: 800, height: 600 },
                2,
            ),
        ).toBe(2);
    });

    it('measures the scale when the picture was scaled down', () => {
        expect(
            appImageScale(
                { width: 800, height: 16384 },
                { width: 800, height: 600 },
                2,
            ),
        ).toBe(1);
    });

    it('survives empty sizes', () => {
        expect(
            appImageScale(
                { width: 0, height: 0 },
                { width: 800, height: 600 },
                2,
            ),
        ).toBe(1);
    });
});

describe('appImageOffset', () => {
    it('starts the picture where the app has scrolled to, in image pixels', () => {
        expect(appImageOffset({ x: 0, y: 300 }, 2)).toEqual({ x: 0, y: 600 });
        expect(appImageOffset({ x: 10.4, y: 0 }, 1)).toEqual({ x: 10, y: 0 });
    });

    it('never starts above or left of the page', () => {
        expect(appImageOffset({ x: -5, y: -40 }, 2)).toEqual({ x: 0, y: 0 });
    });
});

describe('grabAppFrame', () => {
    const drawImage = vi.fn();
    const scope = globalThis as unknown as {
        createImageBitmap: unknown;
    };
    const realCreateImageBitmap = scope.createImageBitmap;
    beforeEach(() => {
        drawImage.mockClear();
        // The app's picture is the whole page: 800 wide, 4000 tall, at 2x.
        scope.createImageBitmap = vi.fn(async (source: unknown) =>
            source instanceof Blob
                ? { width: 1600, height: 8000, close: vi.fn() }
                : { width: 1600, height: 1200, close: vi.fn() },
        );
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            fillStyle: '',
            fillRect: vi.fn(),
            drawImage,
        } as unknown as CanvasRenderingContext2D);
        vi.stubGlobal('devicePixelRatio', 2);
    });
    afterEach(() => {
        scope.createImageBitmap = realCreateImageBitmap;
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('pictures a scrolled app from where it is scrolled to, so marks line up', async () => {
        await grabAppFrame(
            async () => png(),
            { width: 800, height: 600 },
            { x: 0, y: 300 },
        );
        // 300 CSS pixels down the page is 600 image pixels at 2x.
        expect(drawImage).toHaveBeenCalledWith(expect.anything(), -0, -600);
    });

    it('pictures an app that has not scrolled from its top', async () => {
        await grabAppFrame(
            async () => png(),
            { width: 800, height: 600 },
            { x: 0, y: 0 },
        );
        expect(drawImage).toHaveBeenCalledWith(expect.anything(), -0, -0);
    });
});
