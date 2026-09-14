import {
    ContentReviewContentType,
    type ChartSimilarityContext,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { ContentReviewRequestModel } from '../ContentReviewRequestModel';

describe('content similarity (PostgreSQL)', () => {
    let database: Knex;
    let tx: Knex.Transaction;
    let model: ContentReviewRequestModel;
    const projectUuid = randomUUID();
    const sharedSpace = randomUUID();
    const privateSpace = randomUUID();
    const personalSpace = randomUUID();
    const deletedSpace = randomUUID();
    const otherProjectSpace = randomUUID();
    const sources = [
        {
            table: 'saved_queries',
            uuid: 'saved_query_uuid',
            type: ContentReviewContentType.CHART,
        },
        {
            table: 'saved_sql',
            uuid: 'saved_sql_uuid',
            type: ContentReviewContentType.SQL_CHART,
        },
        {
            table: 'dashboards',
            uuid: 'dashboard_uuid',
            type: ContentReviewContentType.DASHBOARD,
        },
    ];
    const add = async (
        name: string,
        options: {
            space?: string;
            type?: ContentReviewContentType;
            deleted?: boolean;
        } = {},
    ) => {
        const source = sources.find(
            (s) => s.type === (options.type ?? ContentReviewContentType.CHART),
        )!;
        const space = options.space ?? sharedSpace;
        const row = await tx('spaces')
            .where('space_uuid', space)
            .first<{ space_id: number }>();
        const uuid = randomUUID();
        await tx(source.table).insert({
            [source.uuid]: uuid,
            name,
            slug: uuid,
            space_id: row!.space_id,
            space_uuid: space,
            deleted_at: options.deleted ? new Date() : null,
        });
        return uuid;
    };
    beforeAll(() => {
        if (!process.env.PGDATABASE && !process.env.PGCONNECTIONURI)
            throw new Error(
                'Set PGCONNECTIONURI or PG connection variables for PostgreSQL tests',
            );
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
        await tx.raw(
            'CREATE TEMP TABLE projects (project_id int, project_uuid uuid) ON COMMIT DROP',
        );
        await tx.raw(
            'CREATE TEMP TABLE spaces (space_id int, space_uuid uuid, project_id int, name text, is_default_user_space boolean, deleted_at timestamptz) ON COMMIT DROP',
        );
        await Promise.all(
            sources.map((source) =>
                tx.raw(
                    'CREATE TEMP TABLE ?? (?? uuid, name text, slug text, space_id int, space_uuid uuid, owner_uuid uuid, deleted_at timestamptz) ON COMMIT DROP',
                    [source.table, source.uuid],
                ),
            ),
        );
        await tx.raw(
            'ALTER TABLE saved_queries RENAME COLUMN owner_uuid TO dashboard_uuid',
        );
        await tx.raw(
            'ALTER TABLE saved_sql RENAME COLUMN owner_uuid TO dashboard_uuid',
        );
        await tx.raw(
            'ALTER TABLE saved_queries ADD COLUMN saved_query_id serial',
        );
        await tx.raw(
            'CREATE TEMP TABLE saved_queries_versions (saved_queries_version_id serial, saved_query_id int, explore_name text, created_at timestamptz DEFAULT now()) ON COMMIT DROP',
        );
        await tx.raw(
            'CREATE TEMP TABLE saved_queries_version_fields (saved_queries_version_id int, name text, field_type text) ON COMMIT DROP',
        );
        await tx<{ project_id: number; project_uuid: string }>(
            'projects',
        ).insert([
            { project_id: 1, project_uuid: projectUuid },
            { project_id: 2, project_uuid: randomUUID() },
        ]);
        await tx<{
            space_id: number;
            space_uuid: string;
            project_id: number;
            name: string;
            is_default_user_space: boolean;
            deleted_at: Date | null;
        }>('spaces').insert(
            [
                sharedSpace,
                privateSpace,
                personalSpace,
                deletedSpace,
                otherProjectSpace,
            ].map((uuid, i) => ({
                space_id: i + 1,
                space_uuid: uuid,
                project_id: uuid === otherProjectSpace ? 2 : 1,
                name: 'Space',
                is_default_user_space: uuid === personalSpace,
                deleted_at: uuid === deletedSpace ? new Date() : null,
            })),
        );
        model = new ContentReviewRequestModel({ database: tx });
    });
    afterEach(async () => {
        await tx?.rollback();
    });
    afterAll(async () => {
        await database?.destroy();
    });

    describe('AI shortlist retrieval', () => {
        const chart: ChartSimilarityContext = {
            metricQuery: {
                exploreName: 'orders',
                metrics: ['orders_revenue'],
                dimensions: ['orders_month'],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
            },
        };
        const addVersion = async (
            uuid: string,
            metrics = ['orders_revenue'],
            dimensions: string[] = [],
        ) => {
            const row = await tx('saved_queries')
                .where('saved_query_uuid', uuid)
                .first();
            const [version] = await tx<{
                saved_query_id: number;
                saved_queries_version_id?: number;
                explore_name: string;
            }>('saved_queries_versions')
                .insert({
                    saved_query_id: row!.saved_query_id,
                    explore_name: 'orders',
                })
                .returning('saved_queries_version_id');
            const fields = [
                ...metrics.map((name) => ({ name, field_type: 'metric' })),
                ...dimensions.map((name) => ({
                    name,
                    field_type: 'dimension',
                })),
            ];
            if (fields.length > 0)
                await tx<{
                    saved_queries_version_id: number;
                    name: string;
                    field_type: string;
                }>('saved_queries_version_fields').insert(
                    fields.map((field) => ({
                        ...field,
                        saved_queries_version_id:
                            version.saved_queries_version_id!,
                    })),
                );
        };
        const shortlist = (
            name = 'Revenue report',
            excludeContentUuid: string | null = null,
        ) =>
            model.findChartSimilarityCandidates({
                projectUuid,
                name,
                chart,
                excludeContentUuid,
                accessibleSpaceUuids: [sharedSpace],
            });

        it('retrieves renamed charts through fields without a name similarity score', async () => {
            const uuid = await add('Executive overview');
            await addVersion(uuid);
            expect(await shortlist()).toEqual([
                expect.objectContaining({ uuid }),
            ]);
            expect((await shortlist())[0]).not.toHaveProperty('score');
        });
        it('uses name tokens to retrieve charts with different fields', async () => {
            const uuid = await add('Revenue breakdown');
            await addVersion(uuid, ['orders_count']);
            expect(await shortlist()).toEqual([
                expect.objectContaining({ uuid }),
            ]);
        });
        it('matches dimensions with the correct field type', async () => {
            const good = await add('Timeline');
            await addVersion(good, [], ['orders_month']);
            const wrongType = await add('Different question');
            await addVersion(wrongType, ['orders_month']);
            expect((await shortlist()).map((c) => c.uuid)).toEqual([good]);
        });
        it('finds dashboard-owned charts and excludes deleted owners', async () => {
            const owner = await add('Overview', {
                type: ContentReviewContentType.DASHBOARD,
            });
            const uuid = await add('Revenue');
            await addVersion(uuid);
            await tx('saved_queries')
                .where('saved_query_uuid', uuid)
                .update({ space_id: null, dashboard_uuid: owner });
            expect((await shortlist()).map((c) => c.uuid)).toEqual([uuid]);
            await tx('dashboards')
                .where('dashboard_uuid', owner)
                .update({ deleted_at: new Date() });
            expect(await shortlist()).toEqual([]);
        });
        it('keeps time-grain words available to the AI shortlist', async () => {
            const uuid = await add('Monthly report');
            await addVersion(uuid, ['customers_count']);
            expect((await shortlist('Monthly')).map((c) => c.uuid)).toEqual([
                uuid,
            ]);
        });
        it('tokenizes Unicode names without an English stop-word list', async () => {
            const uuid = await add('売上 月次');
            await addVersion(uuid, ['customers_count']);
            expect((await shortlist('月次')).map((c) => c.uuid)).toEqual([
                uuid,
            ]);
        });
        it('preserves the twelve field matches when name-only matches crowd the search', async () => {
            const matching = await Promise.all(
                Array.from({ length: 12 }, async () => {
                    const uuid = await add('Executive overview');
                    await addVersion(uuid);
                    return uuid;
                }),
            );
            await Promise.all(
                Array.from({ length: 15 }, async () =>
                    addVersion(await add('Revenue'), ['customers_count']),
                ),
            );
            expect((await shortlist()).map((c) => c.uuid).sort()).toEqual(
                matching.sort(),
            );
        });
        it('ignores historical versions and resolves ties by version ID', async () => {
            const uuid = await add('Executive overview');
            await addVersion(uuid);
            await addVersion(uuid, ['customers_count']);
            expect(await shortlist()).toEqual([]);
        });
        it.each([privateSpace, personalSpace, deletedSpace, otherProjectSpace])(
            'excludes unauthorized/personal/deleted/cross-project space %s',
            async (space) => {
                const uuid = await add('Revenue', { space });
                await addVersion(uuid);
                expect(await shortlist()).toEqual([]);
            },
        );
        it('excludes self and deleted charts', async () => {
            const self = await add('Revenue');
            await addVersion(self);
            const deleted = await add('Revenue', { deleted: true });
            await addVersion(deleted);
            expect(await shortlist('Revenue', self)).toEqual([]);
        });
        it('applies permission scope before the twelve-candidate cap', async () => {
            await Promise.all(
                Array.from({ length: 15 }, async () =>
                    addVersion(await add('Revenue', { space: privateSpace })),
                ),
            );
            const uuid = await add('Different title');
            await addVersion(uuid);
            expect((await shortlist()).map((c) => c.uuid)).toEqual([uuid]);
            await Promise.all(
                Array.from({ length: 15 }, async () =>
                    addVersion(await add('Revenue')),
                ),
            );
            expect(await shortlist()).toHaveLength(12);
        });
        it('treats regex and SQL syntax as data', async () => {
            const uuid = await add('Executive overview');
            await addVersion(uuid);
            expect(
                (await shortlist(".*') OR true; --")).map((c) => c.uuid),
            ).toEqual([uuid]);
        });
        it('returns nothing without accessible spaces', async () => {
            await addVersion(await add('Revenue'));
            expect(
                await model.findChartSimilarityCandidates({
                    projectUuid,
                    name: 'Revenue',
                    chart,
                    excludeContentUuid: null,
                    accessibleSpaceUuids: [],
                }),
            ).toEqual([]);
        });
    });
});
