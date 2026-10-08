import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { FieldsAndTiles } from './FieldsAndTiles';

const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebar: () => mockSidebar.current,
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
const mockSqlColumnsByTile = vi.hoisted(() => ({}));
vi.mock('./useSqlColumnsByTile', () => ({
    useSqlColumnsByTile: () => mockSqlColumnsByTile,
}));

const dimension = (
    name: string,
    label: string,
    overrides: Partial<FilterableDimension> = {},
): FilterableDimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden: false,
    ...overrides,
});

const status = dimension('status', 'Status');
const region = dimension('region', 'Region');
const city = dimension('city', 'City', {
    table: 'customers',
    tableLabel: 'Customers',
});
const amount = dimension('amount', 'Amount', {
    table: 'payments',
    tableLabel: 'Payments',
    type: DimensionType.NUMBER,
});

const REGION = { fieldId: 'orders_region', tableName: 'orders' };

const tile = (uuid: string) =>
    ({ uuid, type: DashboardTileTypes.SAVED_CHART }) as DashboardTile;

const rule = (
    fieldId: string,
    tileTargets?: DashboardFilterRule['tileTargets'],
): DashboardFilterRule => ({
    id: 'control',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId, tableName: 'orders' },
    values: [],
    ...(tileTargets ? { tileTargets } : {}),
});

const addFirstField = vi.fn();
const addParameterControl = vi.fn();
const clearFields = vi.fn();
const updateFilter = vi.fn();
const setHighlightedFieldId = vi.fn();
const setHoveredFieldId = vi.fn();
const addWaitingField = vi.fn();
const removeWaitingField = vi.fn();

const setSidebar = (
    editingRule: DashboardFilterRule,
    overrides: Record<string, unknown> = {},
) => {
    mockSidebar.current = {
        editingRule,
        isPlaceholder: false,
        addFirstField,
        addParameterControl,
        clearFields,
        updateFilter,
        highlightedFieldId: null,
        setHighlightedFieldId,
        hoveredFieldId: null,
        setHoveredFieldId,
        waitingFieldIds: [],
        addWaitingField,
        removeWaitingField,
        ...overrides,
    };
};

const openRowMenu = (label: string) =>
    fireEvent.click(screen.getByLabelText(`More actions for ${label}`));

const getUpdatedRule = (): DashboardFilterRule => {
    expect(updateFilter).toHaveBeenCalledTimes(1);
    return updateFilter.mock.calls[0][0];
};

describe('FieldsAndTiles', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDashboardContext.current = {
            dashboardTiles: [tile('tile-1'), tile('tile-2')],
            allFilterableFields: [status, region],
            allFilterableFieldsMap: {
                orders_status: status,
                orders_region: region,
            },
            filterableFieldsByTileUuid: {
                'tile-1': [status, region],
                'tile-2': [status],
            },
            parameterControls: [],
            parameterDefinitions: {},
            tileParameterReferences: {},
        };
    });

    it('lets a placeholder pick its first field', async () => {
        setSidebar(rule(''), { isPlaceholder: true });
        renderWithProviders(<FieldsAndTiles />);

        expect(
            screen.getByText(
                'Select a field to filter or a parameter to control',
            ),
        ).toBeVisible();
        expect(
            screen.queryByText('Fields in this filter'),
        ).not.toBeInTheDocument();

        await userEvent.click(screen.getByPlaceholderText('Search fields'));
        const options = screen.getAllByRole('option', { hidden: true });
        expect(options.map((option) => option.textContent)).toEqual([
            'Orders Region1 tile',
            'Orders Status2 tiles',
        ]);

        await userEvent.click(options[1]);
        expect(addFirstField).toHaveBeenCalledTimes(1);
        expect(addFirstField).toHaveBeenCalledWith(status);
    });

    it('offers a placeholder the free parameters after the fields', async () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            parameterControls: [
                {
                    id: 'taken',
                    label: 'Taken',
                    parameterKeys: ['country'],
                    tileTargets: {},
                },
            ],
            parameterDefinitions: {
                region: { label: 'Sales region' },
                country: { label: 'Country' },
                limit: { label: 'Row limit', type: 'number' },
                unused: { label: 'Unused' },
            },
            tileParameterReferences: {
                'tile-1': ['region', 'country', 'limit'],
                'tile-2': ['region'],
            },
        };
        setSidebar(rule(''), { isPlaceholder: true });
        renderWithProviders(<FieldsAndTiles />);

        await userEvent.click(
            screen.getByPlaceholderText('Search fields and parameters'),
        );
        expect(screen.getByText('Fields')).toBeInTheDocument();
        expect(screen.getByText('Parameters')).toBeInTheDocument();
        const options = screen.getAllByRole('option', { hidden: true });
        expect(options.map((option) => option.textContent)).toEqual([
            'Orders Region1 tile',
            'Orders Status2 tiles',
            'Sales region2 tiles',
            'Row limit1 tile',
        ]);

        await userEvent.click(options[2]);
        expect(addParameterControl).toHaveBeenCalledTimes(1);
        expect(addParameterControl).toHaveBeenCalledWith('region');
        expect(addFirstField).not.toHaveBeenCalled();
    });

    it('lists the fields of a filter with their tile counts', () => {
        setSidebar(rule('orders_status', { 'tile-1': REGION }));
        renderWithProviders(<FieldsAndTiles />);

        expect(screen.getByText('Fields in this filter')).toBeVisible();
        expect(
            screen.getByText('Choose which field each tile is filtered by.'),
        ).toBeVisible();
        expect(screen.getByRole('button', { name: 'Status' })).toBeVisible();
        expect(screen.getByText('Orders · 1 of 2 tiles')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Region' })).toBeVisible();
        expect(screen.getByText('Orders · 1 of 1 tile')).toBeVisible();
        expect(screen.getByText('Apply to all 2')).toBeVisible();
        expect(screen.queryByText('Apply to all 1')).not.toBeInTheDocument();
        expect(
            screen.queryByPlaceholderText('Search fields'),
        ).not.toBeInTheDocument();
    });

    it('falls back to the field id when the field is unknown', () => {
        setSidebar(rule('orders_gone'));
        renderWithProviders(<FieldsAndTiles />);

        expect(screen.getByText('orders_gone')).toBeVisible();
        expect(screen.getByText('orders · 0 of 0 tiles')).toBeVisible();
        expect(
            screen.queryByLabelText('More actions for orders_gone'),
        ).toBeInTheDocument();
    });

    it('highlights a field on click and on hover', async () => {
        setSidebar(rule('orders_status'));
        const { rerender } = renderWithProviders(<FieldsAndTiles />);
        const label = screen.getByRole('button', { name: 'Status' });

        await userEvent.hover(label);
        expect(setHoveredFieldId).toHaveBeenLastCalledWith('orders_status');
        await userEvent.click(label);
        expect(setHighlightedFieldId).toHaveBeenLastCalledWith('orders_status');

        setSidebar(rule('orders_status'), {
            highlightedFieldId: 'orders_status',
            hoveredFieldId: 'orders_status',
        });
        rerender(<FieldsAndTiles />);
        const pressed = screen.getByRole('button', { name: 'Status' });
        expect(pressed).toHaveAttribute('aria-pressed', 'true');
        await userEvent.click(pressed);
        expect(setHighlightedFieldId).toHaveBeenLastCalledWith(null);
        await userEvent.unhover(pressed);
        expect(setHoveredFieldId).toHaveBeenLastCalledWith(null);
    });

    it('highlights a field when any part of its card is hovered', async () => {
        renderWithProviders(<FieldsAndTiles />);

        await userEvent.hover(screen.getByText(/^Orders · /));
        expect(setHoveredFieldId).toHaveBeenLastCalledWith('orders_status');
    });

    it('applies a field to every tile that offers it', () => {
        setSidebar(rule('orders_status', { 'tile-1': false }));
        renderWithProviders(<FieldsAndTiles />);

        expect(screen.getByText('Orders · 1 of 2 tiles')).toBeVisible();
        fireEvent.click(screen.getByText('Apply to all 2'));
        expect(getUpdatedRule().tileTargets).toBeUndefined();
    });

    it('clears a field from its tiles', async () => {
        setSidebar(rule('orders_status'));
        renderWithProviders(<FieldsAndTiles />);

        openRowMenu('Status');
        fireEvent.click(await screen.findByText('Clear from tiles'));
        expect(getUpdatedRule().tileTargets).toEqual({
            'tile-1': false,
            'tile-2': false,
        });
        expect(clearFields).not.toHaveBeenCalled();
    });

    it('hides the clear action for a field on no tile', async () => {
        setSidebar(rule('orders_status', { 'tile-1': false, 'tile-2': false }));
        renderWithProviders(<FieldsAndTiles />);

        openRowMenu('Status');
        expect(await screen.findByText('Remove field')).toBeInTheDocument();
        expect(screen.queryByText('Clear from tiles')).not.toBeInTheDocument();
    });

    it('removes one of several fields', async () => {
        setSidebar(rule('orders_status', { 'tile-1': REGION }), {
            highlightedFieldId: 'orders_region',
        });
        renderWithProviders(<FieldsAndTiles />);

        openRowMenu('Region');
        fireEvent.click(await screen.findByText('Remove field'));
        const next = getUpdatedRule();
        expect(next.target.fieldId).toBe('orders_status');
        expect(next.tileTargets).toBeUndefined();
        expect(setHighlightedFieldId).toHaveBeenCalledWith(null);
        expect(clearFields).not.toHaveBeenCalled();
    });

    it('promotes another field when the first one is removed', async () => {
        setSidebar(rule('orders_status', { 'tile-1': REGION }));
        renderWithProviders(<FieldsAndTiles />);

        openRowMenu('Status');
        fireEvent.click(await screen.findByText('Remove field'));
        const next = getUpdatedRule();
        expect(next.target).toEqual(REGION);
        expect(next.tileTargets).toBeUndefined();
    });

    it('turns the filter back into a placeholder when its only field is removed', async () => {
        setSidebar(rule('orders_status'));
        renderWithProviders(<FieldsAndTiles />);

        openRowMenu('Status');
        fireEvent.click(await screen.findByText('Remove field'));
        expect(clearFields).toHaveBeenCalledTimes(1);
        expect(updateFilter).not.toHaveBeenCalled();
    });

    describe('Add a field', () => {
        beforeEach(() => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [
                    tile('tile-1'),
                    tile('tile-2'),
                    tile('tile-3'),
                    tile('tile-4'),
                ],
                allFilterableFields: [status, region, city, amount],
                allFilterableFieldsMap: {
                    orders_status: status,
                    orders_region: region,
                    customers_city: city,
                    payments_amount: amount,
                },
                filterableFieldsByTileUuid: {
                    'tile-1': [status, region],
                    'tile-2': [status],
                    'tile-3': [city],
                    'tile-4': [amount],
                },
            };
        });

        it('offers every other field of the same kind that a tile offers', async () => {
            setSidebar(rule('orders_status'));
            renderWithProviders(<FieldsAndTiles />);

            const button = screen.getByRole('button', { name: 'Add a field' });
            expect(button).not.toHaveAttribute('data-disabled');
            await userEvent.click(button);

            const options = screen.getAllByRole('option', { hidden: true });
            expect(options.map((option) => option.textContent)).toEqual([
                'Customers City1 tile',
                'Orders Region1 tile',
            ]);

            await userEvent.click(options[0]);
            expect(getUpdatedRule().tileTargets).toEqual({
                'tile-3': { fieldId: 'customers_city', tableName: 'customers' },
            });
            expect(addWaitingField).not.toHaveBeenCalled();
            expect(setHighlightedFieldId).toHaveBeenLastCalledWith(
                'customers_city',
            );
            expect(
                screen.queryByPlaceholderText('Search fields'),
            ).not.toBeInTheDocument();
        });

        it('keeps a field waiting when every tile it fits already has one', async () => {
            setSidebar(rule('orders_status'));
            renderWithProviders(<FieldsAndTiles />);

            await userEvent.click(
                screen.getByRole('button', { name: 'Add a field' }),
            );
            await userEvent.click(
                screen.getByRole('option', {
                    name: /Region/,
                    hidden: true,
                }),
            );

            // tile-1 keeps Status: nothing is taken away from it
            expect(getUpdatedRule().tileTargets).toBeUndefined();
            expect(addWaitingField).toHaveBeenCalledWith('orders_region');
            expect(setHighlightedFieldId).toHaveBeenLastCalledWith(
                'orders_region',
            );
        });

        it('lists a waiting field on no tile and removes it on its own', async () => {
            setSidebar(rule('orders_status'), {
                waitingFieldIds: ['orders_region'],
            });
            renderWithProviders(<FieldsAndTiles />);

            expect(screen.getByText('Orders · 0 of 1 tile')).toBeVisible();
            expect(screen.getByText('Apply to all 1')).toBeVisible();

            openRowMenu('Region');
            await userEvent.click(await screen.findByText('Remove field'));
            expect(removeWaitingField).toHaveBeenCalledWith('orders_region');
            expect(updateFilter).not.toHaveBeenCalled();
            expect(clearFields).not.toHaveBeenCalled();
        });

        it('offers a field again once one of its tiles is left out', async () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            renderWithProviders(<FieldsAndTiles />);

            await userEvent.click(
                screen.getByRole('button', { name: 'Add a field' }),
            );
            const options = screen.getAllByRole('option', { hidden: true });
            expect(options.map((option) => option.textContent)).toEqual([
                'Customers City1 tile',
                'Orders Region1 tile',
            ]);

            await userEvent.click(options[1]);
            expect(getUpdatedRule().tileTargets).toEqual({
                'tile-1': REGION,
            });
        });

        it('is disabled when no tile offers another field of the kind', async () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [tile('tile-2'), tile('tile-4')],
                filterableFieldsByTileUuid: {
                    'tile-2': [status],
                    'tile-4': [amount],
                },
            };
            setSidebar(rule('orders_status'));
            renderWithProviders(<FieldsAndTiles />);

            const button = screen.getByRole('button', { name: 'Add a field' });
            expect(button).toHaveAttribute('data-disabled', 'true');
            await userEvent.click(button);
            expect(
                screen.queryByPlaceholderText('Search fields'),
            ).not.toBeInTheDocument();

            await userEvent.hover(button);
            expect(
                await screen.findByText(
                    'No other field of this type is on a tile',
                ),
            ).toBeInTheDocument();
        });
    });

    it('renders nothing when no control is edited', () => {
        mockSidebar.current = { ...mockSidebar.current, editingRule: null };
        renderWithProviders(<FieldsAndTiles />);

        expect(
            screen.queryByText('Fields in this filter'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText(
                'Select a field to filter or a parameter to control',
            ),
        ).not.toBeInTheDocument();
    });
});
