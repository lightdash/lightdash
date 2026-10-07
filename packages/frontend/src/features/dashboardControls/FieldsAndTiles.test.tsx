import {
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type FilterableDimension,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
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

const dimension = (name: string, label: string): FilterableDimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

const status = dimension('status', 'Status');
const region = dimension('region', 'Region');

const rule = (fieldId: string): DashboardFilterRule => ({
    id: 'control',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId, tableName: 'orders' },
    values: [],
});

const addFirstField = vi.fn();

describe('FieldsAndTiles', () => {
    beforeEach(() => {
        addFirstField.mockClear();
        mockDashboardContext.current = {
            allFilterableFields: [status, region],
            allFilterableFieldsMap: {
                orders_status: status,
                orders_region: region,
            },
            filterableFieldsByTileUuid: {
                'tile-1': [status, region],
                'tile-2': [status],
            },
        };
    });

    it('lets a placeholder pick its first field', async () => {
        mockSidebar.current = {
            editingRule: rule(''),
            isPlaceholder: true,
            addFirstField,
        };
        renderWithProviders(<FieldsAndTiles />);

        expect(screen.getByText('Select a field to filter')).toBeVisible();
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

    it('shows the field of a placed filter', () => {
        mockSidebar.current = {
            editingRule: rule('orders_status'),
            isPlaceholder: false,
            addFirstField,
        };
        renderWithProviders(<FieldsAndTiles />);

        expect(screen.getByText('Fields in this filter')).toBeVisible();
        expect(screen.getByText('Status')).toBeVisible();
        expect(screen.getByText('Orders')).toBeVisible();
        expect(
            screen.queryByPlaceholderText('Search fields'),
        ).not.toBeInTheDocument();
    });

    it('falls back to the field id when the field is unknown', () => {
        mockSidebar.current = {
            editingRule: rule('orders_gone'),
            isPlaceholder: false,
            addFirstField,
        };
        renderWithProviders(<FieldsAndTiles />);

        expect(screen.getByText('orders_gone')).toBeVisible();
        expect(screen.getByText('orders')).toBeVisible();
    });

    it('renders nothing when no control is edited', () => {
        mockSidebar.current = {
            editingRule: null,
            isPlaceholder: false,
            addFirstField,
        };
        renderWithProviders(<FieldsAndTiles />);

        expect(
            screen.queryByText('Fields in this filter'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('Select a field to filter'),
        ).not.toBeInTheDocument();
    });
});
