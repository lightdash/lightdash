import { useCallback, useEffect, useRef, type UIEvent } from 'react';

const DEFAULT_THRESHOLD = 200;

type UseInfiniteScrollArgs = {
    fetchNextPage: () => unknown;
    /** Suppresses fetching while a request is already in flight. */
    isFetching: boolean;
    hasMore: boolean;
    /** Distance from the bottom, in px, that triggers the next page. */
    threshold?: number;
};

type UseInfiniteScroll = {
    containerRef: React.MutableRefObject<HTMLDivElement | null>;
    onScroll: (event: UIEvent<HTMLDivElement>) => void;
    scrollToTop: () => void;
    /** Re-runs the bottom check — for when the visible rows change without `hasMore` changing. */
    checkNow: () => void;
};

/**
 * Fetches the next page when a scroll container nears its bottom. Wire
 * `containerRef` and `onScroll` to the scrollable element.
 */
export const useInfiniteScroll = ({
    fetchNextPage,
    isFetching,
    hasMore,
    threshold = DEFAULT_THRESHOLD,
}: UseInfiniteScrollArgs): UseInfiniteScroll => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    const fetchMoreIfNearBottom = useCallback(
        (container: HTMLDivElement | null | undefined) => {
            if (!container) return;
            const { scrollHeight, scrollTop, clientHeight } = container;
            if (
                scrollHeight - scrollTop - clientHeight < threshold &&
                !isFetching &&
                hasMore
            ) {
                void fetchNextPage();
            }
        },
        [fetchNextPage, hasMore, isFetching, threshold],
    );

    const onScroll = useCallback(
        (event: UIEvent<HTMLDivElement>) =>
            fetchMoreIfNearBottom(event.target as HTMLDivElement),
        [fetchMoreIfNearBottom],
    );

    const checkNow = useCallback(
        () => fetchMoreIfNearBottom(containerRef.current),
        [fetchMoreIfNearBottom],
    );

    // A page shorter than the container leaves no scrollbar to scroll, so the
    // handler would never run.
    useEffect(() => {
        checkNow();
    }, [checkNow]);

    const scrollToTop = useCallback(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = 0;
        }
    }, []);

    return { containerRef, onScroll, scrollToTop, checkNow };
};
