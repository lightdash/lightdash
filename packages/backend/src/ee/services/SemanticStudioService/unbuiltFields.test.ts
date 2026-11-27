import {
    DimensionType,
    type Explore,
    type WarehouseCatalog,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { dropAlreadyMissing, findFieldsWithoutColumns } from './unbuiltFields';

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

const isLive = () => false;
const idsOf = (fields: { fieldId: string }[]) =>
    fields.map(({ fieldId }) => fieldId);

describe('findFieldsWithoutColumns', () => {
    it('finds fields that read a column the built table lacks, and the fields defined on them', () => {
        const payments = explore(
            'payments',
            [
                field('payments', 'amount', '${TABLE}.amount'),
                field('payments', 'city', '${TABLE}.address.city'),
                field('payments', 'usage_channel', '${TABLE}.usage_channel'),
                field('payments', 'channel_group', 'upper(${usage_channel})'),
            ],
            [
                field('payments', 'total', 'sum(${TABLE}.amount)'),
                field('payments', 'channels', '${payments.channel_group}'),
            ],
        );
        expect(
            idsOf(findFieldsWithoutColumns([payments], catalog, isLive)),
        ).toEqual([
            'payments_usage_channel',
            'payments_channel_group',
            'payments_channels',
        ]);
    });

    it('takes every field of a new model with no table, and says nothing about a published model the catalog does not know', () => {
        const refunds = explore('refunds', [
            field('refunds', 'id', '${TABLE}.id'),
        ]);
        expect(
            findFieldsWithoutColumns([refunds], catalog, () => true),
        ).toEqual([
            {
                explore: 'refunds',
                model: 'refunds',
                fieldId: 'refunds_id',
                label: 'id',
            },
        ]);
        expect(findFieldsWithoutColumns([refunds], catalog, isLive)).toEqual(
            [],
        );
    });
});

describe('dropAlreadyMissing', () => {
    it('leaves out a field that already lacks its column in what is published', () => {
        const legacy = field('payments', 'legacy', '${TABLE}.legacy');
        const published = explore('payments', [legacy]);
        const draft = explore('payments', [
            legacy,
            field('payments', 'usage_channel', '${TABLE}.usage_channel'),
        ]);
        expect(
            dropAlreadyMissing(
                findFieldsWithoutColumns([draft], catalog, isLive),
                findFieldsWithoutColumns([published], catalog, isLive),
            ),
        ).toEqual([
            {
                model: 'payments',
                fieldId: 'payments_usage_channel',
                label: 'usage_channel',
            },
        ]);
    });
});
