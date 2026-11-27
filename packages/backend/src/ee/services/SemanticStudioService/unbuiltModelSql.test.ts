import {
    type DbtManifest,
    type DbtNode,
    type Explore,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import {
    findUnbuiltModels,
    readUnbuiltModelsFromSql,
    renderDraftSqlFrom,
    withDraftSqlFrom,
    type SqlModel,
} from './unbuiltModelSql';

const model = (
    name: string,
    rawCode: string,
    parents: string[] = [],
    materialized = 'table',
): SqlModel => ({
    unique_id: `model.shop.${name}`,
    resource_type: 'model',
    config: { materialized, snowflake_warehouse: '' },
    raw_code: rawCode,
    relation_name: materialized === 'ephemeral' ? null : `"db"."s"."${name}"`,
    fqn: ['shop', name],
    depends_on: { nodes: parents.map((parent) => `model.shop.${parent}`) },
});

const manifest = (nodes: DbtNode[]): DbtManifest =>
    ({
        nodes: Object.fromEntries(nodes.map((node) => [node.unique_id, node])),
        metadata: {},
    }) as DbtManifest;

const explore = (name: string, sqlTable: string): Explore =>
    ({
        name,
        baseTable: name,
        tables: { [name]: { name, sqlTable } },
    }) as Explore;

const live = manifest([
    model('stg_usage', 'select a'),
    model('int_cost', 'select a from stg', ['stg_usage']),
    model('usage', 'select a from int', ['int_cost']),
    model('orders', 'select 1'),
]);
const branch = manifest([
    model('stg_usage', 'select a, channel'),
    model('int_cost', 'select a from stg', ['stg_usage']),
    model('usage', 'select a from int', ['int_cost']),
    model('orders', 'select 1'),
]);
const compiled = new Map([
    ['model.shop.stg_usage', 'select a, channel from raw;'],
    ['model.shop.int_cost', 'select * from "db"."s"."stg_usage"'],
    ['model.shop.usage', 'select * from "db"."s"."int_cost"'],
]);

describe('findUnbuiltModels', () => {
    it('finds the models with new SQL and everything built from them', () => {
        expect([...findUnbuiltModels(live, branch)].sort()).toEqual([
            'model.shop.int_cost',
            'model.shop.stg_usage',
            'model.shop.usage',
        ]);
        expect(findUnbuiltModels(live, live).size).toBe(0);
    });
});

describe('readUnbuiltModelsFromSql', () => {
    const explores = [
        explore('usage', '"db"."s"."usage"'),
        explore('orders', '"db"."s"."orders"'),
    ];

    it('reads a model built from changed SQL from that SQL, and leaves the rest on their tables', async () => {
        const compileModelSql = vi.fn(async () => compiled);
        const result = await readUnbuiltModelsFromSql(live, {
            explores,
            manifest: branch,
            compileModelSql,
        });
        expect(compileModelSql).toHaveBeenCalledWith([
            'shop.stg_usage',
            'shop.int_cost',
            'shop.usage',
        ]);
        expect(result.rendered).toBe(1);
        const [usage, orders] = result.explores as Explore[];
        expect(orders.tables.orders.sqlTable).toBe('"db"."s"."orders"');
        expect(usage.tables.usage.sqlTable).toBe(
            [
                '(',
                'WITH __draft__model_shop_stg_usage AS (',
                'select a, channel from raw',
                '),',
                '__draft__model_shop_int_cost AS (',
                'select * from __draft__model_shop_stg_usage',
                '),',
                '__draft__model_shop_usage AS (',
                'select * from __draft__model_shop_int_cost',
                ')',
                'SELECT * FROM __draft__model_shop_usage',
                ')',
            ].join('\n'),
        );
    });

    it('runs no dbt when the branch changes no SQL', async () => {
        const compileModelSql = vi.fn(async () => compiled);
        const result = await readUnbuiltModelsFromSql(live, {
            explores,
            manifest: live,
            compileModelSql,
        });
        expect(compileModelSql).not.toHaveBeenCalled();
        expect(result.explores).toBe(explores);
    });

    it('leaves a model on its table when dbt rendered no SQL for part of it', async () => {
        const result = await readUnbuiltModelsFromSql(live, {
            explores,
            manifest: branch,
            compileModelSql: async () =>
                new Map([['model.shop.usage', 'select 1']]),
        });
        expect(result.explores).toBe(explores);
    });
});

describe('renderDraftSqlFrom', () => {
    it('skips an ephemeral model, which dbt renders inside its readers', () => {
        const nodes = [
            model('eph', 'select 1', [], 'ephemeral'),
            model('usage', 'select * from eph', ['eph']),
        ];
        expect(
            renderDraftSqlFrom(
                nodes,
                new Map([
                    ['model.shop.usage', 'with e as (select 1) select *'],
                ]),
            ),
        ).toBe(
            '(\nWITH __draft__model_shop_usage AS (\nwith e as (select 1) select *\n)\nSELECT * FROM __draft__model_shop_usage\n)',
        );
    });
});

describe('withDraftSqlFrom', () => {
    it('gives a preview explore the SQL its branch compile renders, and nothing else', async () => {
        const { explores } = await readUnbuiltModelsFromSql(live, {
            explores: [explore('usage', '"db"."s"."usage"')],
            manifest: branch,
            compileModelSql: async () => compiled,
        });
        const [draft] = explores as Explore[];
        const preview = explore('usage', '"db"."preview"."usage"');
        expect(
            (withDraftSqlFrom(preview, draft) as Explore).tables.usage.sqlTable,
        ).toBe(draft.tables.usage.sqlTable);
        expect(withDraftSqlFrom(preview, preview)).toBe(preview);
        expect(withDraftSqlFrom(preview, undefined)).toBe(preview);
    });
});
