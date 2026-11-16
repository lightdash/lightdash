import {
    MergeJoinType,
    SAVED_MERGE_QUERY_SCHEMA_VERSION,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { SavedChartModel } from './SavedChartModel';

type FixtureRow = Record<string, string | number | Date | null>;

describe('SavedChartModel.getInfoForAvailableFilters (PostgreSQL)', () => {
    let database: Knex;
    let model: SavedChartModel;
    const schema = `chart_filters_${randomUUID().replaceAll('-', '')}`;

    const mergeOnto = (explore: string) => ({
        queries: {
            [explore]: {
                explore,
                dimensions: [`${explore}_order_id`],
                metrics: [`${explore}_total`],
            },
        },
        join: MergeJoinType.LEFT,
        keys: { orders_order_id: [`${explore}.${explore}_order_id`] },
        limit: 500,
    });

    beforeAll(async () => {
        if (!process.env.PGDATABASE) {
            throw new Error('Set PG connection variables for PostgreSQL tests');
        }
        database = knex({
            client: 'pg',
            connection: {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
            searchPath: [schema],
            pool: { min: 0, max: 1 },
        });
        await database.schema.createSchema(schema);
        await database.raw(`
            CREATE TABLE organizations (organization_id integer PRIMARY KEY, organization_uuid uuid);
            CREATE TABLE projects (project_id integer PRIMARY KEY, project_uuid uuid, organization_id integer);
            CREATE TABLE spaces (space_id integer PRIMARY KEY, space_uuid uuid, project_id integer, deleted_at timestamptz);
            CREATE TABLE dashboards (dashboard_uuid uuid PRIMARY KEY, space_id integer);
            CREATE TABLE saved_queries (
                saved_query_id serial PRIMARY KEY, saved_query_uuid uuid UNIQUE, project_uuid uuid,
                space_id integer, dashboard_uuid uuid, name text, deleted_at timestamptz
            );
            CREATE TABLE saved_queries_versions (saved_queries_version_id serial PRIMARY KEY, saved_query_id integer, explore_name text);
            CREATE TABLE saved_queries_version_merges (saved_queries_version_id integer PRIMARY KEY, schema_version integer, merge jsonb);
        `);
        await database<FixtureRow>('organizations').insert({
            organization_id: 1,
            organization_uuid: randomUUID(),
        });
        await database<FixtureRow>('projects').insert({
            project_id: 1,
            project_uuid: randomUUID(),
            organization_id: 1,
        });
        await database<FixtureRow>('spaces').insert({
            space_id: 1,
            space_uuid: randomUUID(),
            project_id: 1,
        });
        model = new SavedChartModel({
            database,
            lightdashConfig: lightdashConfigMock,
        });
    });

    afterAll(async () => {
        if (database) {
            await database.schema.dropSchemaIfExists(schema, true);
            await database.destroy();
        }
    });

    const addChart = async (
        versions: { explore: string; merge: unknown }[],
    ): Promise<string> => {
        const uuid = randomUUID();
        const [{ saved_query_id: chartId }] = await database<FixtureRow>(
            'saved_queries',
        )
            .insert({ saved_query_uuid: uuid, space_id: 1, name: uuid })
            .returning(['saved_query_id']);
        // One multi-row insert numbers the versions in order, oldest first
        const versionRows = await database<FixtureRow>('saved_queries_versions')
            .insert(
                versions.map(({ explore }) => ({
                    saved_query_id: chartId,
                    explore_name: explore,
                })),
            )
            .returning(['saved_queries_version_id']);
        const merges = versions.flatMap(({ merge }, index) =>
            merge === null
                ? []
                : [
                      {
                          saved_queries_version_id:
                              versionRows[index].saved_queries_version_id,
                          schema_version: SAVED_MERGE_QUERY_SCHEMA_VERSION,
                          merge: JSON.stringify(merge),
                      },
                  ],
        );
        if (merges.length > 0) {
            await database('saved_queries_version_merges').insert(merges);
        }
        return uuid;
    };

    it('lists the explores of every query a chart merges, from its latest version', async () => {
        const plain = await addChart([{ explore: 'orders', merge: null }]);
        const merged = await addChart([
            { explore: 'orders', merge: null },
            { explore: 'orders', merge: mergeOnto('payments') },
        ]);
        const unmerged = await addChart([
            { explore: 'orders', merge: mergeOnto('payments') },
            { explore: 'orders', merge: null },
        ]);
        const selfMerged = await addChart([
            { explore: 'orders', merge: mergeOnto('orders') },
        ]);
        const unreadable = await addChart([
            { explore: 'orders', merge: { queries: 'not a merge' } },
        ]);

        const charts = await model.getInfoForAvailableFilters([
            plain,
            merged,
            unmerged,
            selfMerged,
            unreadable,
        ]);

        expect(
            Object.fromEntries(
                charts.map(({ uuid, tableName, exploreNames }) => [
                    uuid,
                    { tableName, exploreNames },
                ]),
            ),
        ).toEqual({
            [plain]: { tableName: 'orders', exploreNames: ['orders'] },
            [merged]: {
                tableName: 'orders',
                exploreNames: ['orders', 'payments'],
            },
            [unmerged]: { tableName: 'orders', exploreNames: ['orders'] },
            [selfMerged]: { tableName: 'orders', exploreNames: ['orders'] },
            [unreadable]: { tableName: 'orders', exploreNames: ['orders'] },
        });
    });
});
