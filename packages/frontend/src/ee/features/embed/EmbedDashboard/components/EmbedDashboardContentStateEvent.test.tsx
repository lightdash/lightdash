import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    dashboardDateZoomActions,
    dashboardEditActions,
    dashboardFiltersActions,
} from '../../../../../features/dashboard/store';
import { createDashboardTestStore } from '../../../../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../../../../testing/DashboardStoreTestProvider';
import { LightdashEventType } from '../../events/types';
import { CONTENT_STATE_DEBOUNCE_MS } from '../../hooks/useEmbedContentStateEvent';
import EmbedDashboardContentStateEvent from './EmbedDashboardContentStateEvent';

const dispatchEmbedEvent = vi.fn();
vi.mock('../../../../providers/Embed/useEmbed', () => ({
    default: () => ({ dispatchEmbedEvent, isEmbedEventReady: true }),
}));

const rule = (id: string, values: string[]): DashboardFilterRule => ({
    id,
    label: undefined,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values,
});

const filters = (dimensions: DashboardFilterRule[]): DashboardFilters => ({
    dimensions,
    metrics: [],
    tableCalculations: [],
});

const renderEmitter = (store: ReturnType<typeof createDashboardTestStore>) =>
    render(
        <DashboardStoreTestProvider store={store}>
            <EmbedDashboardContentStateEvent dashboardUuid="dashboard-uuid" />
        </DashboardStoreTestProvider>,
    );

describe('EmbedDashboardContentStateEvent', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        dispatchEmbedEvent.mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('waits for the filters to be applied', () => {
        const store = createDashboardTestStore();
        renderEmitter(store);
        act(() => {
            vi.advanceTimersByTime(CONTENT_STATE_DEBOUNCE_MS);
        });
        expect(dispatchEmbedEvent).not.toHaveBeenCalled();

        act(() => {
            store.dispatch(
                dashboardFiltersActions.setDashboardFilters(filters([])),
            );
        });
        act(() => {
            vi.advanceTimersByTime(CONTENT_STATE_DEBOUNCE_MS);
        });
        expect(dispatchEmbedEvent).toHaveBeenCalledOnce();
    });

    it('emits filter values, added filters, parameters, date zoom and tab', () => {
        const store = createDashboardTestStore({
            dashboardFilters: filters([rule('saved', ['completed'])]),
            dashboardTemporaryFilters: filters([rule('added', ['placed'])]),
            parameterValues: { region: 'EMEA' },
            dateZoomGranularity: 'MONTH',
        });
        act(() => {
            store.dispatch(
                dashboardEditActions.setActiveTab({
                    uuid: 'tab-2',
                    name: 'Tab 2',
                    order: 1,
                }),
            );
        });
        renderEmitter(store);
        act(() => {
            vi.advanceTimersByTime(CONTENT_STATE_DEBOUNCE_MS);
        });

        expect(dispatchEmbedEvent).toHaveBeenCalledExactlyOnceWith(
            LightdashEventType.ContentStateChanged,
            {
                type: 'dashboard',
                dashboardUuid: 'dashboard-uuid',
                filters: filters([
                    rule('saved', ['completed']),
                    rule('added', ['placed']),
                ]),
                parameters: { region: 'EMEA' },
                tileParameters: null,
                dateZoomGranularity: 'MONTH',
                activeTabUuid: 'tab-2',
            },
        );
    });

    it('emits again when the user changes the view', () => {
        const store = createDashboardTestStore({
            dashboardFilters: filters([]),
        });
        renderEmitter(store);
        act(() => {
            vi.advanceTimersByTime(CONTENT_STATE_DEBOUNCE_MS);
        });

        act(() => {
            store.dispatch(dashboardDateZoomActions.setGranularity('WEEK'));
        });
        act(() => {
            vi.advanceTimersByTime(CONTENT_STATE_DEBOUNCE_MS);
        });

        expect(dispatchEmbedEvent).toHaveBeenCalledTimes(2);
        expect(dispatchEmbedEvent).toHaveBeenLastCalledWith(
            LightdashEventType.ContentStateChanged,
            expect.objectContaining({ dateZoomGranularity: 'WEEK' }),
        );
    });
});
