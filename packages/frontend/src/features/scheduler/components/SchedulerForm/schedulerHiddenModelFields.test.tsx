import {
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type FilterableDimension,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const visibleFilter: DashboardFilterRule = {
    id: 'filter-status',
    target: { fieldId: 'orders_status', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: ['completed'],
    tileTargets: {},
    label: undefined,
};

const hiddenDateFilter: DashboardFilterRule = {
    id: 'filter-signup',
    target: { fieldId: 'orders_signup_date', tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: [],
    tileTargets: {},
    required: true,
    label: 'Signup date',
};

const deletedFilter: DashboardFilterRule = {
    ...hiddenDateFilter,
    id: 'filter-deleted',
    target: { fieldId: 'orders_removed_column', tableName: 'orders' },
    label: 'Removed column',
};

const dashboardContext = {
    isLoadingDashboardFilters: false,
    allFilters: {
        dimensions: [] as DashboardFilterRule[],
        metrics: [],
        tableCalculations: [],
    },
    allFilterableFieldsMap: { orders_status: statusField },
    filterableFieldsByTileUuid: { 'tile-1': [statusField] },
    savedFilterFieldsByTileUuid: {} as Record<
        string,
        { fieldId: string; fallbackType: DimensionType }[]
    >,
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

vi.mock('../../../../hooks/useFieldValues', () => ({
    MAX_AUTOCOMPLETE_RESULTS: 100,
    useFieldValues: vi.fn(() => ({
        isInitialLoading: false,
        results: [],
        refreshedAt: new Date(),
        refetch: vi.fn(),
        reset: vi.fn(),
        error: null,
        isError: false,
    })),
}));

vi.mock('../../../../hooks/health/useHealth', () => ({
    default: vi.fn(() => ({ data: { hasCacheAutocompleResults: false } })),
}));

const Harness = ({
    initialFilters,
}: {
    initialFilters: DashboardFilterRule[];
}) => {
    const [draftFilters, setDraftFilters] = useState<
        DashboardFilterRule[] | undefined
    >(initialFilters);
    return (
        <SchedulerFormFiltersTab
            draftFilters={draftFilters}
            savedFilters={[]}
            isEditMode={false}
            onChange={setDraftFilters}
            unmetRequirements={[]}
            filtersWithUnmetRequirements={[]}
        />
    );
};

const setDashboard = (
    dimensions: DashboardFilterRule[],
    savedFilterFieldsByTileUuid: Record<
        string,
        { fieldId: string; fallbackType: DimensionType }[]
    >,
) => {
    dashboardContext.allFilters.dimensions = dimensions;
    dashboardContext.savedFilterFieldsByTileUuid = savedFilterFieldsByTileUuid;
};

const hiddenDateStatus = {
    'tile-1': [
        {
            fieldId: 'orders_signup_date',
            fallbackType: DimensionType.DATE,
        },
    ],
};

describe('SchedulerFormFiltersTab with a dimension the model hides', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows the saved label rather than rejecting the filter as invalid', () => {
        setDashboard([hiddenDateFilter], hiddenDateStatus);
        renderWithProviders(<Harness initialFilters={[hiddenDateFilter]} />);

        expect(screen.getByText('Signup date')).toBeInTheDocument();
        expect(screen.queryByText('Invalid filter')).not.toBeInTheDocument();
    });

    it('lets the delivery override the hidden required filter', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        setDashboard([hiddenDateFilter], hiddenDateStatus);
        const { container } = renderWithProviders(
            <Harness initialFilters={[hiddenDateFilter]} />,
        );

        await user.click(screen.getByRole('button', { name: 'Edit filter' }));

        expect(
            container.querySelector('[class*="mantine-PillsInput"]'),
        ).toBeInTheDocument();
        expect(
            container.querySelector('[class*="mantine-DateTimePicker"]'),
        ).not.toBeInTheDocument();
    });

    it('gives a hidden timestamp the timestamp editor', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        setDashboard([hiddenDateFilter], {
            'tile-1': [
                {
                    fieldId: 'orders_signup_date',
                    fallbackType: DimensionType.TIMESTAMP,
                },
            ],
        });
        const { container } = renderWithProviders(
            <Harness initialFilters={[hiddenDateFilter]} />,
        );

        await user.click(screen.getByRole('button', { name: 'Edit filter' }));

        expect(
            container.querySelector('[class*="mantine-DateTimePicker"]'),
        ).toBeInTheDocument();
    });

    it('keeps a removed hidden filter restorable', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        setDashboard([hiddenDateFilter], hiddenDateStatus);
        renderWithProviders(<Harness initialFilters={[hiddenDateFilter]} />);

        await user.click(screen.getByRole('button', { name: 'Remove filter' }));

        expect(screen.getByText('Uses dashboard default')).toBeInTheDocument();
        const restore = screen.getByRole('button', { name: 'Re-add filter' });
        expect(restore).toBeInTheDocument();

        await user.click(restore);

        expect(
            screen.getByRole('button', { name: 'Remove filter' }),
        ).toBeInTheDocument();
    });

    it('still rejects a genuinely deleted field', () => {
        setDashboard([deletedFilter], hiddenDateStatus);
        renderWithProviders(<Harness initialFilters={[deletedFilter]} />);

        expect(screen.getByText('Invalid filter')).toBeInTheDocument();
        expect(screen.getByText('orders_removed_column')).toBeInTheDocument();
    });

    it('leaves a visible filter exactly as before', () => {
        setDashboard([visibleFilter], hiddenDateStatus);
        renderWithProviders(<Harness initialFilters={[visibleFilter]} />);

        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.queryByText('Invalid filter')).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Edit filter' }),
        ).toBeInTheDocument();
    });

    it('closes the editor when a type conflict arrives mid-edit', async () => {
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        setDashboard([hiddenDateFilter], hiddenDateStatus);
        const { container, rerender } = renderWithProviders(
            <Harness initialFilters={[hiddenDateFilter]} />,
        );

        await user.click(screen.getByRole('button', { name: 'Edit filter' }));
        expect(
            container.querySelector('[class*="mantine-PillsInput"]'),
        ).toBeInTheDocument();

        setDashboard([hiddenDateFilter], {
            'tile-1': [
                {
                    fieldId: 'orders_signup_date',
                    fallbackType: DimensionType.DATE,
                },
                {
                    fieldId: 'orders_signup_date',
                    fallbackType: DimensionType.STRING,
                },
            ],
        });
        rerender(<Harness initialFilters={[hiddenDateFilter]} />);

        expect(
            container.querySelector('[class*="mantine-PillsInput"]'),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Signup date')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Done editing' }),
        ).not.toBeInTheDocument();
    });

    it('offers no editing when two explores disagree on the type', () => {
        setDashboard([hiddenDateFilter], {
            'tile-1': [
                {
                    fieldId: 'orders_signup_date',
                    fallbackType: DimensionType.DATE,
                },
                {
                    fieldId: 'orders_signup_date',
                    fallbackType: DimensionType.STRING,
                },
            ],
        });
        renderWithProviders(<Harness initialFilters={[hiddenDateFilter]} />);

        expect(screen.getByText('Signup date')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Edit filter' }),
        ).not.toBeInTheDocument();
    });
});
