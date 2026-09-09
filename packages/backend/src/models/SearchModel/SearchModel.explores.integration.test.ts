import {
    defineUserAbility,
    Explore,
    ExploreType,
    ForbiddenError,
    OrganizationMemberRole,
    SearchItemType,
    SessionUser,
    TableSelectionType,
    UserAttributeValueMap,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { SearchService } from '../../services/SearchService/SearchService';
import { ContentVerificationModel } from '../ContentVerificationModel';
import { mockExploreWithOutdatedMetricFilters } from '../ProjectModel/ProjectModel.mock';
import { SearchModel } from './index';
import { getExploreSearchCandidatePath } from './utils/search';

describe('Omnibar explore search', () => {
    let database: Knex;
    let model: SearchModel;
    const schemaName = `search_explores_${randomUUID().replaceAll('-', '')}`;
    const projectUuid = randomUUID();
    const organizationUuid = randomUUID();
    const explore = structuredClone(mockExploreWithOutdatedMetricFilters);
    explore.tables.orders.metrics.fulfillment_rate.compiledSql =
        'compiled_sql_payload'.repeat(100_000);
    explore.tables.payments.requiredAttributes = { region: ['EU', 'US'] };
    explore.tables.payments.anyAttributes = { team: 'finance' };
    explore.tables.payments.dimensions.amount.requiredAttributes = {
        region: 'EU',
    };
    explore.tables.payments.dimensions.amount.anyAttributes = {
        team: ['finance', 'sales'],
    };
    explore.tables.payments.dimensions.amount.tablesRequiredAttributes = {
        orders: { region: 'EU' },
    };
    explore.tables.payments.dimensions.amount.tablesAnyAttributes = {
        orders: { team: 'finance' },
    };
    explore.tables.payments.metrics.total_revenue.tablesRequiredAttributes = {
        orders: { region: 'EU' },
    };
    explore.tables.payments.metrics.total_revenue.tablesAnyAttributes = {
        orders: { team: 'finance' },
    };

    beforeAll(async () => {
        if (!process.env.PGCONNECTIONURI) {
            throw new Error('PGCONNECTIONURI is required');
        }
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI,
            searchPath: [schemaName],
            pool: { min: 0, max: 1 },
        });
        await database.raw('CREATE SCHEMA ??', [schemaName]);
        await database.schema.createTable('projects', (table) => {
            table.uuid('project_uuid').primary();
            table.text('table_selection_type');
            table.specificType('table_selection_value', 'text[]');
        });
        await database.schema.createTable('cached_explore', (table) => {
            table.uuid('cached_explore_uuid').primary();
            table.uuid('project_uuid');
            table.text('name');
            table.jsonb('explore');
        });
        await database.schema.createTable('validations', (table) => {
            table.uuid('validation_uuid').primary();
            table.integer('validation_id');
            table.uuid('project_uuid');
            table.text('model_name');
            table.integer('job_id');
        });
        model = new SearchModel({
            database,
            contentVerificationModel: new ContentVerificationModel({
                database,
            }),
        });
    });

    beforeEach(async () => {
        await database<Record<string, unknown>>('cached_explore').delete();
        await database<Record<string, unknown>>('projects').delete();
        await database<Record<string, unknown>>('validations').delete();
        await database<Record<string, unknown>>('projects').insert({
            project_uuid: projectUuid,
            table_selection_type: TableSelectionType.ALL,
        });
        await database<Record<string, unknown>>('cached_explore').insert({
            cached_explore_uuid: randomUUID(),
            project_uuid: projectUuid,
            name: explore.name,
            explore,
        });
    });

    afterAll(async () => {
        if (database) {
            await database.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [
                schemaName,
            ]);
            await database.destroy();
        }
    });

    it('loads matching explores without transferring unrelated compiled JSON', async () => {
        const matchingExplore = structuredClone(explore);
        matchingExplore.name = 'matching_payments';
        matchingExplore.tables.orders.metrics.fulfillment_rate.label =
            'Unique needle';
        matchingExplore.tables.orders.metrics.fulfillment_rate.compiledSql =
            '1';
        await database<Record<string, unknown>>('cached_explore').insert({
            cached_explore_uuid: randomUUID(),
            project_uuid: projectUuid,
            name: matchingExplore.name,
            explore: matchingExplore,
        });
        const query = 'needle';
        const filters = { type: SearchItemType.FIELD };
        const [, expectedFields] = SearchModel.searchTablesAndFields(
            query,
            [matchingExplore],
            filters,
        );
        const cacheResponses: unknown[] = [];
        const capture = (response: unknown, statement: { sql: string }) => {
            if (statement.sql.includes('from "cached_explore"')) {
                cacheResponses.push(response);
            }
        };
        database.on('query-response', capture);
        try {
            const results = await model.search(projectUuid, query, filters);
            expect(results.fields).toEqual(expectedFields);
            expect(results.fields).toHaveLength(1);
            expect(cacheResponses).toHaveLength(1);
            expect(JSON.stringify(cacheResponses)).not.toContain(
                'compiled_sql_payload',
            );
            expect(
                Buffer.byteLength(JSON.stringify(cacheResponses)),
            ).toBeLessThan(10_000);
        } finally {
            database.off('query-response', capture);
        }
    });

    it.each(['Payments', 'amount', 'total amount', '(AUD)', '不存在', ''])(
        'preserves matching, ranking, hidden fields and authorization metadata for %j',
        async (query) => {
            // Use PostgreSQL's JSONB key order for the legacy comparison as well.
            const fullRows = await database<Record<string, unknown>>(
                'cached_explore',
            )
                .select<{ explore: Explore }[]>('explore')
                .orderBy('name');
            const [expectedTables, expectedFields] =
                SearchModel.searchTablesAndFields(
                    query,
                    fullRows.map((row) => row.explore),
                );
            const tables = await model.search(projectUuid, query, {
                type: SearchItemType.TABLE,
            });
            const fields = await model.search(projectUuid, query, {
                type: SearchItemType.FIELD,
            });
            expect(tables.tables).toEqual(expectedTables);
            expect(fields.fields).toEqual(expectedFields);
        },
    );

    it('keeps stable ordering and the ten-result limit for tied fields', async () => {
        const smallExplore = structuredClone(explore);
        smallExplore.tables.orders.metrics.fulfillment_rate.compiledSql = '1';
        await database<Record<string, unknown>>('cached_explore').insert(
            Array.from({ length: 12 }, (_, index) => ({
                cached_explore_uuid: randomUUID(),
                project_uuid: projectUuid,
                name: `payments_${index}`,
                explore: { ...smallExplore, name: `payments_${index}` },
            })),
        );
        const fullRows = await database<Record<string, unknown>>(
            'cached_explore',
        )
            .select<{ explore: Explore }[]>('explore')
            .orderBy('name');
        const [, expected] = SearchModel.searchTablesAndFields(
            'amount',
            fullRows.map((row) => row.explore),
        );
        const results = await model.search(projectUuid, 'amount', {
            type: SearchItemType.FIELD,
        });
        expect(results.fields).toEqual(expected);
        expect(results.fields).toHaveLength(10);
    });

    it('preserves literal punctuation, multiple words and Unicode matching', async () => {
        const labels = [
            'a.b',
            'a*b',
            'a+b',
            'a?b',
            '^cost$',
            '[amount]',
            '(AUD)',
            '{amount}',
            'foo|bar',
            'back\\slash',
            'path/to',
            'account_id',
            'a-b',
            'say "hello"',
            "customer's",
            'foo  bar',
            '") || true || ("',
            'I i İ ı',
            'K k K',
            'S s ſ',
            'Éclair é',
            'Σ σ ς',
            '中文',
            'line\nbreak',
        ];
        const varied = structuredClone(explore);
        varied.tables = { payments: varied.tables.payments };
        varied.tables.payments.metrics = {};
        const dimension = varied.tables.payments.dimensions.amount;
        varied.tables.payments.dimensions = Object.fromEntries(
            labels.map((label, index) => [
                `f${index}`,
                {
                    ...dimension,
                    name: `f${index}`,
                    label,
                    description: undefined,
                    compiledSql: '1',
                },
            ]),
        );
        await database<Record<string, unknown>>('cached_explore').update({
            explore: varied,
        });
        const fullRows = await database<Record<string, unknown>>(
            'cached_explore',
        )
            .select<{ explore: Explore }[]>('explore')
            .orderBy('name');
        const fullExplores = fullRows.map((row) => row.explore);

        await Promise.all(
            [...labels, '\\', '/', '"', "'", 'I', 'k', 's', 'é', 'σ', '  '].map(
                async (query) => {
                    const [, expected] = SearchModel.searchTablesAndFields(
                        query,
                        fullExplores,
                    );
                    const result = await model.search(projectUuid, query, {
                        type: SearchItemType.FIELD,
                    });
                    expect({ query, fields: result.fields }).toEqual({
                        query,
                        fields: expected,
                    });

                    // Exercise the default omnibar path, which considers tables and fields.
                    const candidatePath = getExploreSearchCandidatePath(query);
                    const candidates: { explore: Explore }[] = await database<
                        Record<string, unknown>
                    >('cached_explore')
                        .select<{ explore: Explore }[]>('explore')
                        .modify((builder) => {
                            if (candidatePath)
                                void builder.whereRaw(
                                    "jsonb_path_exists(explore, ?::jsonpath, '{}', true)",
                                    [candidatePath],
                                );
                        })
                        .orderBy('name');
                    expect(
                        SearchModel.searchTablesAndFields(
                            query,
                            candidates.map((row) => row.explore),
                        ),
                    ).toEqual(
                        SearchModel.searchTablesAndFields(query, fullExplores),
                    );
                },
            ),
        );
    });

    it('does not load another project’s matching explores', async () => {
        const foreignExplore = structuredClone(explore);
        foreignExplore.name = 'foreign_payments';
        await database<Record<string, unknown>>('cached_explore').insert({
            cached_explore_uuid: randomUUID(),
            project_uuid: randomUUID(),
            name: foreignExplore.name,
            explore: foreignExplore,
        });
        const result = await model.search(projectUuid, 'Fulfillment', {
            type: SearchItemType.FIELD,
        });
        expect(result.fields.map((field) => field.explore)).toEqual([
            explore.name,
        ]);
    });

    it('avoids loading successful explores for non-explore search types', async () => {
        const responses: unknown[] = [];
        const capture = (rows: unknown, statement: { sql: string }) => {
            if (statement.sql.includes('from "cached_explore"'))
                responses.push(rows);
        };
        database.on('query-response', capture);
        try {
            const result = await model.search(projectUuid, 'Fulfillment', {
                type: SearchItemType.PAGE,
            });
            expect(result.fields).toEqual([]);
            expect(result.tables).toEqual([]);
            expect(responses).toEqual([[]]);
        } finally {
            database.off('query-response', capture);
        }
    });

    it.each([
        TableSelectionType.ALL,
        TableSelectionType.WITH_NAMES,
        TableSelectionType.WITH_TAGS,
    ])(
        'respects %s selection, user-managed explores and the pre-aggregate exclusion',
        async (selectionType) => {
            await database<Record<string, unknown>>('cached_explore').delete();
            await database<Record<string, unknown>>('projects')
                .where('project_uuid', projectUuid)
                .update({
                    table_selection_type: selectionType,
                    table_selection_value:
                        selectionType === TableSelectionType.WITH_NAMES
                            ? ['included', 'legacy']
                            : ['included'],
                });
            const fixtures = [
                {
                    name: 'included',
                    type: ExploreType.DEFAULT,
                    tags: ['included'],
                },
                { name: 'excluded', type: ExploreType.DEFAULT, tags: [] },
                { name: 'virtual', type: ExploreType.VIRTUAL, tags: [] },
                {
                    name: 'external',
                    type: ExploreType.EXTERNAL_SOURCE,
                    tags: [],
                },
                {
                    name: 'pre_aggregate',
                    type: ExploreType.PRE_AGGREGATE,
                    tags: ['included'],
                },
                { name: 'legacy', tags: ['included'] },
            ];
            const smallExplore = structuredClone(explore);
            smallExplore.tables.orders.metrics.fulfillment_rate.compiledSql =
                '1';
            await database<Record<string, unknown>>('cached_explore').insert(
                fixtures.map((fixture) => ({
                    cached_explore_uuid: randomUUID(),
                    project_uuid: projectUuid,
                    name: fixture.name,
                    explore: { ...smallExplore, ...fixture },
                })),
            );
            const results = await model.search(projectUuid, 'Payments', {
                type: SearchItemType.TABLE,
            });
            expect(
                [
                    ...new Set(results.tables.map((table) => table.explore)),
                ].sort(),
            ).toEqual(
                (selectionType === TableSelectionType.ALL
                    ? ['included', 'excluded', 'virtual', 'external', 'legacy']
                    : ['included', 'virtual', 'external', 'legacy']
                ).sort(),
            );
        },
    );

    it('returns validation errors for failed explores, including with other type filters', async () => {
        const name = 'broken_payments';
        await database<Record<string, unknown>>('cached_explore').insert({
            cached_explore_uuid: randomUUID(),
            project_uuid: projectUuid,
            name,
            explore: { name, label: 'Broken payments', errors: [] },
        });
        const validationUuid = randomUUID();
        await database<Record<string, unknown>>('validations').insert([
            {
                validation_uuid: validationUuid,
                validation_id: 1,
                project_uuid: projectUuid,
                model_name: name,
                job_id: null,
            },
            {
                validation_uuid: randomUUID(),
                validation_id: 2,
                project_uuid: projectUuid,
                model_name: name,
                job_id: 1,
            },
        ]);
        const result = await model.search(projectUuid, 'BROKEN', {
            type: SearchItemType.PAGE,
        });
        expect(result.tables).toEqual([
            {
                explore: name,
                exploreLabel: 'Broken payments',
                validationErrors: [{ validationUuid, validationId: 1 }],
            },
        ]);
    });

    describe('authorization through SearchService', () => {
        const allowedAttributes: UserAttributeValueMap = {
            region: ['EU'],
            team: ['finance'],
            clearance: ['sensitive'],
            role: ['analyst'],
            tier: ['gold'],
            division: ['north'],
        };
        const makeUser = (
            role = OrganizationMemberRole.DEVELOPER,
            orgUuid = organizationUuid,
            userUuid = randomUUID(),
        ) =>
            ({
                userUuid,
                organizationUuid: orgUuid,
                ability: defineUserAbility(
                    {
                        role,
                        organizationUuid: orgUuid,
                        userUuid,
                        roleUuid: undefined,
                    },
                    [],
                ),
            }) as SessionUser;

        const makeService = (
            attributesByUser: Record<string, UserAttributeValueMap>,
        ) =>
            new SearchService({
                searchModel: model,
                analytics: { track: vi.fn() } as never,
                projectModel: {
                    getSummary: async () => ({
                        organizationUuid,
                        name: 'Project',
                    }),
                } as never,
                spaceModel: {} as never,
                spacePermissionService: {
                    getAccessibleSpaceUuids: async () => [],
                    resolveAccessBatch: async () => [],
                } as never,
                userAttributesModel: {
                    getAttributeValuesForOrgMember: async ({
                        userUuid,
                    }: {
                        userUuid: string;
                    }) => attributesByUser[userUuid] ?? {},
                } as never,
            });

        beforeEach(async () => {
            const secured = structuredClone(explore);
            const table = secured.tables.payments;
            table.label = 'Sensitive payments';
            table.requiredAttributes = { region: 'EU' };
            table.anyAttributes = { team: ['finance', 'sales'] };
            table.dimensions.amount.label = 'Sensitive amount';
            table.metrics.total_revenue.label = 'Sensitive revenue';
            const fieldAccess = {
                requiredAttributes: { clearance: 'sensitive' },
                anyAttributes: { role: ['analyst', 'auditor'] },
                tablesRequiredAttributes: {
                    payments: table.requiredAttributes,
                    customers: { tier: 'gold' },
                },
                tablesAnyAttributes: {
                    payments: table.anyAttributes,
                    customers: { division: ['north', 'west'] },
                },
            };
            table.dimensions.amount = {
                ...table.dimensions.amount,
                ...fieldAccess,
            };
            table.metrics.total_revenue = {
                ...table.metrics.total_revenue,
                ...fieldAccess,
            };
            await database<Record<string, unknown>>('cached_explore').update({
                explore: secured,
            });
        });

        it.each([
            {
                name: 'missing attributes',
                attributes: {},
                fields: 0,
                tables: 0,
            },
            {
                name: 'matching attributes',
                attributes: allowedAttributes,
                fields: 2,
                tables: 1,
            },
            {
                name: 'missing field-level required attribute',
                attributes: { ...allowedAttributes, clearance: [] },
                fields: 0,
                tables: 1,
            },
            {
                name: 'nonmatching field-level any attribute',
                attributes: { ...allowedAttributes, role: ['viewer'] },
                fields: 0,
                tables: 1,
            },
            {
                name: 'nonmatching table-level required attribute',
                attributes: { ...allowedAttributes, region: ['US'] },
                fields: 0,
                tables: 0,
            },
            {
                name: 'nonmatching table-level any attribute',
                attributes: { ...allowedAttributes, team: ['engineering'] },
                fields: 0,
                tables: 0,
            },
            {
                name: 'nonmatching joined-table required attribute',
                attributes: { ...allowedAttributes, tier: ['silver'] },
                fields: 0,
                tables: 1,
            },
            {
                name: 'nonmatching joined-table any attribute',
                attributes: { ...allowedAttributes, division: ['south'] },
                fields: 0,
                tables: 1,
            },
            {
                name: 'alternative any attributes',
                attributes: {
                    ...allowedAttributes,
                    team: ['sales'],
                    role: ['auditor'],
                    division: ['west'],
                },
                fields: 2,
                tables: 1,
            },
        ])(
            'enforces $name for both dimensions and metrics',
            async ({ attributes, fields, tables }) => {
                const user = makeUser();
                const service = makeService({ [user.userUuid]: attributes });
                const fieldResults = await service.getSearchResults(
                    user,
                    projectUuid,
                    'Sensitive',
                    'omnibar',
                    { type: SearchItemType.FIELD },
                );
                const tableResults = await service.getSearchResults(
                    user,
                    projectUuid,
                    'Sensitive',
                    'omnibar',
                    { type: SearchItemType.TABLE },
                );
                expect(fieldResults.fields).toHaveLength(fields);
                expect(tableResults.tables).toHaveLength(tables);
            },
        );

        it('does not reuse one user’s access for another user of the same cache', async () => {
            const allowedUser = makeUser();
            const deniedUser = makeUser();
            const service = makeService({
                [allowedUser.userUuid]: allowedAttributes,
            });
            const allowed = await service.getSearchResults(
                allowedUser,
                projectUuid,
                'Sensitive',
                'omnibar',
                { type: SearchItemType.FIELD },
            );
            const denied = await service.getSearchResults(
                deniedUser,
                projectUuid,
                'Sensitive',
                'omnibar',
                { type: SearchItemType.FIELD },
            );
            expect(allowed.fields).toHaveLength(2);
            expect(denied.fields).toEqual([]);
        });

        it('enforces changed field restrictions on the next search', async () => {
            const user = makeUser();
            const service = makeService({ [user.userUuid]: allowedAttributes });
            const before = await service.getSearchResults(
                user,
                projectUuid,
                'Sensitive',
                'omnibar',
                { type: SearchItemType.FIELD },
            );
            expect(before.fields).toHaveLength(2);
            const row = await database<Record<string, unknown>>(
                'cached_explore',
            )
                .select<{ explore: Explore }>('explore')
                .first();
            const updatedExplore = row!.explore;
            updatedExplore.tables.payments.metrics.total_revenue.requiredAttributes =
                { clearance: 'executive' };
            await database<Record<string, unknown>>('cached_explore').update({
                explore: updatedExplore,
            });
            const after = await service.getSearchResults(
                user,
                projectUuid,
                'Sensitive',
                'omnibar',
                { type: SearchItemType.FIELD },
            );
            expect(after.fields.map((field) => field.name)).toEqual(['amount']);
        });

        it('hides explores without Explore permission even when attributes match', async () => {
            const user = makeUser(OrganizationMemberRole.VIEWER);
            const service = makeService({ [user.userUuid]: allowedAttributes });
            const result = await service.getSearchResults(
                user,
                projectUuid,
                'Sensitive',
                'omnibar',
                { type: SearchItemType.FIELD },
            );
            expect(result.fields).toEqual([]);
            expect(result.tables).toEqual([]);
        });

        it('denies users from another organization before searching', async () => {
            const user = makeUser(OrganizationMemberRole.ADMIN, randomUUID());
            const service = makeService({ [user.userUuid]: allowedAttributes });
            await expect(
                service.getSearchResults(
                    user,
                    projectUuid,
                    'Sensitive',
                    'omnibar',
                    { type: SearchItemType.FIELD },
                ),
            ).rejects.toThrow(ForbiddenError);
        });
    });
});
