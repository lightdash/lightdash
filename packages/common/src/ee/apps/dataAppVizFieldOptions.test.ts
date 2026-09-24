import {
    getEffectiveDataAppVizFieldOptionValues,
    pruneDataAppVizFieldOptionValues,
    setDataAppVizFieldOptionValue,
} from './dataAppVizFieldOptions';
import { type DataAppVizField } from './types';

const fields: DataAppVizField[] = [
    {
        name: 'values',
        label: 'Values',
        type: 'metric',
        required: true,
        multiple: true,
        configOptions: [
            {
                name: 'color',
                label: 'Color',
                type: 'color',
                default: '#000000',
            },
            {
                name: 'style',
                label: 'Style',
                type: 'select',
                choices: [{ label: 'Solid', value: 'solid' }],
                default: 'solid',
            },
        ],
    },
    {
        name: 'category',
        label: 'Category',
        type: 'dimension',
        required: true,
        configOptions: [
            { name: 'label', label: 'Label', type: 'text', default: '' },
        ],
    },
];

describe('per-bound-field options', () => {
    it('keeps values by field id when order changes, and resolves defaults', () => {
        const mapping = { values: ['b', 'a'], category: 'c' };
        const stored = {
            values: { a: { color: '#abcdef' }, b: { style: 'removed' } },
            category: { c: { label: 'Group' } },
        };
        expect(
            getEffectiveDataAppVizFieldOptionValues(fields, mapping, stored),
        ).toEqual({
            values: {
                b: { color: '#000000', style: 'solid' },
                a: { color: '#abcdef', style: 'solid' },
            },
            category: { c: { label: 'Group' } },
        });
        expect(
            pruneDataAppVizFieldOptionValues(fields, mapping, stored),
        ).toEqual({
            values: { a: { color: '#abcdef' } },
            category: { c: { label: 'Group' } },
        });
    });

    it('drops removed and replaced field ids and stale options after an upgrade', () => {
        const stored = {
            values: {
                old: { color: '#123456' },
                keep: { color: '#654321', style: 'solid' },
            },
            retired: { x: { label: 'Old' } },
        };
        const upgraded = [
            { ...fields[0], configOptions: [fields[0].configOptions![0]] },
        ];
        expect(
            pruneDataAppVizFieldOptionValues(
                upgraded,
                { values: ['keep', 'new'] },
                stored,
            ),
        ).toEqual({ values: { keep: { color: '#654321' } } });
        expect(
            pruneDataAppVizFieldOptionValues(
                fields,
                { values: [], category: 'c' },
                stored,
            ),
        ).toEqual({});
    });

    it('does not create settings for an empty optional binding', () => {
        const stored = { category: { '': { label: 'Stale' } } };
        expect(
            pruneDataAppVizFieldOptionValues(fields, { category: '' }, stored),
        ).toEqual({});
        expect(
            getEffectiveDataAppVizFieldOptionValues(
                fields,
                { category: '' },
                stored,
            ),
        ).toEqual({});
    });
});

describe('setDataAppVizFieldOptionValue', () => {
    it('writes a setting for a field bound to a single slot', () => {
        expect(
            setDataAppVizFieldOptionValue(
                { category: { orders_status: { label: 'Status' } } },
                { category: 'orders_status' },
                'category',
                'orders_status',
                'color',
                'red',
            ),
        ).toEqual({
            category: { orders_status: { label: 'Status', color: 'red' } },
        });
    });

    it('returns the same values for a field that is not bound to the slot', () => {
        const values = { category: { orders_status: { label: 'Status' } } };
        expect(
            setDataAppVizFieldOptionValue(
                values,
                { category: 'orders_region' },
                'category',
                'orders_status',
                'label',
                'Region',
            ),
        ).toBe(values);
        expect(
            setDataAppVizFieldOptionValue(
                values,
                {},
                'category',
                'orders_status',
                'label',
                'Region',
            ),
        ).toBe(values);
    });

    it('writes each field of a multiple slot independently', () => {
        const mapping = { values: ['orders_total', 'orders_count'] };
        const first = setDataAppVizFieldOptionValue(
            {},
            mapping,
            'values',
            'orders_total',
            'color',
            'red',
        );
        expect(
            setDataAppVizFieldOptionValue(
                first,
                mapping,
                'values',
                'orders_count',
                'color',
                'blue',
            ),
        ).toEqual({
            values: {
                orders_total: { color: 'red' },
                orders_count: { color: 'blue' },
            },
        });
    });

    it('keeps the same field bound in two slots independent', () => {
        const mapping = { values: ['orders_total'], size: 'orders_total' };
        expect(
            setDataAppVizFieldOptionValue(
                { values: { orders_total: { color: 'red' } } },
                mapping,
                'size',
                'orders_total',
                'color',
                'blue',
            ),
        ).toEqual({
            values: { orders_total: { color: 'red' } },
            size: { orders_total: { color: 'blue' } },
        });
    });
});
