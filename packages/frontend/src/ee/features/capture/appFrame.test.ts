import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AppFrameTimeoutError,
    appImageScale,
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
