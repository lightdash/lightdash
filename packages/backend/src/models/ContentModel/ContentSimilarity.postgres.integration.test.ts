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
            .join('projects', 'projects.project_id', 'spaces.project_id')
            .where('space_uuid', space)
            .first<{ space_id: number; project_uuid: string }>(
                'spaces.space_id',
                'projects.project_uuid',
            );
        const uuid = randomUUID();
        await tx(source.table).insert({
            [source.uuid]: uuid,
            name,
            slug: uuid,
            project_uuid: row!.project_uuid,
            space_id: row!.space_id,
            space_uuid: space,
            deleted_at: options.deleted ? new Date() : null,
        });
        return uuid;
    };
    const find = (
        name: string,
        options: {
            type?: ContentReviewContentType;
            exclude?: string;
            spaces?: string[];
            limit?: number;
        } = {},
    ) =>
        model.findSimilarByName({
            projectUuid,
            name,
            contentType: options.type ?? ContentReviewContentType.CHART,
            excludeContentUuid: options.exclude ?? null,
            accessibleSpaceUuids: options.spaces ?? [sharedSpace],
            limit: options.limit ?? 5,
        });

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
                    'CREATE TEMP TABLE ?? (?? uuid, name text, slug text, project_uuid uuid, space_id int, space_uuid uuid, owner_uuid uuid, deleted_at timestamptz) ON COMMIT DROP',
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
        it('uses the chart space before its owner space', async () => {
            const owner = await add('Owner', {
                type: ContentReviewContentType.DASHBOARD,
            });
            const uuid = await add('Revenue', { space: privateSpace });
            await addVersion(uuid);
            await tx('saved_queries')
                .where('saved_query_uuid', uuid)
                .update({ dashboard_uuid: owner });
            expect(await shortlist()).toEqual([]);

            await tx('saved_queries')
                .where('saved_query_uuid', uuid)
                .update({ space_id: 1 });
            await tx('dashboards')
                .where('dashboard_uuid', owner)
                .update({ space_id: 2 });
            expect(
                (await shortlist()).map((candidate) => candidate.uuid),
            ).toEqual([uuid]);
        });

        it('orders field matches by hit count then UUID and excludes charts without versions', async () => {
            const fewer = await add('Overview');
            const more = await add('Overview');
            const tied = await add('Overview');
            await addVersion(fewer);
            await addVersion(more, ['orders_revenue'], ['orders_month']);
            await addVersion(tied, ['orders_revenue'], ['orders_month']);
            await add('Revenue without version');
            expect(
                (await shortlist()).map((candidate) => candidate.uuid),
            ).toEqual([...[more, tied].sort(), fewer]);
        });

        it('selects by creation time before version ID', async () => {
            const uuid = await add('Overview');
            await addVersion(uuid);
            await tx<{ created_at: Date }>('saved_queries_versions').update({
                created_at: new Date('2025-01-02'),
            });
            await addVersion(uuid, ['other_metric']);
            await tx<{ created_at: Date; saved_queries_version_id: number }>(
                'saved_queries_versions',
            )
                .where('saved_queries_version_id', 2)
                .update({ created_at: new Date('2025-01-01') });
            expect(
                (await shortlist()).map((candidate) => candidate.uuid),
            ).toEqual([uuid]);
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
    it.each([
        ['Weekly revenue', 'Weekly customer churn'],
        ['Gross revenue', 'Net revenue'],
        ['Revenue', 'Revenue forecast customer churn acquisition'],
        ['Monthly revenue', 'Weekly revenue'],
        ['Revenue', 'Revenue by region'],
        ['Revenue by region', 'Region revenue'],
        ['MRR_USD', 'MRR USD'],
        ['Revenue%', 'Revenue forecast'],
        ['Revenue_', 'RevenueX'],
        ['!!!', '???'],
        ['Revenue', 'Avenue'],
        ['Customer retention', 'Customer acquisition'],
    ])('does not suggest %s for %s', async (name, candidate) => {
        await add(candidate);
        expect(await find(name)).toEqual([]);
    });

    it.each([
        ['Weekly Revenue', 'weekly revenue'],
        ['Monthly report', 'Monthly report'],
        ['Résumé des ventes', 'Résumé des ventes'],
        ['Ｒｅｖｅｎｕｅ', 'Ｒｅｖｅｎｕｅ'],
        ['売上 月次', '売上 月次'],
        ['MRR_USD', 'mrr_usd'],
        ['Revenue 100%', 'Revenue 100%'],
        ['Revenue\\cost', 'Revenue\\cost'],
    ])(
        'matches full names without a word list: %s / %s',
        async (name, candidate) => {
            const uuid = await add(candidate);
            expect(await find(name)).toEqual([
                expect.objectContaining({ uuid, matchReason: 'same_name' }),
            ]);
        },
    );

    it('orders equal-name matches deterministically before limiting', async () => {
        const uuids = await Promise.all(
            Array.from({ length: 3 }, () => add('Revenue')),
        );
        expect((await find('Revenue')).map((r) => r.uuid)).toEqual(
            uuids.sort(),
        );
        expect((await find('Revenue', { limit: 1 }))[0].uuid).toBe(uuids[0]);
    });

    it('filters inaccessible candidates before the limit', async () => {
        await Promise.all(
            Array.from({ length: 25 }, () =>
                add('Revenue', { space: privateSpace }),
            ),
        );
        const visible = await add('Revenue');
        expect(
            (await find('Revenue', { limit: 1 })).map((r) => r.uuid),
        ).toEqual([visible]);
        expect(await find('Revenue', { spaces: [] })).toEqual([]);
    });

    it('excludes self, personal spaces, deleted content/spaces and other projects', async () => {
        const self = await add('Revenue');
        await add('Revenue', { deleted: true });
        await Promise.all(
            [personalSpace, deletedSpace, otherProjectSpace].map((space) =>
                add('Revenue', { space }),
            ),
        );
        expect(
            await find('Revenue', {
                exclude: self,
                spaces: [
                    sharedSpace,
                    personalSpace,
                    deletedSpace,
                    otherProjectSpace,
                ],
            }),
        ).toEqual([]);
    });

    it('matches charts across both chart types but isolates dashboards', async () => {
        const chart = await add('Revenue');
        const sql = await add('Revenue', {
            type: ContentReviewContentType.SQL_CHART,
        });
        const dashboard = await add('Revenue', {
            type: ContentReviewContentType.DASHBOARD,
        });
        expect((await find('Revenue')).map((r) => r.uuid).sort()).toEqual(
            [chart, sql].sort(),
        );
        expect(
            (
                await find('Revenue', {
                    type: ContentReviewContentType.SQL_CHART,
                })
            )
                .map((r) => r.uuid)
                .sort(),
        ).toEqual([chart, sql].sort());
        expect(
            (
                await find('Revenue', {
                    type: ContentReviewContentType.DASHBOARD,
                })
            ).map((r) => r.uuid),
        ).toEqual([dashboard]);
    });

    it('finds dashboard-owned charts through their dashboard space and excludes deleted owners', async () => {
        const owner = await add('Overview', {
            type: ContentReviewContentType.DASHBOARD,
        });
        const chart = await add('Revenue');
        const sql = await add('Revenue', {
            type: ContentReviewContentType.SQL_CHART,
        });
        await tx('saved_queries')
            .where('saved_query_uuid', chart)
            .update({ space_id: null, dashboard_uuid: owner });
        await tx('saved_sql')
            .where('saved_sql_uuid', sql)
            .update({ space_uuid: null, dashboard_uuid: owner });
        expect((await find('Revenue')).map((r) => r.uuid).sort()).toEqual(
            [chart, sql].sort(),
        );
        await tx('dashboards')
            .where('dashboard_uuid', owner)
            .update({ deleted_at: new Date() });
        expect(await find('Revenue')).toEqual([]);
    });

    it('finds the relevant chart among thousands of unrelated names', async () => {
        const space = await tx('spaces')
            .where('space_uuid', sharedSpace)
            .first<{ space_id: number }>();
        await tx<{
            saved_query_uuid: string;
            name: string;
            slug: string;
            space_id: number;
        }>('saved_queries').insert(
            Array.from({ length: 2000 }, (_, i) => ({
                saved_query_uuid: randomUUID(),
                name: `Customer acquisition cohort ${i}`,
                slug: `cohort-${i}`,
                space_id: space!.space_id,
            })),
        );
        const relevant = await add('Shipping counts by method');
        expect(
            (await find('Shipping counts by method')).map((r) => r.uuid),
        ).toEqual([relevant]);
    });

    it('treats query syntax and SQL metacharacters as name text', async () => {
        await add('Customer churn');
        expect(await find("Revenue' OR 1=1 --")).toEqual([]);
        expect(await find('%')).toEqual([]);
    });
});
