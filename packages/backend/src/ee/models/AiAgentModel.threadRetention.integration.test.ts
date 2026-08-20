import { SEED_ORG_1, SEED_PROJECT } from '@lightdash/common';
import { type Knex } from 'knex';
import { getModels, getTestContext } from '../../vitest.setup.integration';
import {
    AiAgentToolCallTableName,
    AiOrganizationSettingsTableName,
    AiPromptTableName,
    AiSqlApprovalTableName,
    AiThreadTableName,
    AiWritebackRunTableName,
    type AiPromptTable,
    type AiThreadTable,
    type AiWritebackRunTable,
    type DbAiOrganizationSettings,
} from '../database/entities/ai';
import {
    AiAgentTableName,
    type AiAgentTable,
} from '../database/entities/aiAgent';
import {
    AiAgentMemoryTableName,
    type AiAgentMemoryTable,
} from '../database/entities/aiAgentMemory';
import { AiDeepResearchRunsTableName } from '../database/entities/aiDeepResearch';
import { type AiAgentModel } from './AiAgentModel';

describe('AiAgentModel thread retention integration', () => {
    let database: Knex;
    let model: AiAgentModel;
    let userUuid = '';
    const agentUuids: string[] = [];
    const agentlessThreadUuids: string[] = [];
    let hadOrgSettingsRow = false;
    let previousOrgRetention: number | null = null;

    const createAgent = async (threadRetentionHours: number | null) => {
        const [agent] = await database<AiAgentTable>(AiAgentTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                name: `retention-test-agent-${agentUuids.length}`,
                slug: `retention-test-agent-${Date.now()}-${agentUuids.length}`,
                description: null,
                image_url: null,
                image_url_source: null,
                tags: null,
                enable_data_access: false,
                enable_self_improvement: false,
                enable_content_tools: false,
                enable_user_context: false,
                enable_sql_mode: false,
                admin_only: false,
                model_config: null,
                is_system: false,
                version: 2,
                thread_retention_hours: threadRetentionHours,
            })
            .returning('*');
        agentUuids.push(agent.ai_agent_uuid);
        return agent.ai_agent_uuid;
    };

    const createThread = async (
        agentUuid: string | null,
        lastActivityHoursAgo: number,
    ) => {
        const [thread] = await database<AiThreadTable>(AiThreadTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                created_from: 'web_app',
                agent_uuid: agentUuid,
            })
            .returning('*');
        await database.raw(
            `UPDATE ${AiThreadTableName}
             SET created_at = now() - make_interval(hours => :hours),
                 updated_at = now() - make_interval(hours => :hours)
             WHERE ai_thread_uuid = :threadUuid`,
            { hours: lastActivityHoursAgo, threadUuid: thread.ai_thread_uuid },
        );
        if (agentUuid === null) {
            agentlessThreadUuids.push(thread.ai_thread_uuid);
        }
        return thread.ai_thread_uuid;
    };

    const addPrompt = async (
        threadUuid: string,
        options: { responded: boolean; createdHoursAgo: number },
    ) => {
        const [prompt] = await database<AiPromptTable>(AiPromptTableName)
            .insert({
                ai_thread_uuid: threadUuid,
                created_by_user_uuid: userUuid,
                prompt: 'retention test prompt',
            })
            .returning('*');
        await database.raw(
            `UPDATE ${AiPromptTableName}
             SET created_at = now() - make_interval(hours => :hours)
                 ${options.responded ? ", response = 'done'" : ''}
             WHERE ai_prompt_uuid = :promptUuid`,
            {
                hours: options.createdHoursAgo,
                promptUuid: prompt.ai_prompt_uuid,
            },
        );
        return prompt.ai_prompt_uuid;
    };

    const addRunSqlToolCall = async (promptUuid: string) => {
        const toolCallId = `retention-test-tool-call-${Date.now()}-${Math.random()}`;
        await database(AiAgentToolCallTableName).insert({
            ai_prompt_uuid: promptUuid,
            tool_call_id: toolCallId,
            tool_name: 'runSql',
            tool_args: { sql: 'SELECT 1' },
            ai_mcp_server_uuid: null,
            parent_tool_call_id: null,
        });
        return toolCallId;
    };

    const addDeepResearchRun = async (
        agentUuid: string,
        threadUuid: string,
        promptUuid: string,
        options: { status: 'running' | 'completed' },
    ) => {
        await database.raw(
            `INSERT INTO ${AiDeepResearchRunsTableName}
                (organization_uuid, project_uuid, created_by_user_uuid,
                 agent_uuid, ai_thread_uuid, prompt_uuid, prompt, entry_point,
                 budget_snapshot, execution_context_snapshot, status)
             VALUES
                (:organizationUuid, :projectUuid, :userUuid, :agentUuid,
                 :threadUuid, :promptUuid, 'retention test research', 'ask_ai',
                 '{}'::jsonb, '{}'::jsonb, :status)`,
            {
                organizationUuid: SEED_ORG_1.organization_uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                userUuid,
                agentUuid,
                threadUuid,
                promptUuid,
                status: options.status,
            },
        );
    };

    const addMemory = async (agentUuid: string, sourceThreadUuid: string) => {
        await database<AiAgentMemoryTable>(AiAgentMemoryTableName).insert({
            organization_uuid: SEED_ORG_1.organization_uuid,
            project_uuid: SEED_PROJECT.project_uuid,
            agent_uuid: agentUuid,
            user_uuid: userUuid,
            source_thread_uuid: sourceThreadUuid,
            slug: `retention-test-memory-${Date.now()}`,
            title: 'Retention test memory',
            raw_memory: 'derived fact',
            thread_summary: null,
            generated_at: new Date(),
            scope: 'user',
            terms: JSON.stringify([]),
            objects: JSON.stringify([]),
            unresolved_objects: JSON.stringify([]),
        });
    };

    const threadExists = async (threadUuid: string) => {
        const row = await database(AiThreadTableName)
            .where('ai_thread_uuid', threadUuid)
            .first();
        return row !== undefined;
    };

    const setOrgRetention = async (hours: number | null) => {
        const existing = await database<DbAiOrganizationSettings>(
            AiOrganizationSettingsTableName,
        )
            .where('organization_uuid', SEED_ORG_1.organization_uuid)
            .first();
        if (existing) {
            await database(AiOrganizationSettingsTableName)
                .where('organization_uuid', SEED_ORG_1.organization_uuid)
                .update({ thread_retention_hours: hours });
        } else {
            await database(AiOrganizationSettingsTableName).insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                ai_agents_visible: true,
                thread_retention_hours: hours,
            });
        }
    };

    beforeAll(async () => {
        const ctx = getTestContext();
        database = ctx.db;
        model = getModels(ctx.app).aiAgentModel;
        userUuid = ctx.testUser.userUuid;

        const existingSettings = await database<DbAiOrganizationSettings>(
            AiOrganizationSettingsTableName,
        )
            .where('organization_uuid', SEED_ORG_1.organization_uuid)
            .first();
        hadOrgSettingsRow = existingSettings !== undefined;
        previousOrgRetention = existingSettings?.thread_retention_hours ?? null;
    });

    afterEach(async () => {
        await setOrgRetention(null);
    });

    afterAll(async () => {
        if (hadOrgSettingsRow) {
            await database(AiOrganizationSettingsTableName)
                .where('organization_uuid', SEED_ORG_1.organization_uuid)
                .update({ thread_retention_hours: previousOrgRetention });
        } else {
            await database(AiOrganizationSettingsTableName)
                .where('organization_uuid', SEED_ORG_1.organization_uuid)
                .delete();
        }
        await database(AiAgentMemoryTableName)
            .whereIn('agent_uuid', agentUuids)
            .delete();
        await database(AiThreadTableName)
            .whereIn('ai_thread_uuid', agentlessThreadUuids)
            .delete();
        // Cascades to any remaining threads/prompts.
        await database(AiAgentTableName)
            .whereIn('ai_agent_uuid', agentUuids)
            .delete();
    });

    it('deletes threads inactive beyond the agent window, along with derived memories', async () => {
        const agentUuid = await createAgent(1);
        const expiredThread = await createThread(agentUuid, 3);
        await addPrompt(expiredThread, { responded: true, createdHoursAgo: 3 });
        await addMemory(agentUuid, expiredThread);
        const activeThread = await createThread(agentUuid, 0);
        await addPrompt(activeThread, { responded: true, createdHoursAgo: 0 });

        const result = await model.deleteExpiredThreads(
            SEED_ORG_1.organization_uuid,
            100,
        );

        expect(result.deletedThreadUuids).toContain(expiredThread);
        expect(result.deletedThreadUuids).not.toContain(activeThread);
        expect(result.deletedMemoriesCount).toBe(1);
        expect(await threadExists(expiredThread)).toBe(false);
        expect(await threadExists(activeThread)).toBe(true);
    });

    it('keeps a thread whose only recent activity is a prompt, even when the thread timestamps are stale', async () => {
        const agentUuid = await createAgent(1);
        const threadUuid = await createThread(agentUuid, 48);
        await addPrompt(threadUuid, { responded: true, createdHoursAgo: 0 });

        const result = await model.deleteExpiredThreads(
            SEED_ORG_1.organization_uuid,
            100,
        );

        expect(result.deletedThreadUuids).not.toContain(threadUuid);
        expect(await threadExists(threadUuid)).toBe(true);
    });

    it('keeps an inactive thread with a recent unanswered prompt, but not an abandoned one', async () => {
        const agentUuid = await createAgent(1);
        const pendingThread = await createThread(agentUuid, 3);
        await addPrompt(pendingThread, {
            responded: false,
            createdHoursAgo: 2,
        });

        const abandonedThread = await createThread(agentUuid, 30);
        await addPrompt(abandonedThread, {
            responded: false,
            createdHoursAgo: 30,
        });

        const result = await model.deleteExpiredThreads(
            SEED_ORG_1.organization_uuid,
            100,
        );

        expect(result.deletedThreadUuids).not.toContain(pendingThread);
        expect(result.deletedThreadUuids).toContain(abandonedThread);
    });

    it('keeps a thread waiting on SQL approval no matter how old, and removes the approval decision when the thread is deleted', async () => {
        const agentUuid = await createAgent(1);
        const waitingThread = await createThread(agentUuid, 30);
        const waitingPrompt = await addPrompt(waitingThread, {
            responded: false,
            createdHoursAgo: 30,
        });
        await addRunSqlToolCall(waitingPrompt);

        const decidedThread = await createThread(agentUuid, 30);
        const decidedPrompt = await addPrompt(decidedThread, {
            responded: false,
            createdHoursAgo: 30,
        });
        const decidedToolCallId = await addRunSqlToolCall(decidedPrompt);
        await database(AiSqlApprovalTableName).insert({
            tool_call_id: decidedToolCallId,
            decision: 'approved',
            decided_by_user_uuid: userUuid,
        });

        const result = await model.deleteExpiredThreads(
            SEED_ORG_1.organization_uuid,
            100,
        );

        expect(result.deletedThreadUuids).not.toContain(waitingThread);
        // Approved but never resumed for 30h — the run is dead, not live.
        expect(result.deletedThreadUuids).toContain(decidedThread);
        const orphanedApproval = await database(AiSqlApprovalTableName)
            .where('tool_call_id', decidedToolCallId)
            .first();
        expect(orphanedApproval).toBeUndefined();
    });

    it('keeps a thread with a deep research run in a non-terminal state', async () => {
        const agentUuid = await createAgent(1);

        const runningThread = await createThread(agentUuid, 30);
        const runningPrompt = await addPrompt(runningThread, {
            responded: true,
            createdHoursAgo: 30,
        });
        await addDeepResearchRun(agentUuid, runningThread, runningPrompt, {
            status: 'running',
        });

        const finishedThread = await createThread(agentUuid, 30);
        const finishedPrompt = await addPrompt(finishedThread, {
            responded: true,
            createdHoursAgo: 30,
        });
        await addDeepResearchRun(agentUuid, finishedThread, finishedPrompt, {
            status: 'completed',
        });

        const result = await model.deleteExpiredThreads(
            SEED_ORG_1.organization_uuid,
            100,
        );

        expect(result.deletedThreadUuids).not.toContain(runningThread);
        expect(result.deletedThreadUuids).toContain(finishedThread);
    });

    it('keeps a thread with a writeback run in a non-terminal state', async () => {
        const agentUuid = await createAgent(1);
        const runningThread = await createThread(agentUuid, 30);
        await database<AiWritebackRunTable>(AiWritebackRunTableName).insert({
            organization_uuid: SEED_ORG_1.organization_uuid,
            project_uuid: SEED_PROJECT.project_uuid,
            ai_thread_uuid: runningThread,
            created_by_user_uuid: userUuid,
            source: 'web',
            status: 'pending',
        });

        const finishedThread = await createThread(agentUuid, 30);
        await database<AiWritebackRunTable>(AiWritebackRunTableName).insert({
            organization_uuid: SEED_ORG_1.organization_uuid,
            project_uuid: SEED_PROJECT.project_uuid,
            ai_thread_uuid: finishedThread,
            created_by_user_uuid: userUuid,
            source: 'web',
            status: 'ready',
        });

        const result = await model.deleteExpiredThreads(
            SEED_ORG_1.organization_uuid,
            100,
        );

        expect(result.deletedThreadUuids).not.toContain(runningThread);
        expect(result.deletedThreadUuids).toContain(finishedThread);
    });

    it('applies the org default to agents without a window and the smaller of the two otherwise', async () => {
        await setOrgRetention(24);
        const inheritingAgent = await createAgent(null);
        const expiredByOrg = await createThread(inheritingAgent, 25);
        const withinOrgWindow = await createThread(inheritingAgent, 2);

        const tighterAgent = await createAgent(1);
        const expiredByAgent = await createThread(tighterAgent, 2);

        const result = await model.deleteExpiredThreads(
            SEED_ORG_1.organization_uuid,
            100,
        );

        expect(result.deletedThreadUuids).toContain(expiredByOrg);
        expect(result.deletedThreadUuids).not.toContain(withinOrgWindow);
        expect(result.deletedThreadUuids).toContain(expiredByAgent);
    });

    it('applies the org default to threads with no agent at all', async () => {
        await setOrgRetention(24);
        const orphanExpired = await createThread(null, 25);
        const orphanActive = await createThread(null, 2);

        const result = await model.deleteExpiredThreads(
            SEED_ORG_1.organization_uuid,
            100,
        );

        expect(result.deletedThreadUuids).toContain(orphanExpired);
        expect(result.deletedThreadUuids).not.toContain(orphanActive);
    });

    it('deletes nothing when neither agent nor org sets a window', async () => {
        await setOrgRetention(null);
        const agentUuid = await createAgent(null);
        const oldThread = await createThread(agentUuid, 24 * 365);

        const result = await model.deleteExpiredThreads(
            SEED_ORG_1.organization_uuid,
            100,
        );

        expect(result.deletedThreadUuids).not.toContain(oldThread);
        expect(await threadExists(oldThread)).toBe(true);
    });

    it('previews the impact of a hypothetical org window without deleting anything', async () => {
        const agentUuid = await createAgent(null);
        const oldThread = await createThread(agentUuid, 48);
        await createThread(agentUuid, 1);

        const preview = await model.countThreadsExpiredByOrgRetention(
            SEED_ORG_1.organization_uuid,
            24,
        );

        expect(preview.threadCount).toBeGreaterThanOrEqual(1);
        expect(preview.agentCount).toBeGreaterThanOrEqual(1);
        expect(await threadExists(oldThread)).toBe(true);
    });
});
