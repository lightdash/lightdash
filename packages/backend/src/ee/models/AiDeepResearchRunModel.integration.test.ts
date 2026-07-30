import {
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    type AiDeepResearchBudget,
    type AiDeepResearchExecutionContextSnapshot,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { getTestContext } from '../../vitest.setup.integration';
import {
    AiAgentToolCallTableName,
    AiAgentToolResultTableName,
    AiPromptTableName,
    AiSqlApprovalTableName,
    AiThreadTableName,
    type AiAgentToolCallTable,
    type AiAgentToolResultTable,
    type AiPromptTable,
    type AiSqlApprovalTable,
    type AiThreadTable,
} from '../database/entities/ai';
import {
    AiAgentTableName,
    type AiAgentTable,
} from '../database/entities/aiAgent';
import {
    AiDeepResearchAnalyticsOutboxTableName,
    AiDeepResearchEventsTableName,
    AiDeepResearchRunsTableName,
    type DbAiDeepResearchRun,
} from '../database/entities/aiDeepResearch';
import { AiDeepResearchRunModel } from './AiDeepResearchRunModel';

const budget: AiDeepResearchBudget = {
    maxTokens: 10_000_000,
    maxToolCalls: 20,
    maxWarehouseQueries: 10,
    maxResultRows: 1_000,
    maxHypotheses: 2,
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
        attachedMcpServers: [],
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
    const additionalPromptUuids = new Set<string>();

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
        if (runUuids.size > 0) {
            await database(AiDeepResearchRunsTableName)
                .whereIn('ai_deep_research_run_uuid', [...runUuids])
                .delete();
            runUuids.clear();
        }
        if (additionalPromptUuids.size > 0) {
            await database(AiPromptTableName)
                .whereIn('ai_prompt_uuid', [...additionalPromptUuids])
                .delete();
            additionalPromptUuids.clear();
        }
    });

    const createRun = async (
        dimensions: {
            entryPoint?: 'homepage' | 'ask_ai';
            promptUuid?: string;
        } = {},
    ): Promise<DbAiDeepResearchRun> => {
        const run = await model.create({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            agentUuid,
            aiThreadUuid: threadUuid,
            promptUuid: dimensions.promptUuid ?? promptUuid,
            toolCallId: null,
            prompt: `Integration race ${crypto.randomUUID()}`,
            entryPoint: dimensions.entryPoint ?? 'ask_ai',
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

    const createAdditionalPrompt = async (): Promise<string> => {
        const [prompt] = await database<AiPromptTable>(AiPromptTableName)
            .insert({
                ai_thread_uuid: threadUuid,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                prompt: `Deep Research integration prompt ${crypto.randomUUID()}`,
            })
            .returning('ai_prompt_uuid');
        additionalPromptUuids.add(prompt.ai_prompt_uuid);
        return prompt.ai_prompt_uuid;
    };

    const getAnalyticsOutbox = async (runUuid: string) =>
        database(AiDeepResearchAnalyticsOutboxTableName)
            .select('event_type', 'terminal_reason')
            .where('ai_deep_research_run_uuid', runUuid)
            .orderBy('created_at', 'asc');

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

    it('round-trips the persisted entry point', async () => {
        const run = await createRun({
            entryPoint: 'homepage',
        });

        expect(run).toMatchObject({
            entry_point: 'homepage',
        });
        expect(
            await model.findByUuid(run.ai_deep_research_run_uuid),
        ).toMatchObject({
            entry_point: 'homepage',
        });
    });

    it('records one accepted-run outbox event across retries', async () => {
        const run = await createRun();

        await Promise.all([
            model.recordRunAccepted(run.ai_deep_research_run_uuid),
            model.recordRunAccepted(run.ai_deep_research_run_uuid),
        ]);

        expect(await getAnalyticsOutbox(run.ai_deep_research_run_uuid)).toEqual(
            [{ event_type: 'run_started', terminal_reason: null }],
        );
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
        expect(await getAnalyticsOutbox(run.ai_deep_research_run_uuid)).toEqual(
            [
                {
                    event_type: 'run_completed',
                    terminal_reason:
                        terminalRun?.status === 'completed'
                            ? null
                            : 'user_cancellation',
                },
            ],
        );
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

    it.each(['completed', 'partially_completed'] as const)(
        'persists a 30-day expiry for a successfully %s report',
        async (status) => {
            const run = await createRun();
            await model.claimQueuedRun(run.ai_deep_research_run_uuid);

            if (status === 'completed') {
                await model.markCompleted(
                    run.ai_deep_research_run_uuid,
                    report,
                    {},
                );
            } else {
                await model.markPartiallyCompleted(
                    run.ai_deep_research_run_uuid,
                    report,
                    {},
                    'query_limit',
                );
            }

            const persisted = await model.findByUuid(
                run.ai_deep_research_run_uuid,
            );
            expect(persisted?.status).toBe(status);
            expect(persisted?.report_expired_at).toBeNull();
            expect(
                persisted!.report_expires_at!.getTime() -
                    persisted!.completed_at!.getTime(),
            ).toBe(30 * 24 * 60 * 60 * 1_000);
        },
    );

    it('scrubs only expired run data, supports legacy null expiries, and is idempotent under contention', async () => {
        const expiredRun = await createRun();
        const futurePromptUuid = await createAdditionalPrompt();
        const futureRun = await createRun({ promptUuid: futurePromptUuid });
        const expiredToolCallId = `expired-${crypto.randomUUID()}`;
        const futureToolCallId = `future-${crypto.randomUUID()}`;
        const unrelatedToolCallId = `unrelated-${crypto.randomUUID()}`;

        await database(AiDeepResearchRunsTableName)
            .where(
                'ai_deep_research_run_uuid',
                expiredRun.ai_deep_research_run_uuid,
            )
            .update({
                status: 'completed',
                result_markdown: 'expired report',
                result_chart_data: JSON.stringify({}),
                completed_at: database.raw("now() - interval '31 days'"),
                report_expires_at: null,
            });
        await database(AiDeepResearchRunsTableName)
            .where(
                'ai_deep_research_run_uuid',
                futureRun.ai_deep_research_run_uuid,
            )
            .update({
                status: 'completed',
                result_markdown: 'future report',
                result_chart_data: JSON.stringify({}),
                completed_at: database.raw("now() - interval '1 day'"),
                report_expires_at: database.raw("now() + interval '29 days'"),
            });

        await database<AiAgentToolCallTable>(AiAgentToolCallTableName).insert([
            {
                ai_prompt_uuid: promptUuid,
                tool_call_id: expiredToolCallId,
                tool_name: 'runSql',
                tool_args: {},
                ai_mcp_server_uuid: null,
                parent_tool_call_id: `deep-research:${expiredRun.ai_deep_research_run_uuid}:investigation:1`,
            },
            {
                ai_prompt_uuid: futurePromptUuid,
                tool_call_id: futureToolCallId,
                tool_name: 'runSql',
                tool_args: {},
                ai_mcp_server_uuid: null,
                parent_tool_call_id: `deep-research:${futureRun.ai_deep_research_run_uuid}:investigation:1`,
            },
            {
                ai_prompt_uuid: promptUuid,
                tool_call_id: unrelatedToolCallId,
                tool_name: 'runSql',
                tool_args: {},
                ai_mcp_server_uuid: null,
                parent_tool_call_id: null,
            },
        ]);
        await database<AiAgentToolResultTable>(
            AiAgentToolResultTableName,
        ).insert(
            [
                { promptUuid, toolCallId: expiredToolCallId },
                {
                    promptUuid: futurePromptUuid,
                    toolCallId: futureToolCallId,
                },
                { promptUuid, toolCallId: unrelatedToolCallId },
            ].map(({ promptUuid: toolPromptUuid, toolCallId }) => ({
                ai_prompt_uuid: toolPromptUuid,
                tool_call_id: toolCallId,
                tool_name: 'runSql',
                result: JSON.stringify({ rows: [{ value: 1 }] }),
            })),
        );
        await database<AiSqlApprovalTable>(AiSqlApprovalTableName).insert({
            tool_call_id: expiredToolCallId,
            decision: 'approved',
        });

        try {
            expect(
                await database(AiAgentToolCallTableName)
                    .where('ai_prompt_uuid', promptUuid)
                    .where(
                        'parent_tool_call_id',
                        'like',
                        `deep-research:${expiredRun.ai_deep_research_run_uuid}:%`,
                    )
                    .pluck('tool_call_id'),
            ).toEqual([expiredToolCallId]);

            const results = await Promise.all([
                model.cleanExpiredReports(100),
                model.cleanExpiredReports(100),
            ]);

            expect(
                results.reduce((sum, result) => sum + result.expired, 0),
            ).toBe(1);
            expect(results.every((result) => result.failed === 0)).toBe(true);
            expect(
                await model.findByPromptUuidsScoped({
                    promptUuids: [promptUuid, futurePromptUuid],
                    organizationUuid: SEED_ORG_1.organization_uuid,
                    projectUuid: SEED_PROJECT.project_uuid,
                }),
            ).toEqual([
                {
                    prompt_uuid: futurePromptUuid,
                    result_markdown: 'future report',
                },
            ]);
            expect(
                await model.findReportByUuidThreadScoped({
                    aiDeepResearchRunUuid: expiredRun.ai_deep_research_run_uuid,
                    aiThreadUuid: threadUuid,
                    organizationUuid: SEED_ORG_1.organization_uuid,
                    projectUuid: SEED_PROJECT.project_uuid,
                    createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                }),
            ).toBeUndefined();
            expect(
                await model.findReportSummariesByThreadScoped({
                    aiThreadUuid: threadUuid,
                    organizationUuid: SEED_ORG_1.organization_uuid,
                    projectUuid: SEED_PROJECT.project_uuid,
                    createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                }),
            ).toEqual([
                expect.objectContaining({
                    ai_deep_research_run_uuid:
                        futureRun.ai_deep_research_run_uuid,
                }),
            ]);

            const persistedExpired = await model.findByUuid(
                expiredRun.ai_deep_research_run_uuid,
            );
            expect(persistedExpired).toMatchObject({
                result_markdown: null,
                result_chart_data: null,
            });
            expect(persistedExpired?.report_expires_at).not.toBeNull();
            expect(persistedExpired?.report_expired_at).not.toBeNull();
            expect(
                (
                    await database(AiAgentToolCallTableName)
                        .whereIn('tool_call_id', [
                            expiredToolCallId,
                            futureToolCallId,
                            unrelatedToolCallId,
                        ])
                        .pluck('tool_call_id')
                ).sort(),
            ).toEqual([futureToolCallId, unrelatedToolCallId].sort());
            expect(
                (
                    await database(AiAgentToolResultTableName)
                        .whereIn('tool_call_id', [
                            expiredToolCallId,
                            futureToolCallId,
                            unrelatedToolCallId,
                        ])
                        .pluck('tool_call_id')
                ).sort(),
            ).toEqual([futureToolCallId, unrelatedToolCallId].sort());
            expect(
                await database(AiSqlApprovalTableName)
                    .where('tool_call_id', expiredToolCallId)
                    .first(),
            ).toBeDefined();
            expect(await model.cleanExpiredReports(100)).toEqual({
                scanned: 0,
                expired: 0,
                failed: 0,
            });
        } finally {
            await database(AiSqlApprovalTableName)
                .where('tool_call_id', expiredToolCallId)
                .delete();
        }
    });

    it('rolls provenance deletion back when scrubbing the report fails', async () => {
        const run = await createRun();
        const toolCallId = `rollback-${crypto.randomUUID()}`;
        const triggerName = `fail_report_cleanup_${crypto.randomUUID().replaceAll('-', '')}`;
        const functionName = `${triggerName}_fn`;

        await database(AiDeepResearchRunsTableName)
            .where('ai_deep_research_run_uuid', run.ai_deep_research_run_uuid)
            .update({
                status: 'completed',
                result_markdown: 'must survive',
                result_chart_data: JSON.stringify({}),
                completed_at: database.raw("now() - interval '31 days'"),
                report_expires_at: database.raw("now() - interval '1 day'"),
            });
        await database<AiAgentToolCallTable>(AiAgentToolCallTableName).insert({
            ai_prompt_uuid: promptUuid,
            tool_call_id: toolCallId,
            tool_name: AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
            tool_args: {},
            ai_mcp_server_uuid: null,
            parent_tool_call_id: null,
        });
        await database<AiAgentToolResultTable>(
            AiAgentToolResultTableName,
        ).insert({
            ai_prompt_uuid: promptUuid,
            tool_call_id: toolCallId,
            tool_name: AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
            result: JSON.stringify({ report: 'must survive' }),
        });

        try {
            await database.raw(`
                create function ${functionName}() returns trigger as $$
                begin
                    if old.ai_deep_research_run_uuid = '${run.ai_deep_research_run_uuid}' then
                        raise exception 'forced cleanup failure';
                    end if;
                    return new;
                end;
                $$ language plpgsql;
                create trigger ${triggerName}
                before update on ${AiDeepResearchRunsTableName}
                for each row execute function ${functionName}();
            `);

            expect(await model.cleanExpiredReports(100)).toEqual({
                scanned: 1,
                expired: 0,
                failed: 1,
            });
            expect(
                await model.findByUuid(run.ai_deep_research_run_uuid),
            ).toMatchObject({ result_markdown: 'must survive' });
            expect(
                await database(AiAgentToolCallTableName)
                    .where('tool_call_id', toolCallId)
                    .first(),
            ).toBeDefined();
            expect(
                await database(AiAgentToolResultTableName)
                    .where('tool_call_id', toolCallId)
                    .first(),
            ).toBeDefined();
        } finally {
            await database.raw(
                `drop trigger if exists ${triggerName} on ${AiDeepResearchRunsTableName}`,
            );
            await database.raw(`drop function if exists ${functionName}()`);
        }
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
        expect(await getAnalyticsOutbox(run.ai_deep_research_run_uuid)).toEqual(
            [
                {
                    event_type: 'run_completed',
                    terminal_reason: 'internal_error',
                },
            ],
        );
    });
});
