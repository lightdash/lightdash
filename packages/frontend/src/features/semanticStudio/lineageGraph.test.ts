import { type CompiledTable, type Explore } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { toJoinGraph } from './joinGraph';
import { relatedModels, toModelLineage, withLineage } from './lineageGraph';

const model = (name: string) => ({ name, type: 'model' as const });

const table = (name: string, extra: Partial<CompiledTable> = {}) =>
    ({
        name,
        label: name.toUpperCase(),
        lineageGraph: {},
        ...extra,
    }) as CompiledTable;

const explore = (
    tables: CompiledTable[],
    joined: string[] = [],
): Pick<Explore, 'baseTable' | 'joinedTables' | 'tables'> => ({
    baseTable: tables[0].name,
    joinedTables: joined.map((name) => ({
        table: name,
        sqlOn: '',
        compiledSqlOn: '',
    })),
    tables: Object.fromEntries(tables.map((t) => [t.name, t])),
});

describe('toModelLineage', () => {
    // raw -> stg_orders -> orders -> orders_summary; campaigns -> touchpoints <- customers
    const orders = table('orders', {
        lineageGraph: {
            orders: [model('stg_orders')],
            stg_orders: [model('raw')],
            raw: [],
            orders_summary: [model('orders')],
        },
    });
    const buyers = table('buyers', {
        originalName: 'customers',
        lineageGraph: {
            customers: [],
            touchpoints: [model('campaigns'), model('customers')],
        },
    });

    it('links each model to the models built from it, up to the explore', () => {
        const { links } = toModelLineage(explore([orders, buyers], ['buyers']));
        expect(links.map(({ id }) => id).sort()).toEqual([
            'raw->stg_orders',
            'stg_orders->orders',
        ]);
    });

    it('keeps the explore and what is upstream of it', () => {
        const { models } = toModelLineage(
            explore([orders, buyers], ['buyers']),
        );
        expect(
            Object.fromEntries(models.map(({ id, role }) => [id, role])),
        ).toEqual({
            orders: 'base',
            customers: 'joined',
            stg_orders: 'upstream',
            raw: 'upstream',
        });
    });

    it('labels models the explore reads with their table label', () => {
        const { models } = toModelLineage(
            explore([orders, buyers], ['buyers']),
        );
        expect(models.find(({ id }) => id === 'customers')?.label).toBe(
            'BUYERS',
        );
        expect(models.find(({ id }) => id === 'raw')?.label).toBeNull();
    });

    it('has no links when the models have no lineage', () => {
        const lineage = toModelLineage(explore([table('events')]));
        expect(lineage.links).toEqual([]);
        expect(lineage.models).toEqual([
            { id: 'events', label: 'EVENTS', role: 'base' },
        ]);
    });
});

describe('relatedModels', () => {
    it('collects everything upstream and downstream, not siblings', () => {
        const links = [
            { id: '1', source: 'raw', target: 'stg' },
            { id: '2', source: 'stg', target: 'orders' },
            { id: '3', source: 'orders', target: 'summary' },
            { id: '4', source: 'stg', target: 'sibling' },
        ];
        expect([...relatedModels(links, 'orders')].sort()).toEqual([
            'orders',
            'raw',
            'stg',
            'summary',
        ]);
    });
});

describe('withLineage', () => {
    // stg_sales -> sales_targets, read twice under two aliases; sales_targets -> report
    const deals = table('deals', {
        lineageGraph: { deals: [model('stg_deals')], stg_deals: [] },
    });
    const segment = table('segment_targets', {
        originalName: 'sales_targets',
        lineageGraph: {
            sales_targets: [model('stg_sales')],
            stg_sales: [],
            report: [model('sales_targets')],
        },
    });
    const industry = table('industry_targets', {
        originalName: 'sales_targets',
        lineageGraph: segment.lineageGraph,
    });
    const source = {
        ...explore([deals, segment, industry], []),
        joinedTables: ['segment_targets', 'industry_targets'].map((name) => ({
            table: name,
            sqlOn: `\${deals.id} = \${${name}.id}`,
            compiledSqlOn: '',
        })),
    };
    const result = withLineage(toJoinGraph(source), toModelLineage(source));

    it('draws only upstream models the explore does not read as cards', () => {
        expect(result.cards.map(({ nodeId }) => nodeId).sort()).toEqual([
            'dbt:stg_deals',
            'dbt:stg_sales',
        ]);
    });

    it('links models to every table that reads them', () => {
        expect(result.links.map(({ id }) => id).sort()).toEqual([
            'lineage:dbt:stg_deals->deals',
            'lineage:dbt:stg_sales->industry_targets',
            'lineage:dbt:stg_sales->segment_targets',
        ]);
    });

    it('relates a table to its upstream models', () => {
        expect([...result.relatedTo('deals')].sort()).toEqual([
            'dbt:stg_deals',
            'deals',
        ]);
    });
});
