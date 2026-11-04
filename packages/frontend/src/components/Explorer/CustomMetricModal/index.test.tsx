import {
    CustomDimensionType,
    CustomFormatType,
    DimensionType,
    MetricType,
    type AdditionalMetric,
    type CustomSqlDimension,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomMetricModal } from '.';

const mocks = vi.hoisted(() => ({
    item: undefined as CustomSqlDimension | AdditionalMetric | undefined,
    dimensions: [] as CustomSqlDimension[],
    isEditing: false,
    type: 'sum',
    dispatch: vi.fn(),
    additionalMetrics: [] as AdditionalMetric[],
    fieldsMap: {},
}));

vi.mock('../../../features/explorer/store', () => ({
    useExplorerSelector: (selector: (state: unknown) => unknown) =>
        selector({
            explorer: {
                modals: {
                    additionalMetric: {
                        isOpen: true,
                        isEditing: mocks.isEditing,
                        item: mocks.item,
                        type: mocks.type,
                    },
                },
            },
        }),
    useExplorerDispatch: () => mocks.dispatch,
    selectAdditionalMetrics: () => mocks.additionalMetrics,
    selectMetricQuery: () => ({ customDimensions: mocks.dimensions }),
    selectTableName: () => 'orders',
    explorerActions: {
        toggleAdditionalMetricModal: vi.fn(),
        editAdditionalMetric: (payload: unknown) => ({ type: 'edit', payload }),
        addAdditionalMetric: (payload: unknown) => ({ type: 'add', payload }),
    },
}));
vi.mock('../../common/MantineModal', () => ({
    default: ({
        children,
        actions,
    }: {
        children: ReactNode;
        actions: ReactNode;
    }) => (
        <>
            {children}
            {actions}
        </>
    ),
}));
vi.mock('../../../features/mergeQuery/context/useMerge', () => ({
    useMergeSafe: () => undefined,
}));
vi.mock('../../../hooks/useExplore', () => ({
    useExplore: () => ({ data: undefined }),
}));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: vi.fn(), showToastError: vi.fn() }),
}));
vi.mock('../../../hooks/dashboard/useUpdateDashboardCustomMetric', () => ({
    useUpdateDashboardCustomMetric: () => ({ isLoading: false }),
}));
vi.mock('../../../providers/Explorer/useIsModalHosted', () => ({
    useModalHostedDashboard: () => undefined,
    useModalHostedDashboardMetricIds: () => undefined,
    useModalHostedRegistryMetricEdited: () => undefined,
}));
vi.mock('./hooks/useDataForFiltersProvider', () => ({
    useDataForFiltersProvider: () => ({ fieldsMap: mocks.fieldsMap }),
}));
vi.mock('./FilterForm', () => ({ FilterForm: () => null }));
vi.mock('./RegistryImpactPreviewModal', () => ({ default: () => null }));
vi.mock('../../common/Filters/FiltersProvider', () => ({
    default: () => null,
}));

const dimension: CustomSqlDimension = {
    id: 'amount',
    name: 'Amount',
    table: 'orders',
    type: CustomDimensionType.SQL,
    dimensionType: DimensionType.NUMBER,
    sql: '${orders.price} * 2',
};
const renderModal = () =>
    render(
        <MantineProvider env="test">
            <CustomMetricModal />
        </MantineProvider>,
    );

beforeEach(() => {
    mocks.item = dimension;
    mocks.dimensions = [dimension];
    mocks.isEditing = false;
    mocks.type = MetricType.SUM;
    mocks.dispatch.mockClear();
});

describe('custom dimension metric formatting', () => {
    it('shows formatting for numeric custom dimensions on creation', async () => {
        renderModal();
        await userEvent.click(screen.getByRole('button', { name: 'Format' }));
        expect(
            screen.getByText('Currency', { exact: true }),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Percent', { exact: true }),
        ).toBeInTheDocument();
        await userEvent.click(screen.getByText('Percent', { exact: true }));
        await userEvent.click(screen.getByRole('button', { name: 'Create' }));
        expect(mocks.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'add',
                payload: expect.objectContaining({
                    formatOptions: expect.objectContaining({
                        type: CustomFormatType.PERCENT,
                    }),
                }),
            }),
        );
    });

    it('opens the existing currency format when editing a custom dimension metric', async () => {
        mocks.isEditing = true;
        mocks.item = {
            name: 'total',
            label: 'Total',
            table: 'orders',
            sql: '${orders.amount}',
            type: MetricType.SUM,
            formatOptions: { type: CustomFormatType.CURRENCY, currency: 'USD' },
        };
        renderModal();
        await userEvent.click(screen.getByRole('button', { name: 'Format' }));
        expect(
            screen.getByLabelText('Currency', {
                exact: true,
                selector: 'input',
            }),
        ).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: 'Save changes' }),
        );
        expect(mocks.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'edit',
                payload: expect.objectContaining({
                    additionalMetric: expect.objectContaining({
                        formatOptions: expect.objectContaining({
                            type: CustomFormatType.CURRENCY,
                            currency: 'USD',
                        }),
                    }),
                }),
            }),
        );
    });

    it('hides numeric formats for a date-valued custom metric', () => {
        mocks.item = { ...dimension, dimensionType: DimensionType.DATE };
        mocks.type = MetricType.MIN;
        renderModal();
        expect(
            screen.queryByRole('button', { name: 'Format' }),
        ).not.toBeInTheDocument();
    });

    it('allows numeric formatting for counts of custom string dimensions', () => {
        mocks.item = { ...dimension, dimensionType: DimensionType.STRING };
        mocks.type = MetricType.COUNT;
        renderModal();
        expect(
            screen.getByRole('button', { name: 'Format' }),
        ).toBeInTheDocument();
    });
});
