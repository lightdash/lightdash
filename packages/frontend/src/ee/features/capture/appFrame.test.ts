import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    APP_PROBE_TIMEOUT_MS,
    AppFrameTimeoutError,
    appImageScale,
    isAppImage,
    readFrameSourceMode,
    resolveFrameSource,
    withTimeout,
} from './appFrame';

const png = () => new Blob(['x'], { type: 'image/png' });

describe('readFrameSourceMode', () => {
    it('uses tab capture when nothing is set', () => {
        expect(readFrameSourceMode('', null)).toBe('tab');
    });

    it('turns on from the URL', () => {
        expect(readFrameSourceMode('?inlineCapture=app', null)).toBe('app');
        expect(readFrameSourceMode('?a=1&inlineCapture=app', null)).toBe('app');
    });

    it('turns on from the stored value', () => {
        expect(readFrameSourceMode('', 'app')).toBe('app');
    });

    it('lets the URL override the stored value', () => {
        expect(readFrameSourceMode('?inlineCapture=tab', 'app')).toBe('tab');
    });

    it('ignores other values', () => {
        expect(readFrameSourceMode('?inlineCapture=yes', 'true')).toBe('tab');
    });
});

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
        const late = withTimeout(new Promise(() => {}), 100);
        const check =
            await expect(late).rejects.toBeInstanceOf(AppFrameTimeoutError);
        await vi.advanceTimersByTimeAsync(100);
        await check;
    });

    it('passes a failure through', async () => {
        await expect(
            withTimeout(Promise.reject(new Error('boom')), 100),
        ).rejects.toThrow('boom');
    });
});

describe('resolveFrameSource', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('never asks the app when the switch is off', async () => {
        const probe = vi.fn(async () => png());
        await expect(
            resolveFrameSource({ mode: 'tab', probe }),
        ).resolves.toEqual({ source: 'tab', reason: 'switch-off' });
        expect(probe).not.toHaveBeenCalled();
    });

    it('uses tab capture when the surface has no picture of its own', async () => {
        await expect(
            resolveFrameSource({ mode: 'app', probe: null }),
        ).resolves.toEqual({ source: 'tab', reason: 'no-app-source' });
    });

    it('uses the app when it answers with a picture', async () => {
        const times = [100, 340];
        const choice = await resolveFrameSource({
            mode: 'app',
            probe: async () => png(),
            now: () => times.shift() ?? 0,
        });
        expect(choice).toEqual({ source: 'app', ms: 240 });
    });

    it('falls back when the app does not answer in time', async () => {
        const choice = resolveFrameSource({
            mode: 'app',
            probe: () => new Promise(() => {}),
        });
        await vi.advanceTimersByTimeAsync(APP_PROBE_TIMEOUT_MS - 1);
        let settled = false;
        void choice.then(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await expect(choice).resolves.toEqual({
            source: 'tab',
            reason: 'timeout',
        });
    });

    it('falls back when the app answers with an error', async () => {
        await expect(
            resolveFrameSource({
                mode: 'app',
                probe: async () => {
                    throw new Error('Screenshot failed');
                },
            }),
        ).resolves.toEqual({ source: 'tab', reason: 'error' });
    });

    it('falls back when the answer is not a picture', async () => {
        await expect(
            resolveFrameSource({
                mode: 'app',
                probe: async () => ({ html: '<p>hi</p>' }),
            }),
        ).resolves.toEqual({ source: 'tab', reason: 'error' });
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
