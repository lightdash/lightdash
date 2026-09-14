import {
    DimensionType,
    FieldType,
    type Dimension,
    type ItemsMap,
    type TableCalculation,
} from '@lightdash/common';
import {
    isPivotRowValue,
    resolvePivotRowFieldIds,
    shouldDisableMetricsAsRows,
} from './pivotRows';

const dimension = (name: string): Dimension => ({
    name,
    type: DimensionType.STRING,
    table: 'subscriptions',
    tableLabel: 'Subscriptions',
    label: name,
    fieldType: FieldType.DIMENSION,
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

describe('isPivotRowValue', () => {
    it('allows table calculations on the pivot row axis', () => {
        const tableCalculation: TableCalculation = {
            name: 'retention_rate',
            displayName: 'Retention rate',
            sql: '${subscriptions_retained} / ${subscriptions_started}',
        };

        expect(isPivotRowValue(tableCalculation)).toBe(true);
    });
});

describe('resolvePivotRowFieldIds', () => {
    const cohortSize: TableCalculation = {
        name: 'cohort_size',
        displayName: 'Cohort size',
        sql: '${subscriptions_cohort_size}',
    };
    const itemsMap: ItemsMap = {
        cohort_month: dimension('cohort_month'),
        months_since_start: dimension('months_since_start'),
        cohort_size: cohortSize,
    };

    it('keeps selected non-pivot dimensions on Rows when they are not explicitly configured', () => {
        expect(
            resolvePivotRowFieldIds({
                selectedItemIds: [
                    'cohort_month',
                    'months_since_start',
                    'cohort_size',
                ],
                itemsMap,
                pivotDimensions: ['months_since_start'],
                columnOrder: [
                    'cohort_month',
                    'months_since_start',
                    'cohort_size',
                ],
                pivotRows: ['cohort_size'],
            }),
        ).toEqual(['cohort_size', 'cohort_month']);
    });
});

describe('shouldDisableMetricsAsRows', () => {
    const revenue: TableCalculation = {
        name: 'revenue',
        displayName: 'Revenue',
        sql: '${orders_total_revenue}',
    };
    const margin: TableCalculation = {
        name: 'margin',
        displayName: 'Margin',
        sql: '${orders_total_margin}',
    };
    const itemsMap = { revenue, margin };

    it('disables metrics-as-rows when every value field is already a pivot row', () => {
        expect(
            shouldDisableMetricsAsRows({
                metricsAsRows: true,
                selectedItemIds: ['revenue', 'margin'],
                rowFieldIds: ['revenue', 'margin'],
                itemsMap,
            }),
        ).toBe(true);
    });

    it('keeps metrics-as-rows enabled while another value field remains', () => {
        expect(
            shouldDisableMetricsAsRows({
                metricsAsRows: true,
                selectedItemIds: ['revenue', 'margin'],
                rowFieldIds: ['revenue'],
                itemsMap,
            }),
        ).toBe(false);
    });

    it('waits for query fields before normalizing loaded configuration', () => {
        expect(
            shouldDisableMetricsAsRows({
                metricsAsRows: true,
                selectedItemIds: undefined,
                rowFieldIds: ['revenue'],
                itemsMap: undefined,
            }),
        ).toBe(false);
    });
});
