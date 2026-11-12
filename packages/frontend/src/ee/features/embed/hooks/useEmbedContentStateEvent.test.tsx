import { ChartType } from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LightdashEventType, type ExploreContentState } from '../events/types';
import {
    CONTENT_STATE_DEBOUNCE_MS,
    useEmbedContentStateEvent,
} from './useEmbedContentStateEvent';

const dispatchEmbedEvent = vi.fn();
let isEmbedEventReady = true;
vi.mock('../../../providers/Embed/useEmbed', () => ({
    default: () => ({ dispatchEmbedEvent, isEmbedEventReady }),
}));

const exploreState = (limit: number): ExploreContentState => ({
    type: 'explore',
    chart: {
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: [],
            filters: {},
            sorts: [],
            limit,
            tableCalculations: [],
        },
        chartConfig: { type: ChartType.TABLE, config: undefined },
        tableConfig: { columnOrder: [] },
    },
});

describe('useEmbedContentStateEvent', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        dispatchEmbedEvent.mockClear();
        isEmbedEventReady = true;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('emits the state once it settles', () => {
        renderHook(() => useEmbedContentStateEvent(exploreState(500)));
        expect(dispatchEmbedEvent).not.toHaveBeenCalled();

        vi.advanceTimersByTime(CONTENT_STATE_DEBOUNCE_MS);
        expect(dispatchEmbedEvent).toHaveBeenCalledExactlyOnceWith(
            LightdashEventType.ContentStateChanged,
            exploreState(500),
        );
    });

    it('emits nothing while the state is not ready', () => {
        renderHook(() => useEmbedContentStateEvent(null));
        vi.advanceTimersByTime(CONTENT_STATE_DEBOUNCE_MS);
        expect(dispatchEmbedEvent).not.toHaveBeenCalled();
    });

    it('emits only the last state of a burst', () => {
        const { rerender } = renderHook(
            ({ limit }) => useEmbedContentStateEvent(exploreState(limit)),
            { initialProps: { limit: 1 } },
        );
        rerender({ limit: 2 });
        rerender({ limit: 3 });
        vi.advanceTimersByTime(CONTENT_STATE_DEBOUNCE_MS);

        expect(dispatchEmbedEvent).toHaveBeenCalledExactlyOnceWith(
            LightdashEventType.ContentStateChanged,
            exploreState(3),
        );
    });

    it('skips states equal to the last one emitted', () => {
        const { rerender } = renderHook(
            ({ limit }) => useEmbedContentStateEvent(exploreState(limit)),
            { initialProps: { limit: 1 } },
        );
        vi.advanceTimersByTime(CONTENT_STATE_DEBOUNCE_MS);

        rerender({ limit: 2 });
        rerender({ limit: 1 });
        vi.advanceTimersByTime(CONTENT_STATE_DEBOUNCE_MS);

        expect(dispatchEmbedEvent).toHaveBeenCalledOnce();
    });

    it('emits nothing until the event system is ready', () => {
        isEmbedEventReady = false;
        renderHook(() => useEmbedContentStateEvent(exploreState(500)));
        vi.advanceTimersByTime(CONTENT_STATE_DEBOUNCE_MS);
        expect(dispatchEmbedEvent).not.toHaveBeenCalled();
    });
});
