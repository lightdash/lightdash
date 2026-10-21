import {
    runComposerQueriesToolDefinition,
    SEED_ORG_1,
    SEED_PROJECT,
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

const composerSuccess = (terminalNodeId: string) => ({
    status: 'success',
    queryUuid: `query-${terminalNodeId}`,
    terminalNodeId,
    title: `Title ${terminalNodeId}`,
    description: null,
});

describe('AiAgentModel thread composer tool results', () => {
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

    const createPrompt = async (threadUuid: string) => {
        const [prompt] = await database<AiPromptTable>(AiPromptTableName)
            .insert({
                ai_thread_uuid: threadUuid,
                created_by_user_uuid: userUuid,
                prompt: 'composer tool results test',
            })
            .returning('*');
        return prompt.ai_prompt_uuid;
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

    it("lists the thread's composer results across prompts, oldest first, and nothing else", async () => {
        const threadUuid = await createThread();
        const otherThreadUuid = await createThread();
        const first = await createPrompt(threadUuid);
        const second = await createPrompt(threadUuid);
        const other = await createPrompt(otherThreadUuid);

        await model.createToolResults([
            {
                promptUuid: first,
                toolCallId: 'call-1',
                toolName: runComposerQueriesToolDefinition.name,
                result: 'ok',
                metadata: composerSuccess('revenue'),
            },
            {
                promptUuid: first,
                toolCallId: 'call-2',
                toolName: 'runQuery',
                result: 'ok',
                metadata: composerSuccess('not-composer'),
            },
            {
                promptUuid: other,
                toolCallId: 'call-3',
                toolName: runComposerQueriesToolDefinition.name,
                result: 'ok',
                metadata: composerSuccess('other-thread'),
            },
        ]);
        await model.createToolResults([
            {
                promptUuid: second,
                toolCallId: 'call-4',
                toolName: runComposerQueriesToolDefinition.name,
                result: 'failed',
                metadata: { status: 'error' },
            },
        ]);

        expect(await model.listComposerQueryToolResults(threadUuid)).toEqual([
            {
                toolName: runComposerQueriesToolDefinition.name,
                metadata: composerSuccess('revenue'),
            },
            {
                toolName: runComposerQueriesToolDefinition.name,
                metadata: { status: 'error' },
            },
        ]);
    });
});
