import { SEED_ORG_1, SEED_ORG_1_ADMIN, SEED_PROJECT } from '@lightdash/common';
import { type Knex } from 'knex';
import { getModels, getTestContext } from '../../vitest.setup.integration';
import { AiPromptTableName, AiThreadTableName } from '../database/entities/ai';
import { AiAgentModel } from './AiAgentModel';

describe('AiAgentModel prompt activity', () => {
    let database: Knex;
    let model: AiAgentModel;
    const threadUuids = new Set<string>();

    beforeAll(() => {
        const context = getTestContext();
        database = context.db;
        model = getModels(context.app).aiAgentModel;
    });

    afterEach(async () => {
        if (threadUuids.size === 0) return;
        await database(AiThreadTableName)
            .whereIn('ai_thread_uuid', [...threadUuids])
            .delete();
        threadUuids.clear();
    });

    const createWebAppThread = async (): Promise<string> => {
        const threadUuid = await model.createWebAppThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
            createdFrom: 'web_app',
            agentUuid: null,
        });
        threadUuids.add(threadUuid);
        return threadUuid;
    };

    const getThreadUpdatedAt = async (
        threadUuid: string,
    ): Promise<Date | null> => {
        const row = await database(AiThreadTableName)
            .select('updated_at')
            .where('ai_thread_uuid', threadUuid)
            .first();
        return row?.updated_at ?? null;
    };

    it('sets thread updated_at to the inserted web prompt created_at', async () => {
        const threadUuid = await createWebAppThread();
        expect(await getThreadUpdatedAt(threadUuid)).toBeNull();

        const promptUuid = await model.createWebAppPrompt({
            threadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            prompt: 'Track this prompt activity',
        });
        const prompt = await database(AiPromptTableName)
            .select('created_at')
            .where('ai_prompt_uuid', promptUuid)
            .first();

        expect(await getThreadUpdatedAt(threadUuid)).toEqual(
            prompt?.created_at,
        );
    });

    it('keeps Slack prompt activity monotonic', async () => {
        const suffix = crypto.randomUUID();
        const threadUuid = await model.createSlackThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            createdFrom: 'slack',
            slackUserId: 'U123',
            slackChannelId: `C-${suffix}`,
            slackThreadTs: `thread-${suffix}`,
            agentUuid: null,
        });
        threadUuids.add(threadUuid);
        const historicalCreatedAt = new Date('2026-01-01T00:00:00.123Z');

        await model.bulkCreateSlackPrompts(threadUuid, [
            {
                createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                prompt: 'Historical context',
                slackUserId: 'U123',
                slackChannelId: `C-${suffix}`,
                promptSlackTs: `historical-${suffix}`,
                createdAt: historicalCreatedAt,
            },
        ]);
        expect(await getThreadUpdatedAt(threadUuid)).toEqual(
            historicalCreatedAt,
        );

        const promptUuid = await model.createSlackPrompt({
            threadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            prompt: 'Current Slack prompt',
            slackUserId: 'U123',
            slackChannelId: `C-${suffix}`,
            promptSlackTs: `current-${suffix}`,
        });
        const prompt = await database(AiPromptTableName)
            .select('created_at')
            .where('ai_prompt_uuid', promptUuid)
            .first();
        expect(await getThreadUpdatedAt(threadUuid)).toEqual(
            prompt?.created_at,
        );

        await model.bulkCreateSlackPrompts(threadUuid, [
            {
                createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                prompt: 'Older historical context',
                slackUserId: 'U123',
                slackChannelId: `C-${suffix}`,
                promptSlackTs: `older-${suffix}`,
                createdAt: new Date('2025-01-01T00:00:00.123Z'),
            },
        ]);
        expect(await getThreadUpdatedAt(threadUuid)).toEqual(
            prompt?.created_at,
        );
    });

    it('sets a clone updated_at to its last prompt final created_at', async () => {
        const sourceThreadUuid = await createWebAppThread();
        const sourcePromptUuid = await model.createWebAppPrompt({
            threadUuid: sourceThreadUuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            prompt: 'Clone this prompt',
        });
        const historicalCreatedAt = new Date('2026-01-02T00:00:00.456Z');
        await database.raw('UPDATE ?? SET ?? = ? WHERE ?? = ?', [
            AiPromptTableName,
            'created_at',
            historicalCreatedAt,
            'ai_prompt_uuid',
            sourcePromptUuid,
        ]);

        const cloneThreadUuid = await model.cloneThread({
            sourceThreadUuid,
            sourcePromptUuid,
            targetUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            includeSelectedPromptResponse: true,
        });
        threadUuids.add(cloneThreadUuid);
        const clonedPrompt = await database(AiPromptTableName)
            .select('created_at')
            .where('ai_thread_uuid', cloneThreadUuid)
            .orderBy('created_at', 'desc')
            .first();

        expect(clonedPrompt?.created_at).toEqual(historicalCreatedAt);
        expect(await getThreadUpdatedAt(cloneThreadUuid)).toEqual(
            clonedPrompt?.created_at,
        );
    });
});
