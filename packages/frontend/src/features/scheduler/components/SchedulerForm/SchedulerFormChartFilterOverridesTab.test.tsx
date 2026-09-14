import {
    DimensionType,
    FieldType,
    FilterOperator,
    getFilterRulesFromGroup,
    type FilterableDimension,
    type FilterRule,
    type Filters,
    type ItemsMap,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import {
    SchedulerFormChartFilterOverridesTab,
    type SchedulerChartFilterSource,
} from './SchedulerFormChartFilterOverridesTab';

const statusField: FilterableDimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
    hidden: false,
};

const paymentField: FilterableDimension = {
    ...statusField,
    name: 'payment_method',
    label: 'Payment method',
};

const itemsMap: ItemsMap = {
    orders_status: statusField,
    orders_payment_method: paymentField,
};

const statusFilter: FilterRule = {
    id: 'filter-status',
    target: { fieldId: 'orders_status' },
    operator: FilterOperator.EQUALS,
    values: ['completed'],
};

const paymentFilter: FilterRule = {
    id: 'filter-payment',
    target: { fieldId: 'orders_payment_method' },
    operator: FilterOperator.EQUALS,
    values: ['credit_card'],
};

const savedChart: SchedulerChartFilterSource = {
    projectUuid: 'project-uuid',
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: [],
        filters: {
            dimensions: {
                id: 'chart-dimensions',
                and: [statusFilter, { id: 'nested', or: [paymentFilter] }],
            },
        },
        sorts: [],
        limit: 500,
        tableCalculations: [],
        additionalMetrics: [],
    },
};

vi.mock('../../../../hooks/useProject', () => ({
    useProject: () => ({
        data: { projectUuid: 'project-uuid', warehouseConnection: undefined },
        isInitialLoading: false,
    }),
}));

vi.mock('../../../../hooks/useExplore', () => ({
    useExploreByProjectUuid: () => ({
        data: undefined,
        isInitialLoading: false,
    }),
}));

const ruleIds = (filters: Filters | undefined) =>
    getFilterRulesFromGroup(filters?.dimensions).map((rule) => rule.id);

const Harness = ({
    initialFilters,
    isEditMode = false,
    savedFilters,
    onDraftChange,
}: {
    initialFilters: Filters | undefined;
    isEditMode?: boolean;
    savedFilters?: Filters;
    onDraftChange?: (filters: Filters) => void;
}) => {
    const [draftFilters, setDraftFilters] = useState(initialFilters);
    return (
        <SchedulerFormChartFilterOverridesTab
            savedChart={savedChart}
            itemsMap={itemsMap}
            draftFilters={draftFilters}
            savedFilters={savedFilters}
            isEditMode={isEditMode}
            onChange={(filters) => {
                setDraftFilters(filters);
                onDraftChange?.(filters);
            }}
            filtersWithUnmetRequirements={[]}
        />
    );
};

const seeded: Filters = {
    dimensions: { id: 'seed', and: [statusFilter, paymentFilter] },
};

describe('SchedulerFormChartFilterOverridesTab', () => {
    it('seeds the draft with the chart filters, flattened, on first render', async () => {
        const onDraftChange = vi.fn();
        renderWithProviders(
            <Harness
                initialFilters={undefined}
                onDraftChange={onDraftChange}
            />,
        );

        await waitFor(() => expect(onDraftChange).toHaveBeenCalledOnce());
        expect(ruleIds(onDraftChange.mock.calls[0][0])).toEqual([
            'filter-status',
            'filter-payment',
        ]);
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Payment method')).toBeInTheDocument();
    });

    it('keeps a removed filter visible as "uses chart default"', async () => {
        renderWithProviders(<Harness initialFilters={seeded} />);

        const removeButtons = screen.getAllByRole('button', {
            name: 'Remove filter',
        });
        expect(removeButtons).toHaveLength(2);
        await userEvent.click(removeButtons[0]);

        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Uses chart default')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Re-add filter' }),
        ).toBeInTheDocument();
    });

    it('does not resurrect removed filters when the last one is removed', async () => {
        const onDraftChange = vi.fn();
        renderWithProviders(
            <Harness initialFilters={seeded} onDraftChange={onDraftChange} />,
        );

        await userEvent.click(
            screen.getAllByRole('button', { name: 'Remove filter' })[0],
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Remove filter' }),
        );

        await waitFor(() => expect(onDraftChange).toHaveBeenLastCalledWith({}));
        expect(
            screen.queryAllByRole('button', { name: 'Remove filter' }),
        ).toHaveLength(0);
        expect(
            screen.getAllByRole('button', { name: 'Re-add filter' }),
        ).toHaveLength(2);
    });

    it('restores a removed filter with the chart default value', async () => {
        const onDraftChange = vi.fn();
        renderWithProviders(
            <Harness
                initialFilters={{
                    dimensions: { id: 'seed', and: [paymentFilter] },
                }}
                onDraftChange={onDraftChange}
            />,
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Re-add filter' }),
        );

        expect(
            getFilterRulesFromGroup(
                onDraftChange.mock.lastCall?.[0].dimensions,
            ),
        ).toEqual([paymentFilter, statusFilter]);
        expect(
            screen.getAllByRole('button', { name: 'Remove filter' }),
        ).toHaveLength(2);
    });

    it('shows non-overridden chart filters as restorable in edit mode', () => {
        const onlyStatus: Filters = {
            dimensions: { id: 'saved', and: [statusFilter] },
        };
        renderWithProviders(
            <Harness
                initialFilters={onlyStatus}
                savedFilters={onlyStatus}
                isEditMode
            />,
        );

        expect(screen.getByText('Payment method')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Re-add filter' }),
        ).toBeInTheDocument();
    });

    it('lists overrides for filters the chart no longer has', () => {
        const orphan: FilterRule = {
            id: 'filter-gone',
            target: { fieldId: 'orders_status' },
            operator: FilterOperator.EQUALS,
            values: ['refunded'],
        };
        const saved: Filters = {
            dimensions: { id: 'saved', and: [statusFilter, orphan] },
        };
        renderWithProviders(
            <Harness initialFilters={saved} savedFilters={saved} isEditMode />,
        );

        expect(
            screen.getByText(
                'The following filters are applied to this scheduled delivery but no longer exist in the chart',
            ),
        ).toBeInTheDocument();
        expect(screen.getByText('refunded')).toBeInTheDocument();
    });
});

describe('SchedulerFormChartFilterOverridesTab read-only', () => {
    it('shows the chart filters without controls and seeds nothing', async () => {
        const onDraftChange = vi.fn();
        renderWithProviders(
            <SchedulerFormChartFilterOverridesTab
                savedChart={savedChart}
                itemsMap={itemsMap}
                draftFilters={undefined}
                savedFilters={undefined}
                isEditMode={false}
                onChange={onDraftChange}
                filtersWithUnmetRequirements={[]}
                readOnly
            />,
        );

        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Payment method')).toBeInTheDocument();
        expect(
            screen.getByText(/needs explore access to the project/),
        ).toBeInTheDocument();
        expect(screen.queryAllByRole('button')).toHaveLength(0);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(onDraftChange).not.toHaveBeenCalled();
    });
});
