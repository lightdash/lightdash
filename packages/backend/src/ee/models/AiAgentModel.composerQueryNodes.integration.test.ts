import {
    QuerySourceType,
    SEED_ORG_1,
    SEED_PROJECT,
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

    const thread = (scopeUuid: string) => ({
        scopeType: 'thread' as const,
        scopeUuid,
    });

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
            scope: thread(threadUuid),
            toolCallId: 'call-1',
            nodes: [orders],
        });
        await model.registerComposerQueryNodes({
            scope: thread(threadUuid),
            toolCallId: 'call-2',
            nodes: [orders, totals],
        });

        expect(await model.listComposerQueryNodes(thread(threadUuid))).toEqual([
            orders,
            totals,
        ]);
    });

    it('accepts an identical definition, whatever the references form', async () => {
        const threadUuid = await createThread();
        await model.registerComposerQueryNodes({
            scope: thread(threadUuid),
            toolCallId: 'call-1',
            nodes: [orders, totals],
        });

        await model.registerComposerQueryNodes({
            scope: thread(threadUuid),
            toolCallId: 'call-2',
            nodes: [{ ...totals, references: ['orders'] }],
        });

        expect(await model.listComposerQueryNodes(thread(threadUuid))).toEqual([
            orders,
            totals,
        ]);
    });

    it('rejects a different definition under a registered node id and registers nothing from that call', async () => {
        const threadUuid = await createThread();
        await model.registerComposerQueryNodes({
            scope: thread(threadUuid),
            toolCallId: 'call-1',
            nodes: [orders],
        });

        await expect(
            model.registerComposerQueryNodes({
                scope: thread(threadUuid),
                toolCallId: 'call-2',
                nodes: [totals, { ...orders, limit: 10 }],
            }),
        ).rejects.toThrow(
            'Node id "orders" already names a different node in this thread ("Orders"). To reuse it, read "orders" without resubmitting it; to define a new node, give it a different node id.',
        );
        expect(await model.listComposerQueryNodes(thread(threadUuid))).toEqual([
            orders,
        ]);
    });

    it('keeps each scope to its own nodes', async () => {
        const threadA = await createThread();
        const threadB = await createThread();
        await model.registerComposerQueryNodes({
            scope: thread(threadA),
            toolCallId: 'call-1',
            nodes: [orders],
        });

        await model.registerComposerQueryNodes({
            scope: thread(threadB),
            toolCallId: 'call-2',
            nodes: [{ ...orders, limit: 10 }],
        });

        expect(await model.listComposerQueryNodes(thread(threadA))).toEqual([
            orders,
        ]);
        expect(await model.listComposerQueryNodes(thread(threadB))).toEqual([
            { ...orders, limit: 10 },
        ]);
    });

    it('removes a thread’s nodes when the thread is deleted', async () => {
        const threadUuid = await createThread();
        const otherThreadUuid = await createThread();
        await model.registerComposerQueryNodes({
            scope: thread(threadUuid),
            toolCallId: 'call-1',
            nodes: [orders],
        });
        await model.registerComposerQueryNodes({
            scope: thread(otherThreadUuid),
            toolCallId: 'call-2',
            nodes: [orders],
        });

        await model.deleteThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            threadUuid,
        });

        expect(await model.listComposerQueryNodes(thread(threadUuid))).toEqual(
            [],
        );
        expect(
            await model.listComposerQueryNodes(thread(otherThreadUuid)),
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
            scope: thread(threadUuid),
            toolCallId: 'call-1',
            nodes: [orders, totals],
        });

        const clonedThreadUuid = await model.cloneThread({
            sourceThreadUuid: threadUuid,
            sourcePromptUuid: prompt.ai_prompt_uuid,
            targetUserUuid: userUuid,
        });
        threadUuids.push(clonedThreadUuid);

        expect(
            await model.listComposerQueryNodes(thread(clonedThreadUuid)),
        ).toEqual([orders, totals]);
    });
});
