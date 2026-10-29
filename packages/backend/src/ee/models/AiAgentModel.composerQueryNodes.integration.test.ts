import {
    DimensionType,
    QuerySourceType,
    SEED_ORG_1,
    SEED_PROJECT,
    type ThreadComposerQueryNode,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { getModels, getTestContext } from '../../vitest.setup.integration';
import {
    AiPromptTableName,
    AiThreadTableName,
    type AiPromptTable,
    type AiThreadTable,
} from '../database/entities/ai';
import {
    composerSessionScope,
    ComposerSessionsTableName,
    threadComposerQueryScope,
} from '../database/entities/composerQueryNodes';
import { type AiAgentModel } from './AiAgentModel';

const orders: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'orders',
    title: 'Orders',
    sql: 'SELECT * FROM orders',
    limit: 500,
};

const totalsColumns = [{ reference: 'count', type: DimensionType.NUMBER }];

const totals: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'totals',
    title: 'Totals',
    sql: 'SELECT count(*) FROM orders',
    references: { orders: 'orders' },
    limit: 500,
};

describe('AiAgentModel thread composer query nodes', () => {
    let database: Knex;
    let model: AiAgentModel;
    let userUuid = '';
    const threadUuids: string[] = [];

    const createThread = async () => {
        const [thread] = await database<AiThreadTable>(AiThreadTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                created_from: 'web_app',
                agent_uuid: null,
            })
            .returning('*');
        threadUuids.push(thread.ai_thread_uuid);
        return thread.ai_thread_uuid;
    };

    beforeAll(() => {
        const ctx = getTestContext();
        database = ctx.db;
        model = getModels(ctx.app).aiAgentModel;
        userUuid = ctx.testUser.userUuid;
    });

    afterAll(async () => {
        await database(AiThreadTableName)
            .whereIn('ai_thread_uuid', threadUuids)
            .delete();
    });

    it('lists the nodes a thread registered, in registration order', async () => {
        const threadUuid = await createThread();

        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(threadUuid),
            nodes: [orders],
            nodeColumns: {},
        });
        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(threadUuid),
            nodes: [orders, totals],
            nodeColumns: {},
        });

        expect(
            await model.listComposerQueryNodes(
                threadComposerQueryScope(threadUuid),
            ),
        ).toEqual([orders, totals]);
    });

    it('accepts an identical definition, whatever the references form', async () => {
        const threadUuid = await createThread();
        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(threadUuid),
            nodes: [orders, totals],
            nodeColumns: {},
        });

        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(threadUuid),
            nodes: [{ ...totals, references: ['orders'] }],
            nodeColumns: {},
        });

        expect(
            await model.listComposerQueryNodes(
                threadComposerQueryScope(threadUuid),
            ),
        ).toEqual([orders, totals]);
    });

    it('rejects a different definition under a registered node id and registers nothing from that call', async () => {
        const threadUuid = await createThread();
        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(threadUuid),
            nodes: [orders],
            nodeColumns: {},
        });

        await expect(
            model.registerComposerQueryNodes({
                scope: threadComposerQueryScope(threadUuid),
                nodes: [totals, { ...orders, limit: 10 }],
                nodeColumns: {},
            }),
        ).rejects.toThrow(
            'Node id "orders" already names a different node in this thread ("Orders"). To reuse it, read "orders" without resubmitting it; to define a new node, give it a different node id.',
        );
        expect(
            await model.listComposerQueryNodes(
                threadComposerQueryScope(threadUuid),
            ),
        ).toEqual([orders]);
    });

    it('keeps each scope to its own nodes', async () => {
        const threadA = await createThread();
        const threadB = await createThread();
        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(threadA),
            nodes: [orders],
            nodeColumns: {},
        });

        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(threadB),
            nodes: [{ ...orders, limit: 10 }],
            nodeColumns: {},
        });

        expect(
            await model.listComposerQueryNodes(
                threadComposerQueryScope(threadA),
            ),
        ).toEqual([orders]);
        expect(
            await model.listComposerQueryNodes(
                threadComposerQueryScope(threadB),
            ),
        ).toEqual([{ ...orders, limit: 10 }]);
    });

    it('removes a thread’s nodes when the thread is deleted', async () => {
        const threadUuid = await createThread();
        const otherThreadUuid = await createThread();
        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(threadUuid),
            nodes: [orders],
            nodeColumns: {},
        });
        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(otherThreadUuid),
            nodes: [orders],
            nodeColumns: {},
        });

        await model.deleteThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            threadUuid,
        });

        expect(
            await model.listComposerQueryNodes(
                threadComposerQueryScope(threadUuid),
            ),
        ).toEqual([]);
        expect(
            await model.listComposerQueryNodes(
                threadComposerQueryScope(otherThreadUuid),
            ),
        ).toEqual([orders]);
    });

    it('gives a cloned thread the source thread’s nodes', async () => {
        const threadUuid = await createThread();
        const [prompt] = await database<AiPromptTable>(AiPromptTableName)
            .insert({
                ai_thread_uuid: threadUuid,
                created_by_user_uuid: userUuid,
                prompt: 'composer nodes clone test',
            })
            .returning('*');
        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(threadUuid),
            nodes: [orders, totals],
            nodeColumns: { totals: totalsColumns },
        });

        const clonedThreadUuid = await model.cloneThread({
            sourceThreadUuid: threadUuid,
            sourcePromptUuid: prompt.ai_prompt_uuid,
            targetUserUuid: userUuid,
        });
        threadUuids.push(clonedThreadUuid);

        expect(
            await model.listComposerQueryNodes(
                threadComposerQueryScope(clonedThreadUuid),
            ),
        ).toEqual([orders, totals]);
        expect(
            await model.findComposerQueryNodeColumns({
                scope: threadComposerQueryScope(clonedThreadUuid),
                nodeId: 'totals',
            }),
        ).toEqual(totalsColumns);
    });

    it('stores the columns a run gives a node, keeping them when a later run gives none', async () => {
        const threadUuid = await createThread();
        const scope = threadComposerQueryScope(threadUuid);
        await model.registerComposerQueryNodes({
            scope,
            nodes: [orders, totals],
            nodeColumns: {},
        });
        await model.registerComposerQueryNodes({
            scope,
            nodes: [orders, totals],
            nodeColumns: { totals: totalsColumns },
        });
        await model.registerComposerQueryNodes({
            scope,
            nodes: [totals],
            nodeColumns: {},
        });

        expect(
            await model.findComposerQueryNodeColumns({
                scope,
                nodeId: 'totals',
            }),
        ).toEqual(totalsColumns);
        expect(
            await model.findComposerQueryNodeColumns({
                scope,
                nodeId: 'orders',
            }),
        ).toBeNull();
    });
});

describe('AiAgentModel composer sessions', () => {
    let database: Knex;
    let model: AiAgentModel;
    let owner: {
        userUuid: string;
        organizationUuid: string;
        projectUuid: string;
    };
    const sessionUuids: string[] = [];
    const threadUuids: string[] = [];

    const createSession = async () => {
        const sessionUuid = await model.createComposerSession(owner);
        sessionUuids.push(sessionUuid);
        return sessionUuid;
    };

    const idleFor = async (sessionUuid: string, hours: number) => {
        await database(ComposerSessionsTableName)
            .where('composer_session_uuid', sessionUuid)
            .update({
                last_used_at: database.raw(
                    `now() - make_interval(hours => ${hours})`,
                ),
            });
    };

    beforeAll(() => {
        const ctx = getTestContext();
        database = ctx.db;
        model = getModels(ctx.app).aiAgentModel;
        owner = {
            userUuid: ctx.testUser.userUuid,
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
        };
    });

    afterAll(async () => {
        await database(ComposerSessionsTableName)
            .whereIn('composer_session_uuid', sessionUuids)
            .delete();
        await database(AiThreadTableName)
            .whereIn('ai_thread_uuid', threadUuids)
            .delete();
    });

    it('lets its owner use a session in the project that started it', async () => {
        const sessionUuid = await createSession();

        expect(await model.useComposerSession({ sessionUuid, ...owner })).toBe(
            true,
        );
    });

    it('refuses a session to another user, organization or project, and an unknown id', async () => {
        const sessionUuid = await createSession();

        await expect(
            model.useComposerSession({
                sessionUuid,
                ...owner,
                userUuid: uuidv4(),
            }),
        ).resolves.toBe(false);
        await expect(
            model.useComposerSession({
                sessionUuid,
                ...owner,
                organizationUuid: uuidv4(),
            }),
        ).resolves.toBe(false);
        await expect(
            model.useComposerSession({
                sessionUuid,
                ...owner,
                projectUuid: uuidv4(),
            }),
        ).resolves.toBe(false);
        await expect(
            model.useComposerSession({ sessionUuid: uuidv4(), ...owner }),
        ).resolves.toBe(false);
        await expect(
            model.useComposerSession({ sessionUuid: 'not-a-uuid', ...owner }),
        ).resolves.toBe(false);
    });

    it('expires a session after a day idle, and each use restarts the clock', async () => {
        const used = await createSession();
        const idle = await createSession();
        await idleFor(used, 23);
        await idleFor(idle, 25);

        expect(
            await model.useComposerSession({ sessionUuid: used, ...owner }),
        ).toBe(true);
        await idleFor(used, 0);
        expect(
            await model.useComposerSession({ sessionUuid: idle, ...owner }),
        ).toBe(false);
        expect(
            await model.useComposerSession({ sessionUuid: used, ...owner }),
        ).toBe(true);
    });

    it('deletes expired sessions with their nodes, leaving live sessions and threads', async () => {
        const live = await createSession();
        const expired = await createSession();
        const [thread] = await database<AiThreadTable>(AiThreadTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                created_from: 'web_app',
                agent_uuid: null,
            })
            .returning('*');
        threadUuids.push(thread.ai_thread_uuid);
        await Promise.all(
            [
                composerSessionScope(live),
                composerSessionScope(expired),
                threadComposerQueryScope(thread.ai_thread_uuid),
            ].map((scope) =>
                model.registerComposerQueryNodes({
                    scope,
                    nodes: [orders],
                    nodeColumns: {},
                }),
            ),
        );
        await idleFor(expired, 25);

        await model.deleteExpiredComposerSessions();

        expect(
            await model.useComposerSession({ sessionUuid: expired, ...owner }),
        ).toBe(false);
        expect(
            await model.listComposerQueryNodes(composerSessionScope(expired)),
        ).toEqual([]);
        expect(
            await model.listComposerQueryNodes(composerSessionScope(live)),
        ).toEqual([orders]);
        expect(
            await model.listComposerQueryNodes(
                threadComposerQueryScope(thread.ai_thread_uuid),
            ),
        ).toEqual([orders]);
    });

    it('names the session in a conflicting definition error', async () => {
        const sessionUuid = await createSession();
        await model.registerComposerQueryNodes({
            scope: composerSessionScope(sessionUuid),
            nodes: [orders],
            nodeColumns: {},
        });

        await expect(
            model.registerComposerQueryNodes({
                scope: composerSessionScope(sessionUuid),
                nodes: [{ ...orders, limit: 10 }],
                nodeColumns: {},
            }),
        ).rejects.toThrow(
            'Node id "orders" already names a different node in this session ("Orders").',
        );
    });
});
