import {
    BinType,
    CustomDimensionType,
    DimensionType,
    FieldType,
    MetricType,
    TableCalculationType,
    type CustomBinDimension,
    type Dimension,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { canHaveWarehouseTotal } from './canHaveWarehouseTotal';

const numberDimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.NUMBER,
    name: 'mrr_usd',
    label: 'MRR',
    table: 'billing_customers',
    tableLabel: 'Billing customers',
    sql: '${TABLE}.mrr_usd',
    hidden: false,
};

const sumMetric: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'total_mrr',
    label: 'Total MRR',
    table: 'billing_customers',
    tableLabel: 'Billing customers',
    sql: '${TABLE}.mrr_usd',
    hidden: false,
};

const numericTableCalculation: TableCalculation = {
    name: 'mrr_x12',
    displayName: 'ARR',
    sql: '${billing_customers.total_mrr} * 12',
    type: TableCalculationType.NUMBER,
};

const customBinDimension: CustomBinDimension = {
    id: 'mrr_bin',
    name: 'MRR bin',
    type: CustomDimensionType.BIN,
    dimensionId: 'billing_customers_mrr_usd',
    table: 'billing_customers',
    binType: BinType.FIXED_NUMBER,
    binNumber: 5,
};

describe('canHaveWarehouseTotal', () => {
    it('is true for numeric metrics', () => {
        expect(canHaveWarehouseTotal(sumMetric)).toBe(true);
    });

    it('is true for numeric table calculations', () => {
        expect(canHaveWarehouseTotal(numericTableCalculation)).toBe(true);
    });

    it('is false for numeric dimensions', () => {
        expect(canHaveWarehouseTotal(numberDimension)).toBe(false);
    });

    it('is false for custom dimensions', () => {
        expect(canHaveWarehouseTotal(customBinDimension)).toBe(false);
    });

    it('is false for string metrics and missing items', () => {
        expect(
            canHaveWarehouseTotal({ ...sumMetric, type: MetricType.STRING }),
        ).toBe(false);
        expect(canHaveWarehouseTotal(undefined)).toBe(false);
    });
});
