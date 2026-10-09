import {
    DimensionType,
    FieldType,
    FilterType,
    MetricType,
    type DashboardFilterableField,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getFilterRuleType } from './fieldKinds';

const makeField = (
    name: string,
    type: DimensionType,
    table = 'orders',
): DashboardFilterableField =>
    ({
        fieldType: FieldType.DIMENSION,
        type,
        name,
        label: name,
        table,
        tableLabel: table === 'orders' ? 'Orders' : 'Customers',
        sql: '',
        hidden: false,
    }) as unknown as DashboardFilterableField;

const amount = makeField('amount', DimensionType.NUMBER);
const revenue = {
    ...amount,
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'revenue',
} as unknown as DashboardFilterableField;

describe('getFilterRuleType', () => {
    it("is the field's type when the filter has a field", () => {
        expect(getFilterRuleType(amount, null)).toBe(FilterType.NUMBER);
        expect(getFilterRuleType(revenue, null)).toBe(FilterType.NUMBER);
    });

    it("is the SQL column's type when it has none, else text", () => {
        expect(getFilterRuleType(null, FilterType.DATE)).toBe(FilterType.DATE);
        expect(getFilterRuleType(null, null)).toBe(FilterType.STRING);
    });
});
