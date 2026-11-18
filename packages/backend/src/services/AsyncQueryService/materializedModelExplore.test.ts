import { DuckDBInstance } from '@duckdb/node-api';
import {
    compileLightdashModels,
    DEFAULT_SPOTLIGHT_CONFIG,
    FilterOperator,
    isExploreError,
    parseModelDocument,
    SupportedDbtAdapter,
    WarehouseTypes,
    WeekDay,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QueryComposer } from '../../utils/QueryBuilder/QueryComposer';
import {
    compileMaterializedModelExplore,
    MATERIALIZED_MODEL_RELATION,
} from './materializedModelExplore';

const source = `SELECT g.category, i.amount, row_number() OVER (PARTITION BY i.group_id ORDER BY i.id) AS ordinal
FROM raw.items i JOIN raw.groups g ON g.id = i.group_id`;
const content = `type: model
name: ranked_items
materialize: { max_rows: 100 }
sql_filter: \${TABLE}.amount > 0
sql_from: |
  (${source.replaceAll('\n', '\n  ')})
dimensions:
  - { name: category, type: string, sql: '\${TABLE}.category' }
  - { name: amount, type: number, sql: '\${TABLE}.amount', metrics: { total: { type: sum } } }
  - { name: ordinal, type: number, sql: '\${TABLE}.ordinal' }
`;

const sourceExplore = async () => {
    const [explore] = await compileLightdashModels({
        models: [parseModelDocument(content, 'models/ranked_items.yml')],
        warehouseSqlBuilder: warehouseSqlBuilderFromType(
            WarehouseTypes.POSTGRES,
            WeekDay.SUNDAY,
        ),
        lightdashProjectConfig: { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
    });
    if (isExploreError(explore))
        throw new Error('Source explore did not compile');
    return explore;
};

describe('materialized explore compilation', () => {
    it('serves a grouped sum filtered on a window column from a Parquet copy', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'materialized-explore-'));
        const parquet = join(dir, 'copy.parquet').replaceAll("'", "''");
        const instance = await DuckDBInstance.create(':memory:');
        const db = await instance.connect();
        try {
            await db.run(
                "CREATE SCHEMA raw; CREATE TABLE raw.items AS SELECT * FROM (VALUES (1,1,10),(2,1,70),(3,2,20),(4,3,30),(5,4,-99)) x(id,group_id,amount); CREATE TABLE raw.groups AS SELECT * FROM (VALUES (1,'A'),(2,'A'),(3,'B'),(4,'C')) g(id,category)",
            );
            await db.run(`COPY (${source}) TO '${parquet}' (FORMAT PARQUET)`);
            await db.run('DROP SCHEMA raw CASCADE');
            const live = await sourceExplore();
            const ctx = await compileMaterializedModelExplore({
                content,
                explore: live,
                startOfWeek: WeekDay.SUNDAY,
            });
            expect(ctx.explore.targetDatabase).toBe(SupportedDbtAdapter.DUCKDB);
            expect(ctx.warehouseSqlBuilder.getStartOfWeek()).toBe(
                WeekDay.SUNDAY,
            );
            const query = new QueryComposer(
                {
                    metricQuery: {
                        exploreName: live.name,
                        metrics: ['ranked_items_total'],
                        dimensions: ['ranked_items_category'],
                        filters: {
                            dimensions: {
                                id: 'root',
                                and: [
                                    {
                                        id: 'first',
                                        target: {
                                            fieldId: 'ranked_items_ordinal',
                                        },
                                        operator: FilterOperator.EQUALS,
                                        values: [1],
                                    },
                                ],
                            },
                        },
                        sorts: [
                            {
                                fieldId: 'ranked_items_category',
                                descending: false,
                            },
                        ],
                        limit: 100,
                        tableCalculations: [],
                    },
                },
                ctx,
            ).getSql({ columnLimit: 100 });
            expect(query).not.toContain('raw.items');
            const rows = (
                await db.runAndReadAll(
                    `WITH ${MATERIALIZED_MODEL_RELATION} AS (SELECT * FROM read_parquet('${parquet}')) ${query}`,
                )
            ).getRowObjects();
            expect(rows).toEqual([
                { ranked_items_category: 'A', ranked_items_total: 30n },
                { ranked_items_category: 'B', ranked_items_total: 30n },
            ]);
        } finally {
            db.closeSync();
            instance.closeSync();
            await rm(dir, { recursive: true, force: true });
        }
    });
    it('preserves the visible fields', async () => {
        const explore = await sourceExplore();
        delete explore.tables[explore.baseTable].dimensions.amount;
        const variant = await compileMaterializedModelExplore({
            content,
            explore,
            startOfWeek: null,
        });
        expect(
            variant.explore.tables[explore.baseTable].dimensions,
        ).not.toHaveProperty('amount');
        expect(variant.explore.baseTable).toEqual(explore.baseTable);
    });
    it('rejects a warehouse-specific field expression', async () => {
        const explore = await sourceExplore();
        await expect(
            compileMaterializedModelExplore({
                content: content.replace(
                    '${TABLE}.amount',
                    'round(${TABLE}.amount::numeric, 2)',
                ),
                explore,
                startOfWeek: null,
            }),
        ).rejects.toThrow('unsupported materialized field');
    });
});
