import {
    DimensionType,
    QuerySourceType,
    SEED_ORG_1,
    SEED_PROJECT,
    type ComposerNodeColumn,
    type RegisteredComposerQueryNode,
    type ThreadComposerQueryNode,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { getModels, getTestContext } from '../../vitest.setup.integration';
import {
    AiPromptTableName,
    AiThreadTableName,
    type AiPromptTable,
    type AiThreadTable,
} from '../database/entities/ai';
import { threadComposerQueryScope } from '../database/entities/composerQueryNodes';
import { type AiAgentModel } from './AiAgentModel';

const orders: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'orders',
    title: 'Orders',
    sql: 'SELECT * FROM orders',
    limit: 500,
};

const totals: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'totals',
    title: 'Totals',
    sql: 'SELECT count(*) FROM orders',
    references: { orders: 'orders' },
    limit: 500,
};

const withoutColumns = (
    nodes: ThreadComposerQueryNode[],
): RegisteredComposerQueryNode[] =>
    nodes.map((definition) => ({ definition, columns: null }));

const ordersColumns: ComposerNodeColumn[] = [
    {
        reference: 'orders_status',
        type: DimensionType.STRING,
        label: 'Status',
        format: null,
        timeInterval: null,
        provenance: { fieldId: 'orders_status' },
    },
];

const totalsColumns: ComposerNodeColumn[] = [
    {
        reference: 'count',
        type: DimensionType.NUMBER,
        label: null,
        format: null,
        timeInterval: null,
        provenance: null,
    },
];

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
            nodes: withoutColumns([orders]),
        });
        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(threadUuid),
            nodes: withoutColumns([orders, totals]),
        });

        expect(
            await model.listComposerQueryNodes(
                threadComposerQueryScope(threadUuid),
            ),
        ).toEqual([orders, totals]);
    });

    it('stores each node’s result columns beside its definition', async () => {
        const threadUuid = await createThread();

        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(threadUuid),
            nodes: [
                { definition: orders, columns: ordersColumns },
                { definition: totals, columns: totalsColumns },
            ],
        });

        expect(
            await model.listRegisteredComposerQueryNodes(
                threadComposerQueryScope(threadUuid),
            ),
        ).toEqual([
            { definition: orders, columns: ordersColumns },
            { definition: totals, columns: totalsColumns },
        ]);
        expect(
            await model.listComposerQueryNodes(
                threadComposerQueryScope(threadUuid),
            ),
        ).toEqual([orders, totals]);
    });

    it('fills columns on a node registered without them, and keeps stored columns when a run has none', async () => {
        const threadUuid = await createThread();
        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(threadUuid),
            nodes: [
                { definition: orders, columns: null },
                { definition: totals, columns: totalsColumns },
            ],
        });

        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(threadUuid),
            nodes: [
                { definition: orders, columns: ordersColumns },
                { definition: totals, columns: null },
            ],
        });

        expect(
            await model.listRegisteredComposerQueryNodes(
                threadComposerQueryScope(threadUuid),
            ),
        ).toEqual([
            { definition: orders, columns: ordersColumns },
            { definition: totals, columns: totalsColumns },
        ]);
    });

    it('accepts an identical definition, whatever the references form', async () => {
        const threadUuid = await createThread();
        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(threadUuid),
            nodes: withoutColumns([orders, totals]),
        });

        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(threadUuid),
            nodes: withoutColumns([{ ...totals, references: ['orders'] }]),
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
            nodes: withoutColumns([orders]),
        });

        await expect(
            model.registerComposerQueryNodes({
                scope: threadComposerQueryScope(threadUuid),
                nodes: withoutColumns([totals, { ...orders, limit: 10 }]),
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
            nodes: withoutColumns([orders]),
        });

        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(threadB),
            nodes: withoutColumns([{ ...orders, limit: 10 }]),
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
            nodes: withoutColumns([orders]),
        });
        await model.registerComposerQueryNodes({
            scope: threadComposerQueryScope(otherThreadUuid),
            nodes: withoutColumns([orders]),
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
            nodes: [
                { definition: orders, columns: ordersColumns },
                { definition: totals, columns: null },
            ],
        });

        const clonedThreadUuid = await model.cloneThread({
            sourceThreadUuid: threadUuid,
            sourcePromptUuid: prompt.ai_prompt_uuid,
            targetUserUuid: userUuid,
        });
        threadUuids.push(clonedThreadUuid);

        expect(
            await model.listRegisteredComposerQueryNodes(
                threadComposerQueryScope(clonedThreadUuid),
            ),
        ).toEqual([
            { definition: orders, columns: ordersColumns },
            { definition: totals, columns: null },
        ]);
    });
});
