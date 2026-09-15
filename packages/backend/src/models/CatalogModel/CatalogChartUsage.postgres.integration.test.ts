import { FieldType, type ChartUsageIn } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CatalogModel } from './CatalogModel';

describe('catalog chart usage (PostgreSQL)', () => {
    let database: Knex;
    let tx: Knex.Transaction;
    let model: CatalogModel;
    const projectUuid = randomUUID();
    const exploreUuid = randomUUID();
    const usage = (fieldName: string, chartUsage = 3): ChartUsageIn => ({
        fieldName,
        chartUsage,
        cachedExploreUuid: exploreUuid,
        fieldType: FieldType.METRIC,
    });
    const insert = async (overrides: Record<string, unknown> = {}) => {
        await tx('catalog_search').insert({
            project_uuid: projectUuid,
            cached_explore_uuid: exploreUuid,
            name: 'field',
            field_type: 'metric',
            chart_usage: 0,
            ...overrides,
        });
    };
    beforeAll(() => {
        if (!process.env.PGDATABASE && !process.env.PGCONNECTIONURI) {
            throw new Error(
                'Set PGCONNECTIONURI or PG connection variables for PostgreSQL tests',
            );
        }
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI ?? {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
        });
    });
    beforeEach(async () => {
        tx = await database.transaction();
        await tx.raw(`CREATE TEMP TABLE catalog_search (
            project_uuid uuid, cached_explore_uuid uuid, name text,
            field_type text, chart_usage integer CHECK (chart_usage >= 0)
        ) ON COMMIT DROP`);
        model = new CatalogModel({
            database: tx,
            lightdashConfig: lightdashConfigMock,
        });
    });
    afterEach(async () => {
        await tx?.rollback();
    });
    afterAll(async () => {
        await database?.destroy();
    });

    it('scopes updates by project, Explore and exact field name, preserving field-type behavior', async () => {
        await insert();
        await insert({ field_type: 'dimension' });
        await insert({ project_uuid: randomUUID() });
        await insert({ cached_explore_uuid: randomUUID() });
        await insert({ name: 'different' });
        await model.setChartUsages(projectUuid, [usage('field')]);
        const rows = await tx('catalog_search')
            .select('chart_usage')
            .orderBy('chart_usage');
        expect(rows.map((row) => row.chart_usage)).toEqual([0, 0, 0, 3, 3]);
    });
    it('does nothing for empty input', async () => {
        await insert();
        await model.setChartUsages(projectUuid, []);
        expect((await tx('catalog_search').first())!.chart_usage).toBe(0);
    });
    it('binds unusual names as data', async () => {
        const field = "field'); DROP TABLE catalog_search; --";
        await insert({ name: field });
        await insert();
        await model.setChartUsages(projectUuid, [usage(field, 7)]);
        expect(
            (await tx('catalog_search').where('name', field).first())!
                .chart_usage,
        ).toBe(7);
        expect(
            (await tx('catalog_search').where('name', 'field').first())!
                .chart_usage,
        ).toBe(0);
    });
    it('uses bounded batches and the last duplicate value across a batch boundary', async () => {
        const usages = Array.from({ length: 501 }, (_, index) =>
            usage(`field-${index}`, index),
        );
        await tx.raw(
            `INSERT INTO catalog_search
            SELECT ?::uuid, ?::uuid, 'field-' || i, 'metric', 0 FROM generate_series(0, 500) i`,
            [projectUuid, exploreUuid],
        );
        const updates: string[] = [];
        const onQuery = ({ sql }: { sql: string }) => {
            if (sql.startsWith('UPDATE')) updates.push(sql);
        };
        tx.on('query', onQuery);
        try {
            await model.setChartUsages(projectUuid, [
                ...usages,
                usage('field-0', 42),
            ]);
        } finally {
            tx.removeListener('query', onQuery);
        }
        expect(updates).toHaveLength(2);
        const rows = await tx('catalog_search').select('name', 'chart_usage');
        expect(
            Object.fromEntries(rows.map((row) => [row.name, row.chart_usage])),
        ).toEqual(
            Object.fromEntries(
                usages.map((row, index) => [
                    row.fieldName,
                    index === 0 ? 42 : index,
                ]),
            ),
        );
    });
    it('rolls back earlier batches if a later batch fails', async () => {
        const usages = Array.from({ length: 501 }, (_, index) =>
            usage(`field-${index}`, index === 500 ? -1 : 3),
        );
        await tx.raw(
            `INSERT INTO catalog_search
            SELECT ?::uuid, ?::uuid, 'field-' || i, 'metric', 0 FROM generate_series(0, 500) i`,
            [projectUuid, exploreUuid],
        );
        await expect(
            model.setChartUsages(projectUuid, usages),
        ).rejects.toThrow();
        const rows = await tx('catalog_search').whereNot('chart_usage', 0);
        expect(rows).toEqual([]);
    });
});
