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
        colorOptions: {
            gradient: {
                enabled: false,
                start: '#111111',
                end: '#eeeeee',
                min: 'auto',
                max: 'auto',
            },
        },
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
    it('shows rules for numeric bindings even without other settings', async () => {
        const user = userEvent.setup();
        const onFieldRulesChange = vi.fn();
        renderWithProviders(
            <DataAppVizSettings
                itemsMap={itemsMap}
                fields={[
                    {
                        ...fields[0],
                        colorOptions: { rules: [] },
                        configOptions: [],
                    },
                ]}
                fieldMapping={{ values: ['orders_total', 'orders_count'] }}
                colorPalette={['#222222']}
                onFieldChange={vi.fn()}
                onFieldOptionChange={vi.fn()}
                onFieldGradientChange={vi.fn()}
                onFieldRulesChange={onFieldRulesChange}
            />,
        );

        expect(screen.getAllByText('Color rules')).toHaveLength(2);
        await user.click(
            screen.getAllByRole('button', { name: 'Add rule' })[1],
        );
        const [slot, fieldId, declaredDefault, update] =
            onFieldRulesChange.mock.lastCall!;
        expect([slot, fieldId, declaredDefault]).toEqual([
            'values',
            'orders_count',
            [],
        ]);
        expect(update([])).toEqual([
            { enabled: true, color: '#222222', operator: 'gt', value: 0 },
        ]);
    });

    it('shows independent controls for each bound field and preserves fixed hex colors', async () => {
        const user = userEvent.setup();
        const onFieldOptionChange = vi.fn();
        const onFieldGradientChange = vi.fn();
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
                onFieldGradientChange={onFieldGradientChange}
                onFieldRulesChange={vi.fn()}
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

        const gradients = screen.getAllByRole('switch', {
            name: 'Use gradient',
        });
        expect(gradients).toHaveLength(2);
        await user.click(gradients[0]);
        expect(onFieldGradientChange).toHaveBeenCalledWith(
            'values',
            'orders_total',
            fields[0].colorOptions?.gradient,
            { enabled: true },
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
