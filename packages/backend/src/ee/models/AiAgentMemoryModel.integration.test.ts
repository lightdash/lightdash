import {
    CommercialFeatureFlags,
    FeatureFlags,
    ProjectType,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    type AiThreadCreatedFrom,
} from '@lightdash/common';
import type { Knex } from 'knex';
import { vi } from 'vitest';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { parseConfig } from '../../config/parseConfig';
import {
    FeatureFlagsTableName,
    type DbFeatureFlag,
    type FeatureFlagsTable,
} from '../../database/entities/featureFlags';
import {
    ProjectTableName,
    type DbProject,
} from '../../database/entities/projects';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { getTestContext } from '../../vitest.setup.integration';
import {
    AiPromptInterruptTableName,
    AiPromptTableName,
    AiThreadTableName,
    type DbAiPrompt,
} from '../database/entities/ai';
import {
    AiAgentMemoryTableName,
    AiAgentThreadDistillTableName,
} from '../database/entities/aiAgentMemory';
import { CommercialSchedulerClient } from '../scheduler/SchedulerClient';
import {
    AiAgentMemoryService,
    type AiAgentMemoryDistillCall,
} from '../services/AiAgentMemoryService/AiAgentMemoryService';
import { AiAgentMemoryModel } from './AiAgentMemoryModel';
import { CommercialFeatureFlagModel } from './CommercialFeatureFlagModel';

describe('AiAgentMemoryModel integration', () => {
    let database: Knex;
    let model: AiAgentMemoryModel;
    let featureFlagService: FeatureFlagService;
    let schedulerClient: CommercialSchedulerClient;
    const originalFlags = new Map<string, DbFeatureFlag | undefined>();
    const threadUuids = new Set<string>();

    const setFeatureFlag = async (flagId: string, enabled: boolean) => {
        await database<FeatureFlagsTable>(FeatureFlagsTableName)
            .insert({ flag_id: flagId, default_enabled: enabled })
            .onConflict('flag_id')
            .merge({ default_enabled: enabled });
    };

    beforeAll(async () => {
        database = getTestContext().db;
        model = getTestContext()
            .app.getModels()
            .getAiAgentMemoryModel<AiAgentMemoryModel>();
        const lightdashConfig = parseConfig();
        if (!lightdashConfig.database.connectionUri) {
            throw new Error('PGCONNECTIONURI is required');
        }
        const testDatabaseUrl = new URL(lightdashConfig.database.connectionUri);
        testDatabaseUrl.pathname = `${testDatabaseUrl.pathname}_test`;
        lightdashConfig.database.connectionUri = testDatabaseUrl.toString();
        lightdashConfig.enabledFeatureFlags.delete(FeatureFlags.AiAgentMemory);
        lightdashConfig.disabledFeatureFlags.delete(FeatureFlags.AiAgentMemory);
        const featureFlagModel = new CommercialFeatureFlagModel({
            database,
            lightdashConfig,
        });
        featureFlagService = new FeatureFlagService({
            lightdashConfig,
            featureFlagModel,
        });
        schedulerClient = new CommercialSchedulerClient({
            lightdashConfig,
            analytics: new LightdashAnalytics({
                lightdashConfig,
                writeKey: 'notrack',
                dataPlaneUrl: 'notrack',
                options: { enable: false },
            }),
            schedulerModel: getTestContext()
                .app.getModels()
                .getSchedulerModel(),
            featureFlagModel,
        });
        await schedulerClient.graphileUtils;
        const flagIds = [
            FeatureFlags.AiAgentMemory,
            CommercialFeatureFlags.AiCopilot,
        ];
        const storedFlags = await Promise.all(
            flagIds.map((flagId) =>
                database<FeatureFlagsTable>(FeatureFlagsTableName)
                    .where('flag_id', flagId)
                    .first(),
            ),
        );
        flagIds.forEach((flagId, index) => {
            originalFlags.set(flagId, storedFlags[index]);
        });
        await Promise.all(
            flagIds.map((flagId) => setFeatureFlag(flagId, true)),
        );
    });

    afterEach(async () => {
        await setFeatureFlag(FeatureFlags.AiAgentMemory, true);
        if (threadUuids.size === 0) {
            return;
        }

        const ids = [...threadUuids];
        const graphileClient = await schedulerClient.graphileUtils;
        await graphileClient.withPgClient((client) =>
            client.query(
                'DELETE FROM graphile_worker.jobs WHERE key = ANY($1)',
                [ids.map((id) => `ai-agent-memory-distill:${id}`)],
            ),
        );
        await database(AiAgentMemoryTableName)
            .whereIn('source_thread_uuid', ids)
            .delete();
        await database(AiAgentThreadDistillTableName)
            .whereIn('ai_thread_uuid', ids)
            .delete();
        await database(AiThreadTableName)
            .whereIn('ai_thread_uuid', ids)
            .delete();
        threadUuids.clear();
    });

    afterAll(async () => {
        await Promise.all(
            [...originalFlags].map(([flagId, flag]) =>
                flag
                    ? database<FeatureFlagsTable>(FeatureFlagsTableName)
                          .insert({
                              flag_id: flag.flag_id,
                              default_enabled: flag.default_enabled,
                          })
                          .onConflict('flag_id')
                          .merge({ default_enabled: flag.default_enabled })
                    : database<FeatureFlagsTable>(FeatureFlagsTableName)
                          .where('flag_id', flagId)
                          .delete(),
            ),
        );
        const graphileClient = await schedulerClient.graphileUtils;
        await graphileClient.release();
    });

    const createThread = async (
        createdFrom: AiThreadCreatedFrom = 'web_app',
    ) => {
        const [thread] = await database(AiThreadTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                created_from: createdFrom,
                agent_uuid: null,
            })
            .returning('ai_thread_uuid');
        threadUuids.add(thread.ai_thread_uuid);
        return thread.ai_thread_uuid;
    };

    const createPrompt = async (
        threadUuid: string,
        createdAt: Date,
        successful = true,
        hidden = false,
    ) => {
        const [prompt] = await database<
            Pick<
                DbAiPrompt,
                | 'ai_thread_uuid'
                | 'created_by_user_uuid'
                | 'prompt'
                | 'response'
                | 'error_message'
                | 'responded_at'
                | 'created_at'
                | 'hidden'
            >
        >(AiPromptTableName)
            .insert({
                ai_thread_uuid: threadUuid,
                created_by_user_uuid: null,
                prompt: 'Question',
                response: successful ? 'Answer' : null,
                error_message: successful ? null : 'failed',
                responded_at: successful ? createdAt : null,
                created_at: createdAt,
                hidden,
            })
            .returning<{ ai_prompt_uuid: string }[]>('ai_prompt_uuid');
        await database(AiThreadTableName)
            .where('ai_thread_uuid', threadUuid)
            .update({ updated_at: createdAt });
        return prompt.ai_prompt_uuid;
    };

    const memoryInput = (
        sourceThreadUuid: string,
        overrides: Partial<
            Parameters<AiAgentMemoryModel['upsertSourceThreadMemory']>[0]
        > = {},
    ) => ({
        organizationUuid: SEED_ORG_1.organization_uuid,
        projectUuid: SEED_PROJECT.project_uuid,
        agentUuid: null,
        userUuid: null,
        sourceThreadUuid,
        slug: `memory-${crypto.randomUUID().slice(0, 8)}`,
        title: 'Net revenue convention',
        rawMemory: 'Use net revenue.',
        threadSummary: 'The user established the revenue convention.',
        terms: ['revenue'],
        objects: [
            {
                type: 'field' as const,
                explore: 'orders',
                fieldId: 'orders_net_revenue',
            },
        ],
        unresolvedObjects: [],
        generatedAt: new Date('2026-07-22T10:00:00Z'),
        ...overrides,
    });

    const buildService = (
        distillCall: AiAgentMemoryDistillCall,
        projectModel: Pick<
            ProjectModel,
            'findExploresFromCache'
        > = getTestContext().app.getModels().getProjectModel(),
    ) =>
        new AiAgentMemoryService({
            aiAgentMemoryModel: model,
            projectModel,
            featureFlagService,
            schedulerClient,
            distillCall,
        });

    it('replaces source-thread content while keeping slug and telemetry', async () => {
        const sourceThreadUuid = await createThread();
        const first = await model.upsertSourceThreadMemory(
            memoryInput(sourceThreadUuid),
        );
        const citedAt = new Date('2026-07-22T11:00:00Z');
        const pulledAt = new Date('2026-07-22T12:00:00Z');
        await database(AiAgentMemoryTableName)
            .where('ai_agent_memory_uuid', first.ai_agent_memory_uuid)
            .update({
                cited_count: 3,
                last_cited_at: citedAt,
                pulled_count: 5,
                last_pulled_at: pulledAt,
            });

        const generatedAt = new Date('2026-07-22T13:00:00Z');
        const updated = await model.upsertSourceThreadMemory(
            memoryInput(sourceThreadUuid, {
                slug: 'replacement-slug-is-ignored',
                title: 'Recognized net revenue convention',
                rawMemory: 'Use recognized net revenue.',
                threadSummary: 'The resumed thread confirmed the convention.',
                terms: ['net revenue'],
                objects: [{ type: 'explore', name: 'orders' }],
                unresolvedObjects: [
                    { type: 'explore', name: 'missing_orders' },
                ],
                generatedAt,
            }),
        );

        expect(updated).toMatchObject({
            ai_agent_memory_uuid: first.ai_agent_memory_uuid,
            slug: first.slug,
            title: 'Recognized net revenue convention',
            raw_memory: 'Use recognized net revenue.',
            thread_summary: 'The resumed thread confirmed the convention.',
            terms: ['net revenue'],
            objects: [{ type: 'explore', name: 'orders' }],
            unresolved_objects: [{ type: 'explore', name: 'missing_orders' }],
            generated_at: generatedAt,
            cited_count: 3,
            last_cited_at: citedAt,
            pulled_count: 5,
            last_pulled_at: pulledAt,
        });
    });

    it('increments pull telemetry without changing citation telemetry', async () => {
        const sourceThreadUuid = await createThread();
        const memory = await model.upsertSourceThreadMemory(
            memoryInput(sourceThreadUuid),
        );
        const citedAt = new Date('2026-07-22T11:00:00Z');
        await database(AiAgentMemoryTableName)
            .where('ai_agent_memory_uuid', memory.ai_agent_memory_uuid)
            .update({ cited_count: 3, last_cited_at: citedAt });

        const before = new Date();
        await model.incrementPulledForActiveMemories({
            projectUuid: SEED_PROJECT.project_uuid,
            slugs: [memory.slug, memory.slug],
        });
        const updated = await database(AiAgentMemoryTableName)
            .where('ai_agent_memory_uuid', memory.ai_agent_memory_uuid)
            .first();

        expect(updated).toMatchObject({
            pulled_count: 1,
            cited_count: 3,
            last_cited_at: citedAt,
        });
        expect(updated?.last_pulled_at).not.toBeNull();
        expect(updated!.last_pulled_at!.getTime()).toBeGreaterThanOrEqual(
            before.getTime(),
        );
    });

    it('upserts one ledger row and clears stale outcome details', async () => {
        const aiThreadUuid = await createThread();
        const memory = await model.upsertSourceThreadMemory(
            memoryInput(aiThreadUuid),
        );
        const first = await model.upsertThreadDistill({
            aiThreadUuid,
            outcome: 'memory',
            distillPromptHash: 'hash-1',
            distilledUpTo: new Date('2026-07-22T10:00:00Z'),
        });

        const noOp = await model.upsertThreadDistill({
            aiThreadUuid,
            outcome: 'no_op',
            noOpReason: 'insufficient_signal',
            distillPromptHash: 'hash-2',
            distilledUpTo: new Date('2026-07-22T11:00:00Z'),
        });
        expect(noOp).toMatchObject({
            ai_agent_thread_distill_uuid: first.ai_agent_thread_distill_uuid,
            outcome: 'no_op',
            no_op_reason: 'insufficient_signal',
            error_message: null,
            distilled_up_to: new Date('2026-07-22T11:00:00Z'),
        });
        const activeMemory = await database(AiAgentMemoryTableName)
            .where('source_thread_uuid', aiThreadUuid)
            .where('status', 'active')
            .first();
        expect(activeMemory?.ai_agent_memory_uuid).toBe(
            memory.ai_agent_memory_uuid,
        );

        const failed = await model.upsertThreadDistill({
            aiThreadUuid,
            outcome: 'failed',
            errorMessage: 'provider timeout',
            distillPromptHash: 'hash-3',
            distilledUpTo: new Date('2026-07-22T12:00:00Z'),
        });
        expect(failed).toMatchObject({
            ai_agent_thread_distill_uuid: first.ai_agent_thread_distill_uuid,
            outcome: 'failed',
            no_op_reason: null,
            error_message: 'provider timeout',
            distill_prompt_hash: 'hash-3',
        });

        const succeeded = await model.upsertThreadDistill({
            aiThreadUuid,
            outcome: 'memory',
            distillPromptHash: null,
            distilledUpTo: new Date('2026-07-22T13:00:00Z'),
        });
        expect(succeeded).toMatchObject({
            ai_agent_thread_distill_uuid: first.ai_agent_thread_distill_uuid,
            outcome: 'memory',
            no_op_reason: null,
            error_message: null,
            distill_prompt_hash: null,
        });
        const ledgerCount = await database(AiAgentThreadDistillTableName)
            .where('ai_thread_uuid', aiThreadUuid)
            .count<{ count: bigint }>('* as count')
            .first();
        expect(Number(ledgerCount?.count)).toBe(1);
    });

    it('returns only active project memories in citation ranking order', async () => {
        const [firstThread, secondThread, thirdThread, retiredThread] =
            await Promise.all([
                createThread(),
                createThread(),
                createThread(),
                createThread(),
            ]);
        const first = await model.upsertSourceThreadMemory(
            memoryInput(firstThread, {
                generatedAt: new Date('2026-07-22T12:00:00Z'),
            }),
        );
        const second = await model.upsertSourceThreadMemory(
            memoryInput(secondThread, {
                generatedAt: new Date('2026-07-22T13:00:00Z'),
            }),
        );
        const third = await model.upsertSourceThreadMemory(
            memoryInput(thirdThread, {
                generatedAt: new Date('2026-07-22T11:00:00Z'),
            }),
        );
        const retired = await model.upsertSourceThreadMemory(
            memoryInput(retiredThread, {
                generatedAt: new Date('2026-07-22T14:00:00Z'),
            }),
        );
        await database(AiAgentMemoryTableName)
            .where('ai_agent_memory_uuid', first.ai_agent_memory_uuid)
            .update({ last_cited_at: new Date('2026-07-22T09:00:00Z') });
        await database(AiAgentMemoryTableName)
            .where('ai_agent_memory_uuid', retired.ai_agent_memory_uuid)
            .update({ status: 'retired' });

        const rows = await model.findActiveForProject({
            projectUuid: SEED_PROJECT.project_uuid,
        });

        expect(rows.map((row) => row.ai_agent_memory_uuid)).toEqual([
            first.ai_agent_memory_uuid,
            second.ai_agent_memory_uuid,
            third.ai_agent_memory_uuid,
        ]);
    });

    it('selects only idle, recent, supported threads due by watermark', async () => {
        const now = new Date('2026-07-22T12:00:00Z');
        const eligible = await createThread();
        const resumed = await createThread('slack');
        const active = await createThread();
        const belowFloor = await createThread();
        const failed = await createThread();
        const hiddenOnly = await createThread();
        const excludedSource = await createThread('evals');
        const alreadyDistilled = await createThread();
        const idleAt = new Date('2026-07-22T05:00:00Z');

        await Promise.all([
            createPrompt(eligible, idleAt),
            createPrompt(resumed, idleAt),
            createPrompt(active, new Date('2026-07-22T07:00:00Z')),
            createPrompt(belowFloor, new Date('2026-07-16T12:00:00Z')),
            createPrompt(failed, idleAt, false),
            createPrompt(hiddenOnly, idleAt, true, true),
            createPrompt(excludedSource, idleAt),
            createPrompt(alreadyDistilled, idleAt),
        ]);
        await Promise.all([
            model.upsertThreadDistill({
                aiThreadUuid: resumed,
                outcome: 'no_op',
                noOpReason: 'insufficient_signal',
                distillPromptHash: 'hash',
                distilledUpTo: new Date('2026-07-22T04:59:00Z'),
            }),
            model.upsertThreadDistill({
                aiThreadUuid: alreadyDistilled,
                outcome: 'no_op',
                noOpReason: 'insufficient_signal',
                distillPromptHash: 'hash',
                distilledUpTo: idleAt,
            }),
        ]);

        const candidates = await model.findThreadsDueForDistill({
            idleBefore: new Date(now.getTime() - 6 * 60 * 60 * 1000),
            activityFloor: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        });
        expect(
            candidates
                .filter((row) => threadUuids.has(row.threadUuid))
                .map((row) => row.threadUuid)
                .sort(),
        ).toEqual([eligible, failed, hiddenOnly, resumed].sort());

        const laterHiddenActivity = new Date('2026-07-22T05:30:00Z');
        await createPrompt(eligible, laterHiddenActivity, true, true);
        const loaded = await model.findThreadForDistill(eligible);
        expect(loaded?.turns).toHaveLength(1);
        expect(loaded?.latestActivity).toEqual(laterHiddenActivity);

        await database<Pick<DbProject, 'project_uuid' | 'project_type'>>(
            ProjectTableName,
        )
            .where('project_uuid', SEED_PROJECT.project_uuid)
            .update({ project_type: ProjectType.PREVIEW });
        try {
            const previewCandidates = await model.findThreadsDueForDistill({
                idleBefore: new Date(now.getTime() - 6 * 60 * 60 * 1000),
                activityFloor: new Date(
                    now.getTime() - 5 * 24 * 60 * 60 * 1000,
                ),
            });
            expect(
                previewCandidates.some((row) =>
                    threadUuids.has(row.threadUuid),
                ),
            ).toBe(false);
        } finally {
            await database<Pick<DbProject, 'project_uuid' | 'project_type'>>(
                ProjectTableName,
            )
                .where('project_uuid', SEED_PROJECT.project_uuid)
                .update({ project_type: ProjectType.DEFAULT });
        }
    });

    it('records failed-response skips without calling the LLM or re-enqueueing', async () => {
        const now = new Date('2026-07-22T12:00:00Z');
        const idleAt = new Date('2026-07-22T05:00:00Z');
        const failed = await createThread();
        const excludedSource = await createThread('evals');
        await Promise.all([
            createPrompt(failed, idleAt, false),
            createPrompt(excludedSource, idleAt),
        ]);
        const distillCall = vi.fn<AiAgentMemoryDistillCall>();
        const service = buildService(distillCall);
        const payload = {
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            userUuid: 'system',
        };

        await expect(
            service.distillThread({ ...payload, threadUuid: failed }),
        ).resolves.toBe('skipped');
        await expect(
            service.distillThread({ ...payload, threadUuid: excludedSource }),
        ).resolves.toBe('skipped');
        expect(distillCall).not.toHaveBeenCalled();

        const ledgers = await database(AiAgentThreadDistillTableName)
            .whereIn('ai_thread_uuid', [failed, excludedSource])
            .select();
        expect(ledgers).toHaveLength(1);
        expect(ledgers[0]).toMatchObject({
            ai_thread_uuid: failed,
            outcome: 'skipped',
            distill_prompt_hash: null,
            distilled_up_to: idleAt,
        });

        const candidates = await model.findThreadsDueForDistill({
            idleBefore: new Date(now.getTime() - 6 * 60 * 60 * 1000),
            activityFloor: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        });
        expect(candidates.some((row) => row.threadUuid === failed)).toBe(false);
    });

    it('treats an interrupted-only thread as skipped', async () => {
        const activity = new Date('2026-07-22T05:00:00Z');
        const threadUuid = await createThread();
        const promptUuid = await createPrompt(threadUuid, activity);
        await database(AiPromptInterruptTableName).insert({
            ai_prompt_uuid: promptUuid,
            created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        });
        const loaded = await model.findThreadForDistill(threadUuid);
        expect(loaded?.turns).toMatchObject([{ interrupted: true }]);

        const distillCall = vi.fn<AiAgentMemoryDistillCall>();
        const service = buildService(distillCall);
        await expect(
            service.distillThread({
                organizationUuid: SEED_ORG_1.organization_uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                userUuid: 'system',
                threadUuid,
            }),
        ).resolves.toBe('skipped');
        expect(distillCall).not.toHaveBeenCalled();
        await expect(
            database(AiAgentThreadDistillTableName)
                .where('ai_thread_uuid', threadUuid)
                .first(),
        ).resolves.toMatchObject({
            outcome: 'skipped',
            distilled_up_to: activity,
        });
    });

    it('uses the stored flag to gate real scheduler enqueueing', async () => {
        const now = new Date('2026-07-22T12:00:00Z');
        const threadUuid = await createThread();
        await createPrompt(threadUuid, new Date('2026-07-22T05:00:00Z'));
        const distillCall = vi.fn<AiAgentMemoryDistillCall>();
        const service = buildService(distillCall);
        const jobKey = `ai-agent-memory-distill:${threadUuid}`;

        await setFeatureFlag(FeatureFlags.AiAgentMemory, false);
        await expect(service.sweep(now)).resolves.toBe(0);
        const graphileClient = await schedulerClient.graphileUtils;
        await expect(
            graphileClient.withPgClient(async (client) => {
                const result = await client.query(
                    'SELECT payload FROM graphile_worker.jobs WHERE key = $1',
                    [jobKey],
                );
                return result.rows[0];
            }),
        ).resolves.toBeUndefined();

        await setFeatureFlag(FeatureFlags.AiAgentMemory, true);
        await expect(service.sweep(now)).resolves.toBeGreaterThanOrEqual(1);
        const job = await graphileClient.withPgClient(async (client) => {
            const result = await client.query(
                'SELECT payload FROM graphile_worker.jobs WHERE key = $1',
                [jobKey],
            );
            return result.rows[0];
        });
        expect(job?.payload).toMatchObject({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            userUuid: 'system',
            threadUuid,
        });
        expect(distillCall).not.toHaveBeenCalled();
    });

    it('aborts before persistence and records the exact activity watermark', async () => {
        const threadUuid = await createThread();
        const activity = new Date('2026-07-22T05:00:00Z');
        await createPrompt(threadUuid, activity);
        const distillCall = vi.fn<AiAgentMemoryDistillCall>(
            ({ abortSignal }) =>
                new Promise((_resolve, reject) => {
                    if (!abortSignal) {
                        reject(new Error('Missing abort signal'));
                        return;
                    }
                    abortSignal.addEventListener(
                        'abort',
                        () => reject(abortSignal.reason),
                        { once: true },
                    );
                }),
        );
        const service = buildService(distillCall);
        const controller = new AbortController();
        const result = service.distillThread(
            {
                organizationUuid: SEED_ORG_1.organization_uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                userUuid: 'system',
                threadUuid,
            },
            controller.signal,
        );
        await vi.waitFor(() => {
            expect(distillCall).toHaveBeenCalledOnce();
        });
        controller.abort(new Error('distill timeout'));

        await expect(result).resolves.toBe('failed');
        await expect(
            database(AiAgentMemoryTableName)
                .where('source_thread_uuid', threadUuid)
                .first(),
        ).resolves.toBeUndefined();
        await expect(
            database(AiAgentThreadDistillTableName)
                .where('ai_thread_uuid', threadUuid)
                .first(),
        ).resolves.toMatchObject({
            outcome: 'failed',
            error_message: 'distill timeout',
            distilled_up_to: activity,
        });
    });

    it('persists typed distill outputs and keeps memory on a later no-op', async () => {
        const threadUuid = await createThread();
        const firstActivity = new Date('2026-07-22T05:00:00Z');
        await createPrompt(threadUuid, firstActivity);
        const distillCall = vi
            .fn<AiAgentMemoryDistillCall>()
            .mockResolvedValueOnce({
                result: {
                    type: 'memory',
                    thread_summary: 'The user established a revenue rule.',
                    slug: 'completed-revenue',
                    title: 'Completed revenue convention',
                    raw_memory: 'Use the completed revenue convention.',
                    terms: ['completed revenue'],
                    objects: [{ type: 'explore', name: 'missing_orders' }],
                },
            })
            .mockResolvedValueOnce({
                result: {
                    type: 'no_op',
                    reason: 'no_positive_evidence',
                },
            });
        const service = buildService(distillCall);
        const payload = {
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            userUuid: 'system',
            threadUuid,
        };

        await expect(service.distillThread(payload)).resolves.toBe('memory');
        const justDistilled = await model.findThreadsDueForDistill({
            idleBefore: firstActivity,
            activityFloor: new Date(
                firstActivity.getTime() - 24 * 60 * 60 * 1000,
            ),
        });
        expect(justDistilled.some((row) => row.threadUuid === threadUuid)).toBe(
            false,
        );
        const [firstMemory] = await database(AiAgentMemoryTableName).where(
            'source_thread_uuid',
            threadUuid,
        );
        expect(firstMemory.slug).toMatch(/^completed-revenue-[0-9a-f]{8}$/);
        expect(firstMemory.title).toBe('Completed revenue convention');
        expect(firstMemory.objects).toEqual([
            { type: 'explore', name: 'missing_orders' },
        ]);
        expect(firstMemory.unresolved_objects).toEqual([
            { type: 'explore', name: 'missing_orders' },
        ]);

        const secondActivity = new Date('2026-07-22T05:05:00Z');
        await createPrompt(threadUuid, secondActivity);
        await expect(service.distillThread(payload)).resolves.toBe('no_op');

        const memories = await database(AiAgentMemoryTableName).where(
            'source_thread_uuid',
            threadUuid,
        );
        const ledger = await database(AiAgentThreadDistillTableName)
            .where('ai_thread_uuid', threadUuid)
            .first();
        expect(memories).toHaveLength(1);
        expect(memories[0].slug).toBe(firstMemory.slug);
        expect(ledger).toMatchObject({
            outcome: 'no_op',
            no_op_reason: 'no_positive_evidence',
            distilled_up_to: secondActivity,
        });
        await expect(service.distillThread(payload)).resolves.toBe('skipped');
        expect(distillCall).toHaveBeenCalledTimes(2);
    });

    it('persists memory when catalog validation is unavailable', async () => {
        const threadUuid = await createThread();
        const activity = new Date('2026-07-22T05:00:00Z');
        await createPrompt(threadUuid, activity);
        const objects = [
            { type: 'explore' as const, name: 'orders' },
            {
                type: 'field' as const,
                explore: 'orders',
                fieldId: 'orders_net_revenue',
            },
        ];
        const distillCall = vi
            .fn<AiAgentMemoryDistillCall>()
            .mockResolvedValue({
                result: {
                    type: 'memory',
                    thread_summary: 'The user established a revenue rule.',
                    slug: 'net-revenue',
                    title: 'Net revenue convention',
                    raw_memory: 'Use net revenue.',
                    terms: ['net revenue'],
                    objects,
                },
            });
        const findExploresFromCache = vi
            .fn<ProjectModel['findExploresFromCache']>()
            .mockRejectedValue(new Error('catalog unavailable'));
        const service = buildService(distillCall, {
            findExploresFromCache,
        });

        await expect(
            service.distillThread({
                organizationUuid: SEED_ORG_1.organization_uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                userUuid: 'system',
                threadUuid,
            }),
        ).resolves.toBe('memory');

        await expect(
            database(AiAgentMemoryTableName)
                .where('source_thread_uuid', threadUuid)
                .first(),
        ).resolves.toMatchObject({
            objects,
            unresolved_objects: objects,
        });
        await expect(
            database(AiAgentThreadDistillTableName)
                .where('ai_thread_uuid', threadUuid)
                .first(),
        ).resolves.toMatchObject({
            outcome: 'memory',
            distilled_up_to: activity,
        });
        expect(distillCall).toHaveBeenCalledOnce();
        expect(findExploresFromCache).toHaveBeenCalledWith(
            SEED_PROJECT.project_uuid,
            'name',
            ['orders'],
        );
    });
});
