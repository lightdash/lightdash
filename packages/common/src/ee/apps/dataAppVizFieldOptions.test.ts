import {
    getDataAppVizFieldOptions,
    pruneDataAppVizFieldOptionValues,
} from './dataAppVizFieldOptions';
import { type DataAppVizField } from './types';

const fields: DataAppVizField[] = [
    { name: 'category', label: 'Category', type: 'dimension', required: true },
    {
        name: 'values',
        label: 'Values',
        type: 'metric',
        required: true,
        multiple: true,
        configOptions: [
            { type: 'color', name: 'color', label: 'Colour', default: '#000' },
            {
                type: 'boolean',
                name: 'dashed',
                label: 'Dashed',
                default: false,
            },
        ],
    },
];
const fieldMapping = {
    category: 'orders_status',
    values: ['orders_total', 'orders_count'],
};

describe('getDataAppVizFieldOptions', () => {
    it('resolves each bound field separately, falling back to defaults', () => {
        expect(
            getDataAppVizFieldOptions(fields, fieldMapping, {
                values: {
                    orders_total: { color: '#f00', dashed: 'yes' },
                    orders_unbound: { color: '#0f0' },
                },
            }),
        ).toEqual({
            values: {
                orders_total: { color: '#f00', dashed: false },
                orders_count: { color: '#000', dashed: false },
            },
        });
    });

    it('is empty for a viz without per-field options', () => {
        expect(
            getDataAppVizFieldOptions([fields[0]], fieldMapping, {}),
        ).toEqual({});
    });
});

describe('pruneDataAppVizFieldOptionValues', () => {
    it('keeps values across a reorder and drops unbound fields, undeclared options and stale types', () => {
        expect(
            pruneDataAppVizFieldOptionValues(
                fields,
                { values: ['orders_count', 'orders_total'] },
                {
                    values: {
                        orders_total: { color: '#f00', width: 3 },
                        orders_count: { dashed: 'yes' },
                        orders_removed: { color: '#0f0' },
                    },
                    category: { orders_status: { color: '#00f' } },
                    removed_input: { orders_total: { color: '#00f' } },
                },
            ),
        ).toEqual({ values: { orders_total: { color: '#f00' } } });
    });
});
