import { renderHook, act } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppReach } from './useAppReach';

const token = (capture = true) =>
    `header.${btoa(JSON.stringify({ reach: capture ? { viewContext: 'standalone' } : null }))}.signature`;
const source = (app = 'app', refresh = 0) =>
    `https://preview.example/api/apps/${app}/versions/1/t/${token()}/?r=${refresh}`;

describe('optional app reach capture', () => {
    const frame = document.createElement('iframe');
    const ref = createRef<HTMLIFrameElement>();
    const fetchMock = vi.fn().mockResolvedValue({});
    beforeEach(() => {
        document.body.appendChild(frame);
        ref.current = frame;
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockClear();
    });
    afterEach(() => {
        frame.remove();
        vi.unstubAllGlobals();
    });
    const message = (
        type: string,
        origin = 'null',
        sender: MessageEventSource | null = frame.contentWindow,
    ) =>
        act(() => {
            window.dispatchEvent(
                new MessageEvent('message', {
                    source: sender,
                    origin,
                    data: { type },
                }),
            );
        });
    it('leaves legacy and disabled captures untouched', () => {
        const src = source();
        const { result } = renderHook(() =>
            useAppReach(src, token(false), ref, 'https://preview.example'),
        );
        expect(result.current).toBe(src);
        message('lightdash:sdk:manifest');
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('has a stable view identity across rerenders and token renewal, but classifies reloads', () => {
        const { result, rerender } = renderHook(
            ({ src, capability }) =>
                useAppReach(src, capability, ref, 'https://preview.example'),
            { initialProps: { src: source(), capability: token() } },
        );
        const first = new URL(result.current);
        expect(first.searchParams.get('usageReload')).toBe('false');
        rerender({ src: source(), capability: `${token()}renewed` });
        expect(result.current).toBe(first.toString());
        rerender({ src: source('app', 1), capability: token() });
        const reload = new URL(result.current);
        expect(reload.searchParams.get('usageReload')).toBe('true');
        expect(reload.searchParams.get('usageViewId')).not.toBe(
            first.searchParams.get('usageViewId'),
        );
        rerender({ src: source('other'), capability: token() });
        expect(new URL(result.current).searchParams.get('usageReload')).toBe(
            'false',
        );
    });
    it('accepts only this iframe and origin, deduplicates stages, and cleans up', () => {
        const { unmount } = renderHook(() =>
            useAppReach(source(), token(), ref, 'https://preview.example'),
        );
        message('lightdash:sdk:manifest', 'https://evil.example');
        message('lightdash:sdk:manifest', 'null', window);
        expect(fetchMock).not.toHaveBeenCalled();
        message('lightdash:sdk:manifest');
        message('lightdash:sdk:manifest');
        message('lightdash:sdk:render-error');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
            stage: 'sdk_ready',
        });
        expect(fetchMock.mock.calls[0][0]).toMatch(/\/reach$/);
        expect(fetchMock.mock.calls[0][1]).toMatchObject({
            credentials: 'omit',
            headers: { 'Content-Type': 'text/plain' },
        });
        unmount();
        message('lightdash:sdk:manifest');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    it('ignores telemetry network failures', async () => {
        fetchMock.mockRejectedValueOnce(new Error('offline'));
        renderHook(() =>
            useAppReach(source(), token(), ref, 'https://preview.example'),
        );
        message('lightdash:sdk:manifest');
        await Promise.resolve();
        expect(fetchMock).toHaveBeenCalledOnce();
    });
    it.each([true, false])(
        'only labels a document reload on its original route (same route: %s)',
        (sameRoute) => {
            vi.stubGlobal('performance', {
                now: performance.now.bind(performance),
                getEntriesByType: () => [
                    {
                        type: 'reload',
                        name: sameRoute
                            ? window.location.href
                            : 'https://app.example/a-different-app',
                    },
                ],
            });
            const { result } = renderHook(() =>
                useAppReach(source(), token(), ref, 'https://preview.example'),
            );
            expect(
                new URL(result.current).searchParams.get('usageReload'),
            ).toBe(String(sameRoute));
        },
    );
});
