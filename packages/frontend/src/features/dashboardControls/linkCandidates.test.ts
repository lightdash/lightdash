import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getLinkCandidates } from './linkCandidates';

const dim = (
    table: string,
    name: string,
    type: DimensionType,
): FilterableDimension =>
    ({
        fieldType: FieldType.DIMENSION,
        type,
        name,
        label: name,
        table,
        tableLabel: table,
        sql: '',
        hidden: false,
    }) as FilterableDimension;

const ordersDate = dim('orders', 'created', DimensionType.DATE);
const ordersStatus = dim('orders', 'status', DimensionType.STRING);
const paymentsDate = dim('payments', 'paid_at', DimensionType.DATE);
const paymentsShipped = dim('payments', 'shipped_at', DimensionType.DATE);
const paymentsMethod = dim('payments', 'method', DimensionType.STRING);
const paymentsRefunded = dim(
    'payments',
    'refunded_at',
    DimensionType.TIMESTAMP,
);

const fieldsMap = { orders_created: ordersDate, orders_status: ordersStatus };

const tile = {
    uuid: 'tile-1',
    type: DashboardTileTypes.SAVED_CHART,
} as DashboardTile;

const rule = (
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule =>
    ({
        id: 'rule-1',
        target: { fieldId: 'orders_created', tableName: 'orders' },
        operator: 'equals',
        values: [],
        ...overrides,
    }) as DashboardFilterRule;

describe('getLinkCandidates', () => {
    it('returns nothing for a tile that is not filterable', () => {
        expect(getLinkCandidates(rule(), tile, [tile], {}, fieldsMap)).toEqual(
            [],
        );
    });

    it('returns nothing when the tile offers the target field', () => {
        const fieldsByTile = { 'tile-1': [ordersDate, paymentsDate] };
        expect(
            getLinkCandidates(rule(), tile, [tile], fieldsByTile, fieldsMap),
        ).toEqual([]);
    });

    it('returns nothing once the tile is already decided', () => {
        const fieldsByTile = { 'tile-1': [paymentsDate] };
        const decided = rule({ tileTargets: { 'tile-1': false } });
        expect(
            getLinkCandidates(decided, tile, [tile], fieldsByTile, fieldsMap),
        ).toEqual([]);
    });

    it('prefers the peer fields the tile offers', () => {
        const fieldsByTile = { 'tile-1': [paymentsShipped, paymentsDate] };
        const withPeer = rule({
            tileTargets: {
                'tile-2': {
                    fieldId: 'payments_paid_at',
                    tableName: 'payments',
                },
            },
        });
        const peerTile = { ...tile, uuid: 'tile-2' };
        expect(
            getLinkCandidates(
                withPeer,
                tile,
                [tile, peerTile],
                fieldsByTile,
                fieldsMap,
            ),
        ).toEqual([{ fieldId: 'payments_paid_at', tableName: 'payments' }]);
    });

    it('falls back to fields of exactly the same type in tile order', () => {
        const fieldsByTile = {
            'tile-1': [
                paymentsMethod,
                paymentsRefunded,
                paymentsShipped,
                paymentsDate,
            ],
        };
        expect(
            getLinkCandidates(rule(), tile, [tile], fieldsByTile, fieldsMap),
        ).toEqual([
            { fieldId: 'payments_shipped_at', tableName: 'payments' },
            { fieldId: 'payments_paid_at', tableName: 'payments' },
        ]);
    });

    it('offers a date filter no timestamp field', () => {
        const fieldsByTile = { 'tile-1': [paymentsRefunded] };
        expect(
            getLinkCandidates(rule(), tile, [tile], fieldsByTile, fieldsMap),
        ).toEqual([]);
    });

    it('returns nothing when the target field is unknown', () => {
        const fieldsByTile = { 'tile-1': [paymentsDate] };
        expect(
            getLinkCandidates(rule(), tile, [tile], fieldsByTile, {}),
        ).toEqual([]);
    });

    it('does not count a peer left behind by a tile that is gone', () => {
        const fieldsByTile = { 'tile-1': [paymentsShipped, paymentsDate] };
        const withStalePeer = rule({
            tileTargets: {
                'tile-gone': {
                    fieldId: 'payments_paid_at',
                    tableName: 'payments',
                },
            },
        });
        // Not narrowed to the stale peer: every field of the type is offered
        expect(
            getLinkCandidates(
                withStalePeer,
                tile,
                [tile],
                fieldsByTile,
                fieldsMap,
            ),
        ).toHaveLength(2);
    });

    it('never prompts for a SQL column filter, even when its name is a field id', () => {
        const fieldsByTile = { 'tile-1': [paymentsDate] };
        const sqlColumnRule = rule({
            target: {
                fieldId: 'orders_created',
                tableName: 'sql_chart',
                isSqlColumn: true,
            },
        });
        expect(
            getLinkCandidates(
                sqlColumnRule,
                tile,
                [tile],
                fieldsByTile,
                fieldsMap,
            ),
        ).toEqual([]);
    });
});
