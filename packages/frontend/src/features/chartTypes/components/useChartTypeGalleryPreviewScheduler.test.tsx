import { act, render, renderHook, screen } from '@testing-library/react';
import { StrictMode, type PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChartTypeGalleryPreviewScheduler } from './useChartTypeGalleryPreviewScheduler';

type ObserverCallback = (entries: IntersectionObserverEntry[]) => void;

class MockIntersectionObserver {
    static instances: MockIntersectionObserver[] = [];

    constructor(private readonly callback: ObserverCallback) {
        MockIntersectionObserver.instances.push(this);
    }

    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();

    intersect(target: Element, isIntersecting: boolean) {
        this.callback([
            { isIntersecting, target } as IntersectionObserverEntry,
        ]);
    }
}

class ImmediatelyIntersectingObserver extends MockIntersectionObserver {
    observe = vi.fn((target: Element) => {
        this.intersect(target, true);
    });
}

const latestObserver = () =>
    MockIntersectionObserver.instances[
        MockIntersectionObserver.instances.length - 1
    ];

describe('useChartTypeGalleryPreviewScheduler', () => {
    afterEach(() => {
        MockIntersectionObserver.instances = [];
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('only mounts nearby previews and keeps at most four loading', () => {
        vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
        const { result } = renderHook(() =>
            useChartTypeGalleryPreviewScheduler({ maxConcurrent: 4 }),
        );
        const cards = Array.from({ length: 6 }, () =>
            document.createElement('div'),
        );

        act(() =>
            cards.forEach((card, index) =>
                result.current.register(String(index))(card),
            ),
        );
        act(() => {
            cards.forEach((card) => latestObserver().intersect(card, true));
        });

        expect(result.current.isMounted('0')).toBe(true);
        expect(result.current.isMounted('3')).toBe(true);
        expect(result.current.isMounted('4')).toBe(false);
        expect(result.current.isMounted('5')).toBe(false);
    });

    it('starts queued previews when load, error, or unmount releases a slot', () => {
        vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
        const { result } = renderHook(() =>
            useChartTypeGalleryPreviewScheduler({ maxConcurrent: 1 }),
        );
        const first = document.createElement('div');
        const second = document.createElement('div');
        const third = document.createElement('div');

        act(() => {
            result.current.register('first')(first);
            result.current.register('second')(second);
            result.current.register('third')(third);
            latestObserver().intersect(first, true);
            latestObserver().intersect(second, true);
            latestObserver().intersect(third, true);
        });
        expect(result.current.isMounted('first')).toBe(true);

        act(() => result.current.complete('first'));
        expect(result.current.isMounted('second')).toBe(true);

        act(() => result.current.fail('second'));
        expect(result.current.isMounted('second')).toBe(false);
        expect(result.current.isMounted('third')).toBe(true);

        act(() => result.current.retry('second'));
        expect(result.current.isMounted('second')).toBe(false);

        act(() => result.current.complete('third'));
        expect(result.current.isMounted('second')).toBe(true);

        act(() => result.current.complete('second'));
        act(() => result.current.fail('second'));
        expect(result.current.isMounted('second')).toBe(false);
        expect(result.current.status('second')).toBe('unavailable');

        act(() => result.current.retry('second'));
        expect(result.current.isMounted('second')).toBe(true);
    });

    it('removes work when a card scrolls away and times out stalled previews', () => {
        vi.useFakeTimers();
        vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
        const { result } = renderHook(() =>
            useChartTypeGalleryPreviewScheduler({
                maxConcurrent: 1,
                timeoutMs: 100,
            }),
        );
        const first = document.createElement('div');
        const second = document.createElement('div');
        const third = document.createElement('div');

        act(() => {
            result.current.register('first')(first);
            result.current.register('second')(second);
            result.current.register('third')(third);
            latestObserver().intersect(first, true);
            latestObserver().intersect(second, true);
            latestObserver().intersect(third, true);
            latestObserver().intersect(first, false);
        });
        expect(result.current.isMounted('first')).toBe(false);
        expect(result.current.isMounted('second')).toBe(true);

        act(() => void vi.advanceTimersByTime(100));
        expect(result.current.isMounted('second')).toBe(false);
        expect(result.current.status('second')).toBe('unavailable');
        expect(result.current.isMounted('third')).toBe(true);
    });

    it('restarts the timeout after a StrictMode effect replay', () => {
        vi.useFakeTimers();
        vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
        const { result } = renderHook(
            () =>
                useChartTypeGalleryPreviewScheduler({
                    maxConcurrent: 1,
                    timeoutMs: 100,
                }),
            {
                wrapper: ({ children }: PropsWithChildren) => (
                    <StrictMode>{children}</StrictMode>
                ),
            },
        );
        const card = document.createElement('div');

        act(() => {
            result.current.register('card')(card);
            latestObserver().intersect(card, true);
        });
        expect(result.current.isMounted('card')).toBe(true);

        act(() => void vi.advanceTimersByTime(100));
        expect(result.current.status('card')).toBe('unavailable');
    });

    it('starts previews observed during the StrictMode replay', () => {
        vi.stubGlobal('IntersectionObserver', ImmediatelyIntersectingObserver);

        const PreviewProbe = () => {
            const scheduler = useChartTypeGalleryPreviewScheduler({
                maxConcurrent: 1,
            });
            return (
                <div
                    ref={scheduler.register('card')}
                    data-mounted={scheduler.isMounted('card')}
                    data-testid="preview-probe"
                />
            );
        };

        render(
            <StrictMode>
                <PreviewProbe />
            </StrictMode>,
        );

        expect(screen.getByTestId('preview-probe')).toHaveAttribute(
            'data-mounted',
            'true',
        );
    });
});
