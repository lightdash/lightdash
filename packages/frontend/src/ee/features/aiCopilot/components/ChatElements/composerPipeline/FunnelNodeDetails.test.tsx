import { QuerySourceType, type FunnelSourceQuery } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { FunnelNodeDetails } from './FunnelNodeDetails';

vi.mock('../../../../../../hooks/useExplore', () => ({
    useExploreByProjectUuid: vi.fn(() => ({ data: undefined })),
}));

const funnel: FunnelSourceQuery = {
    sourceType: QuerySourceType.FUNNEL,
    nodeId: 'checkout_funnel',
    exploreName: 'product_events',
    userIdFieldId: 'product_events_user_id',
    timestampFieldId: 'product_events_event_timestamp',
    eventNameFieldId: 'product_events_event_name',
    steps: [
        { stepOrder: 2, eventName: 'add_to_cart' },
        { stepOrder: 1, eventName: 'page_view' },
        { stepOrder: 3, eventName: 'checkout_completed' },
    ],
    dateRange: { type: 'preset', preset: 'last_30_days' },
    conversionWindow: { value: 7, unit: 'days' },
    breakdownDimensionId: 'product_events_device_type',
};

const renderDetails = (query: FunnelSourceQuery = funnel) =>
    renderWithProviders(
        <FunnelNodeDetails query={query} fieldsMap={{}} projectUuid="p" />,
    );

const texts = (testId: string) =>
    screen.queryAllByTestId(testId).map((el) => el.textContent);

describe('FunnelNodeDetails', () => {
    it('shows the steps in order, numbered, with the window once', () => {
        renderDetails();
        expect(texts('funnel-node-step')).toEqual([
            '1Page view',
            '2Add to cart',
            '3Checkout completed',
        ]);
        expect(screen.getByText('each within 7 days')).toBeInTheDocument();
    });

    it('defaults the window to 30 days and labels a custom range', () => {
        renderDetails({
            ...funnel,
            conversionWindow: undefined,
            dateRange: {
                type: 'custom',
                start: '2026-01-01T00:00:00Z',
                end: '2026-03-31T00:00:00Z',
            },
        });
        expect(screen.getByText('each within 30 days')).toBeInTheDocument();
        expect(
            screen.getByText('1 Jan 2026 – 31 Mar 2026'),
        ).toBeInTheDocument();
    });

    it('labels a preset range and the event fields by role', () => {
        renderDetails();
        expect(screen.getByText('Last 30 days')).toBeInTheDocument();
        expect(texts('funnel-node-event-field')).toEqual([
            'WhoProduct events user id',
            'WhenProduct events event timestamp',
            'EventProduct events event name',
        ]);
    });

    it('shows the breakdown and its result column when set', () => {
        renderDetails();
        expect(screen.getByLabelText('Breakdown')).toBeInTheDocument();
        expect(texts('funnel-node-breakdown')).toEqual([
            'Product events device type',
        ]);
        expect(texts('funnel-node-column')).toEqual([
            'step_order',
            'step_name',
            'total_users',
            'conversion_rate',
            'step_conversion_rate',
            'median_time_to_convert',
            'breakdown_value',
        ]);
    });

    it('omits the breakdown row and column without a breakdown', () => {
        renderDetails({ ...funnel, breakdownDimensionId: undefined });
        expect(screen.queryByLabelText('Breakdown')).toBeNull();
        expect(texts('funnel-node-column')).not.toContain('breakdown_value');
        expect(screen.getByText('One row per step')).toBeInTheDocument();
    });
});
