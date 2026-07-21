import { SupportedDbtAdapter } from '../types/dbt';
import { type WarehouseSqlBuilder } from '../types/warehouse';
import { VizAggregationOptions } from '../visualizations/types';
import { getAggregatedField } from './warehouse';

const mockWarehouseSqlBuilder = {
    getFieldQuoteChar: () => '"',
    getAdapterType: () => SupportedDbtAdapter.POSTGRES,
} as WarehouseSqlBuilder;

describe('getAggregatedField', () => {
    it('should wrap the reference in the field quote character', () => {
        expect(
            getAggregatedField(
                mockWarehouseSqlBuilder,
                VizAggregationOptions.SUM,
                'event_id',
            ),
        ).toBe('sum("event_id")');
    });

    it('should escape embedded field quote characters in the reference', () => {
        expect(
            getAggregatedField(
                mockWarehouseSqlBuilder,
                VizAggregationOptions.SUM,
                'event_id") AS "pwn',
            ),
        ).toBe('sum("event_id"") AS ""pwn")');
    });
});
