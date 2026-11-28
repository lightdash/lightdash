import {
    ChartKind,
    ChartType,
    SearchItemType,
    type SearchFilters,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { ContentVerificationModel } from '../../../models/ContentVerificationModel';
import { SearchModel } from '../../../models/SearchModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261127200000_add_composer_chart_search_vector';
import { createFixture, type Fixture } from './composerChartFixture.mock';

describe('composer chart search on the real schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let fixture: Fixture;
    let otherProject: Fixture;
    let trx: Knex.Transaction;
    let model: SearchModel;

    const insertChart = async ({
        name = 'Revenue trend',
        description = 'Weekly forecast',
        owner = 'space',
        createdAt = new Date('2025-01-15T12:00:00Z'),
        createdByUserUuid = fixture.userUuid as string | null,
        project = fixture,
    }: {
        name?: string;
        description?: string;
        owner?: 'space' | 'dashboard';
        createdAt?: Date;
        createdByUserUuid?: string | null;
        project?: Fixture;
    } = {}) => {
        const space = await trx('spaces')
            .where('space_uuid', project.spaceUuid)
            .first('space_id');
        const dashboardUuid =
            owner === 'dashboard' && space
                ? (
                      await trx('dashboards')
                          .insert({
                              project_uuid: project.projectUuid,
                              name: 'Composer dashboard',
                              space_id: space.space_id,
                              slug: `composer-dashboard-${randomUUID()}`,
                          })
                          .returning('dashboard_uuid')
                  )[0].dashboard_uuid
                : null;
        const [{ composer_chart_uuid: uuid }] = await trx('composer_charts')
            .insert({
                project_uuid: project.projectUuid,
                dashboard_uuid: dashboardUuid,
                space_uuid: dashboardUuid ? null : project.spaceUuid,
                name,
                description,
                slug: `composer-${randomUUID()}`,
                created_at: createdAt,
                created_by_user_uuid: createdByUserUuid,
            })
            .returning('composer_chart_uuid');
        return uuid as string;
    };

    const addVersion = (
        composerChartUuid: string,
        type: ChartType,
        createdAt: Date,
        config: object = {},
    ) =>
        trx('composer_chart_versions').insert({
            composer_chart_uuid: composerChartUuid,
            created_by_user_uuid: fixture.userUuid,
            created_at: createdAt,
            pipeline: JSON.stringify({}),
            chart: JSON.stringify({ chartConfig: { type, config } }),
        });

    const matches = async (uuid: string, tsquery: string) => {
        const { rows } = await trx.raw<{ rows: { matches: boolean }[] }>(
            `SELECT search_vector @@ to_tsquery('lightdash_english_config', ?) AS matches
            FROM composer_charts WHERE composer_chart_uuid = ?`,
            [tsquery, uuid],
        );
        return rows[0]?.matches;
    };

    const search = (query: string, filters?: SearchFilters) =>
        model.searchComposerCharts(fixture.projectUuid, query, filters);

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        fixture = await createFixture(database);
        otherProject = await createFixture(database);
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    beforeEach(async () => {
        trx = await database.transaction();
        model = new SearchModel({
            database: trx,
            contentVerificationModel: new ContentVerificationModel({
                database: trx,
            }),
        });
    });

    afterEach(async () => {
        await trx.rollback();
    });

    it('weights the name over the description', async () => {
        const uuid = await insertChart({
            name: 'Revenue',
            description: 'Forecast',
        });
        expect(await matches(uuid, 'revenue:A')).toBe(true);
        expect(await matches(uuid, 'forecast:B')).toBe(true);
        expect(await matches(uuid, 'forecast:A')).toBe(false);
    });

    it('down drops the column and its index, up restores them', async () => {
        const hasIndex = async () =>
            (
                await trx.raw(
                    `SELECT 1 FROM pg_indexes WHERE indexname = 'composer_charts_search_vector_idx'`,
                )
            ).rows.length === 1;
        await down(trx);
        expect(
            await trx.schema.hasColumn('composer_charts', 'search_vector'),
        ).toBe(false);
        expect(await hasIndex()).toBe(false);
        await up(trx);
        expect(
            await trx.schema.hasColumn('composer_charts', 'search_vector'),
        ).toBe(true);
        expect(await hasIndex()).toBe(true);
    });

    it('finds a space-owned chart by name and description, with the latest version kind, and follows a rename', async () => {
        const uuid = await insertChart();
        await addVersion(uuid, ChartType.PIE, new Date('2025-01-17T00:00:00Z'));
        await addVersion(
            uuid,
            ChartType.TABLE,
            new Date('2025-01-16T00:00:00Z'),
        );
        const expected = [
            {
                uuid,
                slug: expect.any(String),
                name: 'Revenue trend',
                description: 'Weekly forecast',
                projectUuid: fixture.projectUuid,
                spaceUuid: fixture.spaceUuid,
                chartType: ChartKind.PIE,
                createdBy: {
                    firstName: 'Composer',
                    lastName: 'Tiles',
                    userUuid: fixture.userUuid,
                },
                search_rank: expect.any(Number),
            },
        ];
        expect(await search('revenue')).toEqual(expected);
        expect(await search('forecast')).toEqual(expected);
        await trx('composer_charts')
            .where('composer_chart_uuid', uuid)
            .update({ name: 'Retention' });
        expect(await search('revenue')).toEqual([]);
    });

    it('ranks a name match above a description match; an unreadable kind is null', async () => {
        const inDescription = await insertChart({
            name: 'Weekly numbers',
            description: 'Revenue',
        });
        const inName = await insertChart({
            name: 'Revenue',
            description: 'Weekly numbers',
        });
        await addVersion(
            inName,
            ChartType.CARTESIAN,
            new Date('2025-01-17T00:00:00Z'),
            { layout: {}, eChartsConfig: null },
        );
        const results = await search('revenue');
        expect(results.map(({ uuid }) => uuid)).toEqual([
            inName,
            inDescription,
        ]);
        expect(results.map(({ chartType }) => chartType)).toEqual([null, null]);
    });

    it('skips dashboard-owned, soft-deleted, other-project charts and deleted spaces', async () => {
        const uuid = await insertChart();
        await insertChart({ owner: 'dashboard' });
        await insertChart({ project: otherProject });
        const deleted = await insertChart();
        await trx('composer_charts')
            .where('composer_chart_uuid', deleted)
            .update({ deleted_at: new Date() });
        expect(await search('revenue')).toEqual([
            expect.objectContaining({ uuid }),
        ]);
        await trx('spaces')
            .where('space_uuid', fixture.spaceUuid)
            .update({ deleted_at: new Date(), deleted_by_user_uuid: null });
        expect(await search('revenue')).toEqual([]);
    });

    it('applies type, verified, creator and inclusive date filters', async () => {
        const uuid = await insertChart();
        await insertChart({ createdByUserUuid: null });
        await insertChart({ createdAt: new Date('2025-01-16T00:00:00Z') });
        await insertChart({ createdAt: new Date('2025-01-14T23:59:59Z') });
        expect(
            await search('revenue', {
                createdByUuid: fixture.userUuid,
                fromDate: '2025-01-15',
                toDate: '2025-01-15',
            }),
        ).toEqual([expect.objectContaining({ uuid })]);
        expect(
            await search('revenue', { type: SearchItemType.CHART }),
        ).toHaveLength(4);
        expect(
            await search('revenue', { type: SearchItemType.COMPOSER_CHART }),
        ).toHaveLength(4);
        expect(
            await search('revenue', { type: SearchItemType.SQL_CHART }),
        ).toEqual([]);
        expect(await search('revenue', { verifiedOnly: true })).toEqual([]);
    });
});
