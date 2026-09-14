import { act, renderHook } from '@testing-library/react';
import { type UIEvent } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { useInfiniteScroll } from './useInfiniteScroll';

/** A stand-in for the scroll container, positioned `fromBottom` px from the end. */
const container = (fromBottom: number) => {
    const clientHeight = 500;
    return {
        clientHeight,
        scrollTop: 1000,
        scrollHeight: 1000 + clientHeight + fromBottom,
    } as HTMLDivElement;
};

const scrollEvent = (fromBottom: number) =>
    ({ target: container(fromBottom) }) as unknown as UIEvent<HTMLDivElement>;

describe('useInfiniteScroll', () => {
    test('fetches when the container is scrolled within the threshold', () => {
        const fetchNextPage = vi.fn();
        const { result } = renderHook(() =>
            useInfiniteScroll({
                fetchNextPage,
                isFetching: false,
                hasMore: true,
            }),
        );

        act(() => result.current.onScroll(scrollEvent(150)));

        expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });

    test('does not fetch while still outside the threshold', () => {
        const fetchNextPage = vi.fn();
        const { result } = renderHook(() =>
            useInfiniteScroll({
                fetchNextPage,
                isFetching: false,
                hasMore: true,
            }),
        );

        act(() => result.current.onScroll(scrollEvent(400)));

        expect(fetchNextPage).not.toHaveBeenCalled();
    });

    test('honours a custom threshold', () => {
        const fetchNextPage = vi.fn();
        const { result } = renderHook(() =>
            useInfiniteScroll({
                fetchNextPage,
                isFetching: false,
                hasMore: true,
                threshold: 400,
            }),
        );

        act(() => result.current.onScroll(scrollEvent(300)));

        expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });

    test('does not fetch while a request is already in flight', () => {
        const fetchNextPage = vi.fn();
        const { result } = renderHook(() =>
            useInfiniteScroll({
                fetchNextPage,
                isFetching: true,
                hasMore: true,
            }),
        );

        act(() => result.current.onScroll(scrollEvent(0)));

        expect(fetchNextPage).not.toHaveBeenCalled();
    });

    test('does not fetch when there are no more pages', () => {
        const fetchNextPage = vi.fn();
        const { result } = renderHook(() =>
            useInfiniteScroll({
                fetchNextPage,
                isFetching: false,
                hasMore: false,
            }),
        );

        act(() => result.current.onScroll(scrollEvent(0)));

        expect(fetchNextPage).not.toHaveBeenCalled();
    });

    test('checks after render, so a page too short to scroll still fetches', () => {
        const fetchNextPage = vi.fn();
        const { result } = renderHook(() =>
            useInfiniteScroll({
                fetchNextPage,
                isFetching: false,
                hasMore: true,
            }),
        );

        // no container on mount, so nothing has been requested yet
        expect(fetchNextPage).not.toHaveBeenCalled();

        act(() => {
            result.current.containerRef.current = container(0);
            result.current.checkNow();
        });

        expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });

    test('scrollToTop returns the container to the top', () => {
        const { result } = renderHook(() =>
            useInfiniteScroll({
                fetchNextPage: vi.fn(),
                isFetching: false,
                hasMore: true,
            }),
        );
        const element = { scrollTop: 800 } as HTMLDivElement;

        act(() => {
            result.current.containerRef.current = element;
            result.current.scrollToTop();
        });

        expect(element.scrollTop).toBe(0);
    });
});
