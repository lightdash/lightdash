import {
    FieldType,
    MetricType,
    type CompiledMetric,
    type DataAppVizField,
    type ItemsMap,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import DataAppVizSettings from './DataAppVizSettings';

vi.mock('../common/useAddFieldsToQuery', () => ({
    useAddFieldsToQuery: () => ({
        addableItems: [],
        addFieldToQuery: vi.fn(),
        isFieldPending: () => false,
    }),
}));

const metric = (name: string): CompiledMetric => ({
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    hidden: false,
});

const itemsMap: ItemsMap = {
    orders_total: metric('total'),
    orders_count: metric('count'),
};
const fields: DataAppVizField[] = [
    {
        name: 'values',
        label: 'Values',
        type: 'metric',
        required: true,
        multiple: true,
        configOptions: [
            {
                type: 'boolean',
                name: 'visible',
                label: 'Visible',
                default: true,
            },
            {
                type: 'color',
                name: 'color',
                label: 'Color',
                default: '#abcdef',
            },
        ],
    },
];

describe('DataAppVizSettings field options', () => {
    it('shows independent controls for each bound field and preserves fixed hex colors', async () => {
        const user = userEvent.setup();
        const onFieldOptionChange = vi.fn();
        renderWithProviders(
            <DataAppVizSettings
                itemsMap={itemsMap}
                fields={fields}
                fieldMapping={{ values: ['orders_total', 'orders_count'] }}
                fieldOptionValues={{
                    values: {
                        orders_total: { color: '#ff0000', visible: false },
                        orders_count: { color: '#00ff00' },
                    },
                }}
                colorPalette={['#111111', '#222222']}
                onFieldChange={vi.fn()}
                onFieldOptionChange={onFieldOptionChange}
            />,
        );

        const switches = screen.getAllByRole('switch', { name: 'Visible' });
        expect(switches[0]).not.toBeChecked();
        expect(switches[1]).toBeChecked();
        await user.click(switches[1]);
        expect(onFieldOptionChange).toHaveBeenCalledWith(
            'values',
            'orders_count',
            'visible',
            false,
        );

        const colorButtons = screen.getAllByRole('button', { name: 'Color' });
        await user.click(colorButtons[0]);
        expect(screen.getByPlaceholderText(/Type in a custom HEX/)).toHaveValue(
            'ff0000',
        );
        await user.click(screen.getByRole('button', { name: '#222222' }));
        await waitFor(() =>
            expect(onFieldOptionChange).toHaveBeenCalledWith(
                'values',
                'orders_total',
                'color',
                '#222222',
            ),
        );

        await user.click(colorButtons[1]);
        expect(screen.getByPlaceholderText(/Type in a custom HEX/)).toHaveValue(
            '00ff00',
        );
    });
});
