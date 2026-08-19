import type { DataAppVizField } from '../ee/apps/types';
import { deriveDataAppVizPivotConfig } from './deriveDataAppVizPivotConfig';

const fields: DataAppVizField[] = [
    { name: 'category', label: 'Category', type: 'dimension', required: true },
    { name: 'value', label: 'Value', type: 'metric', required: true },
    { name: 'colour', label: 'Colour', type: 'series', required: true },
    { name: 'facet', label: 'Facet', type: 'series', required: false },
];

describe('deriveDataAppVizPivotConfig', () => {
    it('returns mapped series fields in declaration order', () => {
        expect(
            deriveDataAppVizPivotConfig(fields, {
                category: 'orders_created_date',
                value: 'orders_total',
                colour: 'orders_status',
                facet: 'orders_region',
            }),
        ).toEqual({ columns: ['orders_status', 'orders_region'] });
    });

    it('ignores unmapped series fields', () => {
        expect(
            deriveDataAppVizPivotConfig(fields, {
                category: 'orders_created_date',
                value: 'orders_total',
                facet: 'orders_region',
            }),
        ).toEqual({ columns: ['orders_region'] });
    });

    it('returns undefined when the chart has no mapped series field', () => {
        expect(
            deriveDataAppVizPivotConfig(fields, {
                category: 'orders_created_date',
                value: 'orders_total',
            }),
        ).toBeUndefined();
    });
});
