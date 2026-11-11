import { ChartType, type SavedChart } from '@lightdash/common';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
} from '../../../../../features/explorer/store';
import { LightdashEventType } from '../../events/types';
import { CONTENT_STATE_DEBOUNCE_MS } from '../../hooks/useEmbedContentStateEvent';
import EmbedExploreContentStateEvent from './EmbedExploreContentStateEvent';

const dispatchEmbedEvent = vi.fn();
vi.mock('../../../../providers/Embed/useEmbed', () => ({
    default: () => ({ dispatchEmbedEvent, isEmbedEventReady: true }),
}));

const metricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_total'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
    additionalMetrics: [],
};

const createStore = (savedChart?: SavedChart) =>
    createExplorerStore({
        explorer: buildInitialExplorerState({
            isEditMode: true,
            initialState: {
                savedChart,
                unsavedChartVersion: {
                    tableName: 'orders',
                    metricQuery,
                    chartConfig: {
                        type: ChartType.TABLE,
                        config: undefined,
                    },
                    tableConfig: { columnOrder: [] },
                    parameters: { region: 'EMEA' },
                },
            },
        }),
    });

const renderEmitter = (store: ReturnType<typeof createStore>) =>
    render(
        <Provider store={store}>
            <EmbedExploreContentStateEvent />
        </Provider>,
    );

describe('EmbedExploreContentStateEvent', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        dispatchEmbedEvent.mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('emits the explore query when no saved chart is being edited', () => {
        renderEmitter(createStore());
        act(() => {
            vi.advanceTimersByTime(CONTENT_STATE_DEBOUNCE_MS);
        });

        expect(dispatchEmbedEvent).toHaveBeenCalledExactlyOnceWith(
            LightdashEventType.ContentStateChanged,
            {
                type: 'explore',
                exploreName: 'orders',
                metricQuery: expect.objectContaining(metricQuery),
                parameters: { region: 'EMEA' },
            },
        );
    });

    it('emits the chart with unsaved edits', () => {
        const store = createStore({ uuid: 'chart-uuid' } as SavedChart);
        renderEmitter(store);
        act(() => {
            store.dispatch(explorerActions.setDimensions(['orders_date']));
        });
        act(() => {
            vi.advanceTimersByTime(CONTENT_STATE_DEBOUNCE_MS);
        });

        expect(dispatchEmbedEvent).toHaveBeenCalledExactlyOnceWith(
            LightdashEventType.ContentStateChanged,
            expect.objectContaining({
                type: 'chart',
                chartUuid: 'chart-uuid',
                metricQuery: expect.objectContaining({
                    dimensions: ['orders_date'],
                }),
            }),
        );
    });
});
