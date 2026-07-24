import {
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    type AiDeepResearchBudget,
    type AiDeepResearchExecutionContextSnapshot,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { getTestContext } from '../../vitest.setup.integration';
import {
    AiPromptTableName,
    AiThreadTableName,
    type AiPromptTable,
    type AiThreadTable,
} from '../database/entities/ai';
import {
    AiAgentTableName,
    type AiAgentTable,
} from '../database/entities/aiAgent';
import {
    AiDeepResearchEventsTableName,
    AiDeepResearchRunsTableName,
    type DbAiDeepResearchRun,
} from '../database/entities/aiDeepResearch';
import { AiDeepResearchRunModel } from './AiDeepResearchRunModel';

const budget: AiDeepResearchBudget = {
    maxTokens: 10_000,
    maxToolCalls: 20,
    maxWarehouseQueries: 10,
    maxResultRows: 1_000,
};

const executionContextSnapshot: AiDeepResearchExecutionContextSnapshot = {
    schemaVersion: 1,
    resolutionStage: 'preflight',
    capturedAt: '2026-07-24T10:00:00.000Z',
    agent: {
        uuid: 'placeholder',
        name: 'Research agent',
        version: 2,
        updatedAt: '2026-07-24T09:00:00.000Z',
        hasInstruction: false,
        tags: null,
        spaceAccess: [],
        enableDataAccess: true,
        enableSelfImprovement: false,
        enableContentTools: true,
        enableUserContext: false,
    },
    model: {
        provider: null,
        modelName: null,
        reasoningEnabled: null,
        keyManagement: null,
    },
    tools: {
        availableToolNames: [],
        selectedMcpServers: [],
    },
    knowledgeDocuments: [],
    repository: {
        projectContextEnabled: null,
        aiWritebackEnabled: null,
        codingAgentEnabled: null,
        previewDeploySetupEnabled: null,
        repoDiscoveryEnabled: null,
        repoFsRoot: null,
        repoFsSupportsCodeSearch: null,
        availableSkillNames: [],
    },
    effectivePermissions: {
        canManageAgent: false,
        canRunSql: true,
        canUseDataTools: true,
        canUseContentTools: true,
        canUseSelfImprovementTools: false,
        autoApproveSql: true,
    },
};

const report =
    'Intro.\n\n## Finding\n\n<confidence level="high">ok</confidence>\n\n## Conclusion\n\n- done';

describe('AiDeepResearchRunModel integration', () => {
    let database: Knex;
    let model: AiDeepResearchRunModel;
    let agentUuid = '';
    let threadUuid = '';
    let promptUuid = '';
    const runUuids = new Set<string>();

    beforeAll(async () => {
        database = getTestContext().db;
        model = new AiDeepResearchRunModel({ database });
        const [agent] = await database<AiAgentTable>(AiAgentTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                name: 'Deep Research integration agent',
                slug: `deep-research-integration-${crypto.randomUUID()}`,
                description: null,
                image_url: null,
                image_url_source: null,
                tags: null,
                enable_data_access: true,
                enable_self_improvement: false,
                enable_content_tools: true,
                enable_user_context: false,
                admin_only: false,
                model_config: null,
                is_system: false,
                version: 2,
            })
            .returning('ai_agent_uuid');
        agentUuid = agent.ai_agent_uuid;

        const [thread] = await database<AiThreadTable>(AiThreadTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                created_from: 'web_app',
                agent_uuid: agentUuid,
            })
            .returning('ai_thread_uuid');
        threadUuid = thread.ai_thread_uuid;

        const [prompt] = await database<AiPromptTable>(AiPromptTableName)
            .insert({
                ai_thread_uuid: threadUuid,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                prompt: 'Deep Research integration prompt',
            })
            .returning('ai_prompt_uuid');
        promptUuid = prompt.ai_prompt_uuid;
    });

    afterAll(async () => {
        if (promptUuid) {
            await database(AiPromptTableName)
                .where('ai_prompt_uuid', promptUuid)
                .delete();
        }
        if (threadUuid) {
            await database(AiThreadTableName)
                .where('ai_thread_uuid', threadUuid)
                .delete();
        }
        if (agentUuid) {
            await database(AiAgentTableName)
                .where('ai_agent_uuid', agentUuid)
                .delete();
        }
    });

    afterEach(async () => {
        if (runUuids.size === 0) {
            return;
        }
        await database(AiDeepResearchRunsTableName)
            .whereIn('ai_deep_research_run_uuid', [...runUuids])
            .delete();
        runUuids.clear();
    });

    const createRun = async (): Promise<DbAiDeepResearchRun> => {
        const run = await model.create({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            agentUuid,
            aiThreadUuid: threadUuid,
            promptUuid,
            toolCallId: null,
            prompt: `Integration race ${crypto.randomUUID()}`,
            selectedMcpServerUuids: [],
            budget,
            executionContextSnapshot: {
                ...executionContextSnapshot,
                agent: {
                    ...executionContextSnapshot.agent,
                    uuid: agentUuid,
                },
            },
        });
        runUuids.add(run.ai_deep_research_run_uuid);
        return run;
    };

    const getEventSequence = async (runUuid: string): Promise<string[]> => {
        const events = await database(AiDeepResearchEventsTableName)
            .select('event_type', 'payload')
            .where('ai_deep_research_run_uuid', runUuid)
            .orderBy('created_at', 'asc')
            .orderBy('ai_deep_research_event_uuid', 'asc');
        return events.map(({ event_type: eventType, payload }) =>
            eventType === 'status_changed'
                ? `${eventType}:${String(payload.status)}`
                : eventType,
        );
    };

    it('allows exactly one worker to claim a queued run', async () => {
        const run = await createRun();

        const claims = await Promise.all([
            model.claimQueuedRun(run.ai_deep_research_run_uuid),
            model.claimQueuedRun(run.ai_deep_research_run_uuid),
        ]);

        expect(claims.filter(Boolean)).toHaveLength(1);
        expect(
            await model.findByUuid(run.ai_deep_research_run_uuid),
        ).toMatchObject({ status: 'running' });
        expect(await getEventSequence(run.ai_deep_research_run_uuid)).toEqual([
            'status_changed:queued',
            'status_changed:running',
        ]);
    });

    it('does not replay the cursor event when Postgres stores microseconds', async () => {
        const run = await createRun();
        const [event] = await model.listEvents({
            aiDeepResearchRunUuid: run.ai_deep_research_run_uuid,
            cursor: null,
            limit: 10,
        });

        expect(event.cursor_created_at).toMatch(/\.\d{6}$/);
        expect(
            await model.listEvents({
                aiDeepResearchRunUuid: run.ai_deep_research_run_uuid,
                cursor: {
                    createdAt: event.cursor_created_at,
                    eventUuid: event.ai_deep_research_event_uuid,
                },
                limit: 10,
            }),
        ).toEqual([]);
    });

    it('settles a claim and cancellation race without losing cancellation', async () => {
        const run = await createRun();

        await Promise.all([
            model.claimQueuedRun(run.ai_deep_research_run_uuid),
            model.requestCancellation(run.ai_deep_research_run_uuid),
        ]);

        const racedRun = await model.findByUuid(run.ai_deep_research_run_uuid);
        if (racedRun?.status === 'running') {
            expect(racedRun.cancellation_requested_at).not.toBeNull();
            await model.markCancelled(run.ai_deep_research_run_uuid);
        }

        expect(
            await model.findByUuid(run.ai_deep_research_run_uuid),
        ).toMatchObject({ status: 'cancelled' });
        expect(await getEventSequence(run.ai_deep_research_run_uuid)).toEqual(
            racedRun?.status === 'running'
                ? [
                      'status_changed:queued',
                      'status_changed:running',
                      'cancellation_requested',
                      'status_changed:cancelled',
                  ]
                : [
                      'status_changed:queued',
                      'cancellation_requested',
                      'status_changed:cancelled',
                  ],
        );
    });

    it('keeps completion and cancellation terminal under contention', async () => {
        const run = await createRun();
        await model.claimQueuedRun(run.ai_deep_research_run_uuid);

        await Promise.all([
            model.markCompleted(run.ai_deep_research_run_uuid, report, {}),
            model.requestCancellation(run.ai_deep_research_run_uuid),
        ]);

        const racedRun = await model.findByUuid(run.ai_deep_research_run_uuid);
        if (racedRun?.status === 'running') {
            expect(racedRun.cancellation_requested_at).not.toBeNull();
            await model.markCancelled(run.ai_deep_research_run_uuid);
        }

        const terminalRun = await model.findByUuid(
            run.ai_deep_research_run_uuid,
        );
        expect(['completed', 'cancelled']).toContain(terminalRun?.status);
        expect(await getEventSequence(run.ai_deep_research_run_uuid)).toEqual(
            terminalRun?.status === 'completed'
                ? [
                      'status_changed:queued',
                      'status_changed:running',
                      'status_changed:completed',
                  ]
                : [
                      'status_changed:queued',
                      'status_changed:running',
                      'cancellation_requested',
                      'status_changed:cancelled',
                  ],
        );
    });

    it('fails a stale running run and records one terminal event', async () => {
        const run = await createRun();
        await model.claimQueuedRun(run.ai_deep_research_run_uuid);
        await database(AiDeepResearchRunsTableName)
            .where('ai_deep_research_run_uuid', run.ai_deep_research_run_uuid)
            .update({ updated_at: database.raw("now() - interval '2 hours'") });

        const staleRuns = await model.markStaleRunsAsFailed(75, 'stale');

        expect(staleRuns).toHaveLength(1);
        expect(staleRuns[0]).toMatchObject({
            ai_deep_research_run_uuid: run.ai_deep_research_run_uuid,
            status: 'failed',
        });
        expect(await getEventSequence(run.ai_deep_research_run_uuid)).toEqual([
            'status_changed:queued',
            'status_changed:running',
            'status_changed:failed',
        ]);
    });
});
