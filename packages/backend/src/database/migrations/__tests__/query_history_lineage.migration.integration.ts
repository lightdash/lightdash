import {
    NotFoundError,
    QueryExecutionContext,
    type Account,
    type DuckdbExecutionSpec,
} from '@lightdash/common';
import { fromSession } from '../../../auth/account/account';
import {
    buildAccount,
    defaultSessionUser,
} from '../../../auth/account/account.mock';
import { QueryHistoryModel } from '../../../models/QueryHistoryModel/QueryHistoryModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

const fixture = async () => {
    const { database } = migrated;
    const [org] = await database('organizations')
        .insert({ organization_name: 'Query lineage' })
        .returning('*');
    const users = await database('users')
        .insert([
            { first_name: 'Query', last_name: 'Creator' },
            { first_name: 'Other', last_name: 'Creator' },
        ] as never)
        .returning('user_uuid');
    const projects = await database('projects')
        .insert([
            { name: 'Query project', organization_id: org.organization_id },
            { name: 'Other project', organization_id: org.organization_id },
        ] as never)
        .returning('project_uuid');
    const account = (userUuid: string) =>
        fromSession(
            {
                ...defaultSessionUser,
                userUuid,
                organizationUuid: org.organization_uuid,
            },
            'session',
        );
    const owner = account(users[0].user_uuid);
    const other = account(users[1].user_uuid);
    const model = new QueryHistoryModel({ database });
    const create = async (
        actor: Account,
        context = QueryExecutionContext.EXPLORE,
        projectUuid = projects[0].project_uuid,
    ) =>
        (
            await model.create(actor, {
                projectUuid,
                organizationUuid: org.organization_uuid,
                context,
                compiledSql: 'SELECT 1',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: [],
                    limit: 1,
                },
                fields: {},
                requestParameters: { sql: 'SELECT 1' },
                usedParameters: {},
                cacheKey: 'lineage',
                pivotConfiguration: null,
                originalColumns: null,
                warehouseConnectionUuid: null,
            } as never)
        ).queryUuid;
    return { model, owner, other, projects, create };
};

const spec: DuckdbExecutionSpec = {
    references: {},
    engine: 'scopedToReferencedResults',
    columns: { mode: 'discover', limit: null, parameters: {} },
    guard: null,
    storedCompiledSql: null,
    referenceLabels: {},
    invalidateCache: false,
    cacheHit: false,
    refusal: null,
};

test('batch returns ordered unique rows and specs with one account-scoped database read', async () => {
    const f = await fixture();
    const first = await f.create(f.owner);
    const second = await f.create(f.owner);
    await f.model.setDuckdbExecution(first, spec);
    const read = vi.fn();
    migrated.database.on('query', read);
    try {
        const results = await f.model.getManyWithDuckdbExecutions(
            [second, first, second],
            f.projects[0].project_uuid,
            f.owner,
        );
        expect(read).toHaveBeenCalledOnce();
        expect(results).toEqual([
            {
                queryHistory: await f.model.get(
                    second,
                    f.projects[0].project_uuid,
                    f.owner,
                ),
                execution: null,
            },
            {
                queryHistory: await f.model.get(
                    first,
                    f.projects[0].project_uuid,
                    f.owner,
                ),
                execution: spec,
            },
        ]);
    } finally {
        migrated.database.removeListener('query', read);
    }
});

test('batch refuses another creator or project exactly as get does', async () => {
    const f = await fixture();
    const own = await f.create(f.owner);
    const inaccessible = [
        await f.create(f.other),
        await f.create(
            f.owner,
            QueryExecutionContext.EXPLORE,
            f.projects[1].project_uuid,
        ),
        '00000000-0000-0000-0000-000000000000',
    ];
    await Promise.all(
        inaccessible.map(async (uuid) => {
            await expect(
                f.model.get(uuid, f.projects[0].project_uuid, f.owner),
            ).rejects.toThrow(NotFoundError);
            await expect(
                f.model.getManyWithDuckdbExecutions(
                    [own, uuid],
                    f.projects[0].project_uuid,
                    f.owner,
                ),
            ).rejects.toThrow(NotFoundError);
        }),
    );
});

test('batch scopes anonymous results and permits only AI rows of an embed AI creator', async () => {
    const f = await fixture();
    const anonymous = buildAccount({ accountType: 'jwt' });
    const own = await f.create(anonymous);
    const ai = await f.create(f.owner, QueryExecutionContext.AI);
    const ordinary = await f.create(f.owner);
    const embedAi = {
        ...anonymous,
        embedWriteContext: { canUseAiAgent: true },
        embedWriteUser: { userUuid: f.owner.user.id },
    } as Account;
    await Promise.all(
        [anonymous, embedAi].map(async (actor) => {
            expect(
                await f.model.getManyWithDuckdbExecutions(
                    [own],
                    f.projects[0].project_uuid,
                    actor,
                ),
            ).toEqual([
                {
                    queryHistory: await f.model.get(
                        own,
                        f.projects[0].project_uuid,
                        actor,
                    ),
                    execution: null,
                },
            ]);
        }),
    );
    await expect(
        f.model.getManyWithDuckdbExecutions(
            [ai],
            f.projects[0].project_uuid,
            anonymous,
        ),
    ).rejects.toThrow(NotFoundError);
    expect(
        await f.model.getManyWithDuckdbExecutions(
            [own, ai],
            f.projects[0].project_uuid,
            embedAi,
        ),
    ).toHaveLength(2);
    await expect(
        f.model.getManyWithDuckdbExecutions(
            [ordinary],
            f.projects[0].project_uuid,
            embedAi,
        ),
    ).rejects.toThrow(NotFoundError);
});

test('empty batch performs no database read', async () => {
    const f = await fixture();
    const read = vi.fn();
    migrated.database.on('query', read);
    try {
        expect(
            await f.model.getManyWithDuckdbExecutions(
                [],
                f.projects[0].project_uuid,
                f.owner,
            ),
        ).toEqual([]);
        expect(read).not.toHaveBeenCalled();
    } finally {
        migrated.database.removeListener('query', read);
    }
});
