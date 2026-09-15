import { ChartType } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { SavedChartModel } from './SavedChartModel';

describe('chart type delete impact (PostgreSQL)', () => {
    let database: Knex;
    let model: SavedChartModel;
    const schema = `chart_type_impact_${randomUUID().replaceAll('-', '')}`;
    const projectUuid = randomUUID();
    const otherProjectUuid = randomUUID();
    const vizUuid = randomUUID();
    const otherVizUuid = randomUUID();
    const dashboardUuid = randomUUID();

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
            CREATE TABLE spaces (space_id integer PRIMARY KEY, deleted_at timestamptz);
            CREATE TABLE dashboards (dashboard_uuid uuid PRIMARY KEY, space_id integer, deleted_at timestamptz);
            CREATE TABLE saved_queries (
                saved_query_id serial PRIMARY KEY, project_uuid uuid,
                space_id integer, dashboard_uuid uuid, deleted_at timestamptz
            );
            CREATE TABLE saved_queries_versions (
                saved_queries_version_id serial PRIMARY KEY, saved_query_id integer,
                created_at timestamptz, chart_type text, chart_config jsonb
            );
        `);
        model = new SavedChartModel({
            database,
            lightdashConfig: lightdashConfigMock,
        });
    });

    beforeEach(async () => {
        await database.raw(
            'TRUNCATE saved_queries_versions, saved_queries, dashboards, spaces',
        );
        await database.raw('INSERT INTO spaces (space_id) VALUES (1)');
        await database.raw(
            'INSERT INTO dashboards (dashboard_uuid, space_id) VALUES (?, 1)',
            [dashboardUuid],
        );
    });

    afterAll(async () => {
        if (database) {
            await database.schema.dropSchemaIfExists(schema, true);
            await database.destroy();
        }
    });

    const addChart = async (inDashboard = false, project = projectUuid) => {
        const result = await database.raw<{
            rows: { saved_query_id: number }[];
        }>(
            'INSERT INTO saved_queries (project_uuid, space_id, dashboard_uuid) VALUES (?, ?, ?) RETURNING saved_query_id',
            [
                project,
                inDashboard ? null : 1,
                inDashboard ? dashboardUuid : null,
            ],
        );
        return result.rows[0].saved_query_id;
    };

    const addVersion = async (
        chartId: number,
        dataAppVizUuid: string | null = vizUuid,
        createdAt = new Date('2026-09-14'),
    ) => {
        await database.raw(
            'INSERT INTO saved_queries_versions (saved_query_id, created_at, chart_type, chart_config) VALUES (?, ?, ?, ?::jsonb)',
            [
                chartId,
                createdAt,
                dataAppVizUuid ? ChartType.DATA_APP_VIZ : ChartType.TABLE,
                JSON.stringify(dataAppVizUuid ? { dataAppVizUuid } : {}),
            ],
        );
    };

    const count = () => model.countChartsUsingDataAppViz(projectUuid, vizUuid);

    it('returns zero when there are no dependents', async () => {
        expect(await count()).toBe(0);
    });

    it('counts both space and dashboard charts once regardless of their version history', async () => {
        const spaceChart = await addChart();
        await addVersion(spaceChart);
        await addVersion(spaceChart);
        await addVersion(await addChart(true));
        expect(await count()).toBe(2);
    });

    it('excludes historical references after a chart switches renderer, including timestamp ties', async () => {
        const chartId = await addChart();
        await addVersion(chartId);
        await addVersion(chartId, null);
        expect(await count()).toBe(0);
    });

    it('orders versions by creation time before the numeric id', async () => {
        const chartId = await addChart();
        await addVersion(chartId);
        await addVersion(chartId, null, new Date('2026-09-13'));
        expect(await count()).toBe(1);
    });

    it('excludes other projects and other chart types', async () => {
        await addVersion(await addChart(false, otherProjectUuid));
        await addVersion(await addChart(), otherVizUuid);
        expect(await count()).toBe(0);
    });

    it.each(['saved_queries', 'dashboards', 'spaces'])(
        'excludes dependents with a deleted %s owner',
        async (table) => {
            await addVersion(await addChart(true));
            await database.raw('UPDATE ?? SET deleted_at = now()', [table]);
            expect(await count()).toBe(0);
        },
    );
});
