import {
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type FilterableDimension,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { SchedulerFormFiltersTab } from './SchedulerFormFiltersTab';

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

const statusFilter: DashboardFilterRule = {
    id: 'filter-status',
    target: { fieldId: 'orders_status', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: ['completed'],
    tileTargets: {},
    label: undefined,
};

const paymentFilter: DashboardFilterRule = {
    id: 'filter-payment',
    target: { fieldId: 'orders_payment_method', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: ['credit_card'],
    tileTargets: {},
    label: undefined,
};

const dashboardContext = {
    isLoadingDashboardFilters: false,
    allFilters: {
        dimensions: [statusFilter, paymentFilter],
        metrics: [],
        tableCalculations: [],
    },
    allFilterableFieldsMap: {
        orders_status: statusField,
        orders_payment_method: paymentField,
    },
};

vi.mock('../../../../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (context: unknown) => unknown) =>
        selector(dashboardContext),
}));

vi.mock(
    '../../../../providers/Dashboard/useDashboardTileStatusContext',
    () => ({
        default: (selector: (context: unknown) => unknown) =>
            selector({ tileNamesById: {} }),
    }),
);

vi.mock('../../../../hooks/useProject', () => ({
    useProject: () => ({
        data: { projectUuid: 'project-uuid', warehouseConnection: undefined },
        isInitialLoading: false,
    }),
}));

const Harness = ({
    initialFilters,
    isEditMode = false,
    savedFilters = [],
    onDraftChange,
}: {
    initialFilters: DashboardFilterRule[] | undefined;
    isEditMode?: boolean;
    savedFilters?: DashboardFilterRule[];
    onDraftChange?: (filters: DashboardFilterRule[]) => void;
}) => {
    const [draftFilters, setDraftFilters] = useState(initialFilters);
    return (
        <SchedulerFormFiltersTab
            draftFilters={draftFilters}
            savedFilters={savedFilters}
            isEditMode={isEditMode}
            onChange={(filters) => {
                setDraftFilters(filters);
                onDraftChange?.(filters);
            }}
            unmetRequirements={[]}
            filtersWithUnmetRequirements={[]}
        />
    );
};

describe('SchedulerFormFiltersTab', () => {
    it('seeds the draft with current dashboard filters on first render', async () => {
        const onDraftChange = vi.fn();
        renderWithProviders(
            <Harness
                initialFilters={undefined}
                onDraftChange={onDraftChange}
            />,
        );

        await waitFor(() =>
            expect(onDraftChange).toHaveBeenCalledWith([
                statusFilter,
                paymentFilter,
            ]),
        );
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Payment method')).toBeInTheDocument();
    });

    it('keeps a deleted filter visible as "uses dashboard default" instead of dropping it', async () => {
        renderWithProviders(
            <Harness initialFilters={[statusFilter, paymentFilter]} />,
        );

        const removeButtons = screen.getAllByRole('button', {
            name: 'Remove filter',
        });
        expect(removeButtons).toHaveLength(2);
        await userEvent.click(removeButtons[0]);

        // Row stays, now restorable
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Re-add filter' }),
        ).toBeInTheDocument();
    });

    it('does not resurrect deleted filters when the last one is removed', async () => {
        const onDraftChange = vi.fn();
        renderWithProviders(
            <Harness
                initialFilters={[statusFilter, paymentFilter]}
                onDraftChange={onDraftChange}
            />,
        );

        await userEvent.click(
            screen.getAllByRole('button', { name: 'Remove filter' })[0],
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Remove filter' }),
        );

        // The regression: emptying the draft re-seeded every dashboard filter
        await waitFor(() => expect(onDraftChange).toHaveBeenLastCalledWith([]));
        expect(
            screen.queryAllByRole('button', { name: 'Remove filter' }),
        ).toHaveLength(0);
        expect(
            screen.getAllByRole('button', { name: 'Re-add filter' }),
        ).toHaveLength(2);
    });

    it('restores a deleted filter with the dashboard default value', async () => {
        const onDraftChange = vi.fn();
        renderWithProviders(
            <Harness
                initialFilters={[paymentFilter]}
                onDraftChange={onDraftChange}
            />,
        );

        await userEvent.click(
            screen.getByRole('button', { name: 'Re-add filter' }),
        );

        expect(onDraftChange).toHaveBeenLastCalledWith([
            paymentFilter,
            statusFilter,
        ]);
        expect(
            screen.getAllByRole('button', { name: 'Remove filter' }),
        ).toHaveLength(2);
    });

    it('shows non-overridden dashboard filters as restorable in edit mode', () => {
        renderWithProviders(
            <Harness
                initialFilters={[statusFilter]}
                savedFilters={[statusFilter]}
                isEditMode
            />,
        );

        // paymentFilter was deleted when the scheduler was created; it must
        // still be visible and restorable when editing
        expect(screen.getByText('Payment method')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Re-add filter' }),
        ).toBeInTheDocument();
    });
});
