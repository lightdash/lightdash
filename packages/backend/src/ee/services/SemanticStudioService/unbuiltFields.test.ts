import {
    DimensionType,
    type Explore,
    type WarehouseCatalog,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { findUnbuiltFields } from './unbuiltFields';

const field = (table: string, name: string, sql: string) => ({
    table,
    name,
    label: name,
    sql,
});

const explore = (
    name: string,
    dimensions: ReturnType<typeof field>[],
    metrics: ReturnType<typeof field>[] = [],
): Explore =>
    ({
        name,
        baseTable: name,
        tables: {
            [name]: {
                name,
                database: 'db',
                schema: 'Shop',
                dimensions: Object.fromEntries(
                    dimensions.map((d) => [d.name, d]),
                ),
                metrics: Object.fromEntries(metrics.map((m) => [m.name, m])),
            },
        },
    }) as Explore;

const catalog: WarehouseCatalog = {
    db: {
        shop: {
            payments: {
                amount: DimensionType.NUMBER,
                'address.city': DimensionType.STRING,
            },
        },
    },
};

describe('findUnbuiltFields', () => {
    it('finds fields that read a column the built table lacks, and the fields defined on them', () => {
        const payments = explore(
            'payments',
            [
                field('payments', 'amount', '${TABLE}.amount'),
                field('payments', 'city', '${TABLE}.address.city'),
                field('payments', 'usage_channel', '${TABLE}."usage_channel"'),
                field('payments', 'channel_group', 'upper(${usage_channel})'),
            ],
            [
                field('payments', 'total', 'sum(${TABLE}.amount)'),
                field('payments', 'channels', '${payments.channel_group}'),
            ],
        );
        expect(
            findUnbuiltFields([payments], [], catalog).map(
                ({ fieldId }) => fieldId,
            ),
        ).toEqual([
            'payments_usage_channel',
            'payments_channel_group',
            'payments_channels',
        ]);
    });

    it('takes every field of a model whose table is not built, and says nothing about a schema it does not know', () => {
        const refunds = explore('refunds', [
            field('refunds', 'id', '${TABLE}.id'),
        ]);
        expect(findUnbuiltFields([refunds], [], catalog)).toEqual([
            { model: 'refunds', fieldId: 'refunds_id', label: 'id' },
        ]);
        expect(findUnbuiltFields([refunds], [], { other: {} })).toEqual([]);
    });

    it('leaves out a field that already lacks its column in what is published', () => {
        const published = explore('payments', [
            field('payments', 'legacy', '${TABLE}.legacy'),
        ]);
        const draft = explore('payments', [
            field('payments', 'legacy', '${TABLE}.legacy'),
            field('payments', 'usage_channel', '${TABLE}.usage_channel'),
        ]);
        expect(
            findUnbuiltFields([draft], [published], catalog).map(
                ({ fieldId }) => fieldId,
            ),
        ).toEqual(['payments_usage_channel']);
    });
});
