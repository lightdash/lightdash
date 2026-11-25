import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIframeInspectAt } from './useIframeInspectAt';

const app = { postMessage: vi.fn() } as unknown as Window & {
    postMessage: ReturnType<typeof vi.fn>;
};
const iframeRef = {
    current: { contentWindow: app } as unknown as HTMLIFrameElement,
};

const fromApp = (data: unknown, source: unknown = app) =>
    act(async () => {
        window.dispatchEvent(
            new MessageEvent('message', {
                data,
                source: source as Window,
            }),
        );
    });

const lastAsk = () => app.postMessage.mock.calls.at(-1)?.[0];

const element = {
    label: '[button "Save"]',
    rect: { x: 10, y: 20, width: 30, height: 40 },
};

describe('useIframeInspectAt', () => {
    beforeEach(() => {
        app.postMessage.mockClear();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('a bundle that never announced it gets null without being asked', async () => {
        const { result } = renderHook(() =>
            useIframeInspectAt(iframeRef, 'a', null),
        );
        await expect(result.current.inspectAt({ x: 1, y: 2 })).resolves.toBe(
            null,
        );
        expect(app.postMessage).not.toHaveBeenCalled();
    });

    it('asks the app and resolves with its answer', async () => {
        const { result } = renderHook(() =>
            useIframeInspectAt(iframeRef, 'a', null),
        );
        await fromApp({ type: 'lightdash:sdk:inspect-at-available' });
        const answer = result.current.inspectAt({ x: 15, y: 25 });
        expect(lastAsk()).toEqual({
            type: 'lightdash:sdk:inspect-at',
            id: expect.any(String),
            x: 15,
            y: 25,
        });
        await fromApp({
            type: 'lightdash:sdk:inspect-at-response',
            id: lastAsk().id,
            element,
        });
        await expect(answer).resolves.toEqual(element);
    });

    it('takes answers only from the app, and drops a malformed one', async () => {
        const { result } = renderHook(() =>
            useIframeInspectAt(iframeRef, 'a', null),
        );
        // An announce from another window does not count.
        await fromApp({ type: 'lightdash:sdk:inspect-at-available' }, {});
        await expect(result.current.inspectAt({ x: 1, y: 1 })).resolves.toBe(
            null,
        );

        await fromApp({ type: 'lightdash:sdk:inspect-at-available' });
        const answer = result.current.inspectAt({ x: 1, y: 1 });
        const { id } = lastAsk();
        await fromApp(
            { type: 'lightdash:sdk:inspect-at-response', id, element },
            {},
        );
        await fromApp({
            type: 'lightdash:sdk:inspect-at-response',
            id,
            element: { label: 'x', rect: { x: 'no' } },
        });
        await expect(answer).resolves.toBe(null);
    });

    it('a new bundle has to announce again', async () => {
        const { result, rerender } = renderHook(
            ({ key }) => useIframeInspectAt(iframeRef, key, null),
            { initialProps: { key: 'a' } },
        );
        await fromApp({ type: 'lightdash:sdk:inspect-at-available' });
        rerender({ key: 'b' });
        await expect(result.current.inspectAt({ x: 1, y: 1 })).resolves.toBe(
            null,
        );
        expect(app.postMessage).not.toHaveBeenCalled();
    });

    it('tells when the bundle announces, and again when a new bundle loads', async () => {
        const onAvailabilityChange = vi.fn();
        const { rerender } = renderHook(
            ({ key }) =>
                useIframeInspectAt(iframeRef, key, onAvailabilityChange),
            { initialProps: { key: 'a' } },
        );
        expect(onAvailabilityChange).toHaveBeenLastCalledWith(false);
        await fromApp({ type: 'lightdash:sdk:inspect-at-available' });
        expect(onAvailabilityChange).toHaveBeenLastCalledWith(true);
        rerender({ key: 'b' });
        expect(onAvailabilityChange).toHaveBeenLastCalledWith(false);
    });

    it('a slow answer resolves to null', async () => {
        vi.useFakeTimers();
        const { result } = renderHook(() =>
            useIframeInspectAt(iframeRef, 'a', null),
        );
        await fromApp({ type: 'lightdash:sdk:inspect-at-available' });
        const answer = result.current.inspectAt({ x: 1, y: 1 });
        vi.advanceTimersByTime(2_000);
        await expect(answer).resolves.toBe(null);
    });
});
