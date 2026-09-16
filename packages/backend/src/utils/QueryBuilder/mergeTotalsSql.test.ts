import {
    DimensionType,
    FieldType,
    MetricType,
    type ItemsMap,
} from '@lightdash/common';
import { buildMergeTotalsSql } from './mergeTotalsSql';

const field = (
    fieldType: FieldType,
    type: MetricType | DimensionType,
): ItemsMap[string] =>
    ({
        fieldType,
        type,
        name: 'x',
        label: 'X',
        table: 'a',
        tableLabel: 'A',
        sql: '',
        hidden: false,
    }) as ItemsMap[string];

const itemsMap: ItemsMap = {
    merge_join_key_0: field(FieldType.DIMENSION, DimensionType.STRING),
    a_orders_total: field(FieldType.METRIC, MetricType.SUM),
    a_orders_count: field(FieldType.METRIC, MetricType.COUNT),
    b_payments_unique: field(FieldType.METRIC, MetricType.COUNT_DISTINCT),
    b_payments_max: field(FieldType.METRIC, MetricType.MAX),
};

describe('buildMergeTotalsSql', () => {
    it('aggregates only the columns that are exact over merged rows, aliased by field id', () => {
        const statement = buildMergeTotalsSql(
            [
                'merge_join_key_0',
                'a_orders_total',
                'a_orders_count',
                'b_payments_unique',
                'b_payments_max',
            ],
            itemsMap,
        );

        expect(statement?.fieldIds).toEqual([
            'a_orders_total',
            'a_orders_count',
            'b_payments_max',
        ]);
        expect(statement?.sql).toBe(
            [
                'SELECT SUM("a_orders_total") AS "a_orders_total",',
                '       SUM("a_orders_count") AS "a_orders_count",',
                '       MAX("b_payments_max") AS "b_payments_max"',
                'FROM "merged_result"',
            ].join('\n'),
        );
    });

    it('has nothing to run when no column can be totalled exactly', () => {
        expect(
            buildMergeTotalsSql(
                ['merge_join_key_0', 'b_payments_unique'],
                itemsMap,
            ),
        ).toBeNull();
    });
});
