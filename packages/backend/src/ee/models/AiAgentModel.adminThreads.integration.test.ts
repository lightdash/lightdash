import {
    SEED_ORG_1,
    SEED_ORG_1_EDITOR,
    SEED_ORG_1_VIEWER,
    SEED_PROJECT,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { getModels, getTestContext } from '../../vitest.setup.integration';
import { AiPromptTableName, AiThreadTableName } from '../database/entities/ai';
import { AiAgentTableName } from '../database/entities/aiAgent';
import { type AiAgentModel } from './AiAgentModel';

/**
 * The admin thread list shows each thread once, described by its first
 * prompt, with feedback and prompt counts for that thread only.
 */
describe('AiAgentModel admin thread list', () => {
    let database: Knex;
    let model: AiAgentModel;
    let agentUuid: string;
    let ratedThreadUuid: string;
    let unratedThreadUuid: string;

    const organizationUuid = SEED_ORG_1.organization_uuid;

    const createThread = async (createdAt: Date) => {
        const [thread] = await database(AiThreadTableName)
            .insert({
                organization_uuid: organizationUuid,
                project_uuid: SEED_PROJECT.project_uuid,
                created_from: 'web_app',
                agent_uuid: agentUuid,
            })
            .returning('ai_thread_uuid');
        await database(AiThreadTableName)
            .where('ai_thread_uuid', thread.ai_thread_uuid)
            .update({ created_at: createdAt } as never);
        return thread.ai_thread_uuid;
    };

    const createPrompt = async (
        threadUuid: string,
        prompt: {
            text: string;
            userUuid: string;
            createdAt: Date;
            humanScore?: number;
        },
    ) => {
        const [row] = await database(AiPromptTableName)
            .insert({
                ai_thread_uuid: threadUuid,
                created_by_user_uuid: prompt.userUuid,
                prompt: prompt.text,
            })
            .returning('ai_prompt_uuid');
        await database(AiPromptTableName)
            .where('ai_prompt_uuid', row.ai_prompt_uuid)
            .update({
                created_at: prompt.createdAt,
                human_score: prompt.humanScore ?? null,
            } as never);
    };

    const listThreads = async (
        filters?: Parameters<
            AiAgentModel['findAdminThreadsPaginated']
        >[0]['filters'],
    ) => {
        const { data } = await model.findAdminThreadsPaginated({
            organizationUuid,
            paginateArgs: { page: 1, pageSize: 50 },
            filters: { agentUuids: [agentUuid], ...filters },
        });
        return data.threads;
    };

    beforeAll(async () => {
        const context = getTestContext();
        database = context.db;
        model = getModels(context.app).aiAgentModel;

        const agent = await model.createAgent({
            name: `admin thread list ${Date.now()}`,
            description: null,
            projectUuid: SEED_PROJECT.project_uuid,
            organizationUuid,
            tags: null,
            integrations: [],
            instruction: null,
            imageUrl: null,
            groupAccess: [],
            userAccess: [],
            spaceAccess: [],
            enableDataAccess: false,
            enableSelfImprovement: false,
            version: 1,
        });
        agentUuid = agent.uuid;

        const firstTurnAt = new Date('2026-01-01T10:00:00Z');
        ratedThreadUuid = await createThread(firstTurnAt);
        // Two prompts share the earliest timestamp.
        await createPrompt(ratedThreadUuid, {
            text: 'first question',
            userUuid: SEED_ORG_1_EDITOR.user_uuid,
            createdAt: firstTurnAt,
            humanScore: 1,
        });
        await createPrompt(ratedThreadUuid, {
            text: 'first question',
            userUuid: SEED_ORG_1_EDITOR.user_uuid,
            createdAt: firstTurnAt,
            humanScore: -1,
        });
        await createPrompt(ratedThreadUuid, {
            text: 'follow up',
            userUuid: SEED_ORG_1_VIEWER.user_uuid,
            createdAt: new Date('2026-01-01T10:05:00Z'),
        });

        unratedThreadUuid = await createThread(
            new Date('2026-01-02T10:00:00Z'),
        );
        await createPrompt(unratedThreadUuid, {
            text: 'another question',
            userUuid: SEED_ORG_1_VIEWER.user_uuid,
            createdAt: new Date('2026-01-02T10:00:00Z'),
        });
    });

    afterAll(async () => {
        await database(AiAgentTableName)
            .where('ai_agent_uuid', agentUuid)
            .delete();
    });

    it('returns each thread once, newest first', async () => {
        const threads = await listThreads();

        expect(threads.map((thread) => thread.uuid)).toEqual([
            unratedThreadUuid,
            ratedThreadUuid,
        ]);
    });

    it('describes a thread by its first prompt', async () => {
        const threads = await listThreads();
        const rated = threads.find((thread) => thread.uuid === ratedThreadUuid);

        expect(rated?.title).toBe('first question');
        expect(rated?.user.uuid).toBe(SEED_ORG_1_EDITOR.user_uuid);
    });

    it('counts prompts and feedback per thread', async () => {
        const threads = await listThreads();
        const rated = threads.find((thread) => thread.uuid === ratedThreadUuid);
        const unrated = threads.find(
            (thread) => thread.uuid === unratedThreadUuid,
        );

        expect(rated?.promptCount).toBe(3);
        expect(rated?.feedbackSummary).toEqual({
            upvotes: 1,
            downvotes: 1,
            neutral: 0,
            total: 2,
        });
        expect(unrated?.promptCount).toBe(1);
        expect(unrated?.feedbackSummary).toEqual({
            upvotes: 0,
            downvotes: 0,
            neutral: 0,
            total: 0,
        });
    });

    it('filters by the user who started the thread', async () => {
        const threads = await listThreads({
            userUuids: [SEED_ORG_1_VIEWER.user_uuid],
        });

        expect(threads.map((thread) => thread.uuid)).toEqual([
            unratedThreadUuid,
        ]);
    });

    it('filters by feedback score', async () => {
        const threads = await listThreads({ humanScore: -1 });

        expect(threads.map((thread) => thread.uuid)).toEqual([ratedThreadUuid]);
    });
});
