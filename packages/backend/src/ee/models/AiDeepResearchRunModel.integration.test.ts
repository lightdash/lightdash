import {
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    type AiDeepResearchArtifact,
    type AiDeepResearchBudget,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { getTestContext } from '../../vitest.setup.integration';
import { AiThreadTableName } from '../database/entities/ai';
import {
    AiDeepResearchEventsTableName,
    AiDeepResearchRunsTableName,
    type DbAiDeepResearchRun,
} from '../database/entities/aiDeepResearch';
import { AiDeepResearchRunModel } from './AiDeepResearchRunModel';

const budget: AiDeepResearchBudget = {
    maxRuntimeMs: 60_000,
    maxTokens: 10_000,
    maxToolCalls: 20,
    maxWarehouseQueries: 10,
    maxResultRows: 1_000,
};

const artifact: AiDeepResearchArtifact = {
    findings: [],
    evidence: [],
    queryUuids: [],
    metricDefinitions: [],
    hypotheses: [],
    contradictions: [],
    confidence: 'medium',
    limitations: [],
    finalReport: 'Summary',
};

describe('AiDeepResearchRunModel integration', () => {
    let database: Knex;
    let model: AiDeepResearchRunModel;
    const runUuids = new Set<string>();

    beforeAll(() => {
        database = getTestContext().db;
        model = new AiDeepResearchRunModel({ database });
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

    const createRun = async (
        overrides: { aiThreadUuid?: string | null } = {},
    ): Promise<DbAiDeepResearchRun> => {
        const run = await model.create({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            aiThreadUuid: overrides.aiThreadUuid ?? null,
            promptUuid: null,
            toolCallId: null,
            prompt: `Integration race ${crypto.randomUUID()}`,
            budget,
        });
        runUuids.add(run.ai_deep_research_run_uuid);
        return run;
    };

    const backdateHeartbeat = async (
        runUuid: string,
        interval: string,
    ): Promise<void> => {
        await database(AiDeepResearchRunsTableName)
            .where('ai_deep_research_run_uuid', runUuid)
            .update({
                updated_at: database.raw(`now() - interval '${interval}'`),
            });
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
            model.claimRun(run.ai_deep_research_run_uuid),
            model.claimRun(run.ai_deep_research_run_uuid),
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
            model.claimRun(run.ai_deep_research_run_uuid),
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
        await model.claimRun(run.ai_deep_research_run_uuid);

        await Promise.all([
            model.markCompleted(run.ai_deep_research_run_uuid, artifact),
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
        await model.claimRun(run.ai_deep_research_run_uuid);
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

    it('refuses to reclaim a running run with a fresh heartbeat', async () => {
        const run = await createRun();
        const claimed = await model.claimRun(run.ai_deep_research_run_uuid);

        const reclaimed = await model.claimRun(run.ai_deep_research_run_uuid);

        expect(claimed).toMatchObject({ execution_attempts: 1 });
        expect(reclaimed).toBeUndefined();
        expect(
            await model.findByUuid(run.ai_deep_research_run_uuid),
        ).toMatchObject({ status: 'running', execution_attempts: 1 });
    });

    it('reclaims a stale running run, keeping the original start and counting the attempt', async () => {
        const run = await createRun();
        const firstClaim = await model.claimRun(run.ai_deep_research_run_uuid);
        await backdateHeartbeat(run.ai_deep_research_run_uuid, '2 minutes');

        const reclaimed = await model.claimRun(run.ai_deep_research_run_uuid);

        expect(reclaimed).toMatchObject({
            status: 'running',
            execution_attempts: 2,
            started_at: firstClaim?.started_at,
        });
        expect(await getEventSequence(run.ai_deep_research_run_uuid)).toEqual([
            'status_changed:queued',
            'status_changed:running',
            'status_changed:running',
        ]);
    });

    it('never reclaims a stale run once cancellation has been requested', async () => {
        const run = await createRun();
        await model.claimRun(run.ai_deep_research_run_uuid);
        await model.requestCancellation(run.ai_deep_research_run_uuid);
        await backdateHeartbeat(run.ai_deep_research_run_uuid, '2 minutes');

        const reclaimed = await model.claimRun(run.ai_deep_research_run_uuid);

        expect(reclaimed).toBeUndefined();
        expect(
            await model.findByUuid(run.ai_deep_research_run_uuid),
        ).toMatchObject({ status: 'running', execution_attempts: 1 });
    });

    it('releases a running run back to queued so Graphile can retry it', async () => {
        const run = await createRun();
        await model.claimRun(run.ai_deep_research_run_uuid);

        const released = await model.releaseForRetry(
            run.ai_deep_research_run_uuid,
        );

        expect(released).toBe(true);
        expect(
            await model.findByUuid(run.ai_deep_research_run_uuid),
        ).toMatchObject({ status: 'queued', execution_attempts: 1 });
        expect(await getEventSequence(run.ai_deep_research_run_uuid)).toEqual([
            'status_changed:queued',
            'status_changed:running',
            'status_changed:queued',
        ]);
    });

    it('does not release a cancellation-requested run for retry', async () => {
        const run = await createRun();
        await model.claimRun(run.ai_deep_research_run_uuid);
        await model.requestCancellation(run.ai_deep_research_run_uuid);

        const released = await model.releaseForRetry(
            run.ai_deep_research_run_uuid,
        );

        expect(released).toBe(false);
        expect(
            await model.findByUuid(run.ai_deep_research_run_uuid),
        ).toMatchObject({ status: 'running' });
    });

    it('does not release a run that is not running', async () => {
        const run = await createRun();

        expect(await model.releaseForRetry(run.ai_deep_research_run_uuid)).toBe(
            false,
        );
        expect(
            await model.findByUuid(run.ai_deep_research_run_uuid),
        ).toMatchObject({ status: 'queued' });
    });

    it('persists the artifact with its events exactly once across duplicate saves', async () => {
        const run = await createRun();
        await model.claimRun(run.ai_deep_research_run_uuid);
        const queries = [
            {
                queryUuid: crypto.randomUUID(),
                toolCallId: 'call-1',
                toolName: 'runSql',
            },
        ];

        const firstSave = await model.saveArtifactWithEvents(
            run.ai_deep_research_run_uuid,
            artifact,
            queries,
        );
        const secondSave = await model.saveArtifactWithEvents(
            run.ai_deep_research_run_uuid,
            artifact,
            queries,
        );

        expect(firstSave).toBe(true);
        expect(secondSave).toBe(false);
        expect(
            await model.findByUuid(run.ai_deep_research_run_uuid),
        ).toMatchObject({
            status: 'running',
            result: artifact,
            checkpoint: 'artifact_created',
        });
        expect(await getEventSequence(run.ai_deep_research_run_uuid)).toEqual([
            'status_changed:queued',
            'status_changed:running',
            'checkpoint',
            'artifact_created',
            'query_provenance',
        ]);
    });

    it('finds the active run for a thread only while it is queued or running', async () => {
        const [threadUuid] = await database(AiThreadTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                created_from: 'web_app',
                agent_uuid: null,
            })
            .returning('ai_thread_uuid')
            .then((rows) => rows.map((row) => row.ai_thread_uuid));
        try {
            const run = await createRun({ aiThreadUuid: threadUuid });

            expect(await model.findActiveRunByThread(threadUuid)).toMatchObject(
                {
                    ai_deep_research_run_uuid: run.ai_deep_research_run_uuid,
                },
            );

            await model.claimRun(run.ai_deep_research_run_uuid);
            expect(await model.findActiveRunByThread(threadUuid)).toMatchObject(
                {
                    ai_deep_research_run_uuid: run.ai_deep_research_run_uuid,
                },
            );

            await model.markFailed(run.ai_deep_research_run_uuid, 'boom');
            expect(
                await model.findActiveRunByThread(threadUuid),
            ).toBeUndefined();
        } finally {
            await database(AiDeepResearchRunsTableName)
                .where('ai_thread_uuid', threadUuid)
                .delete();
            await database(AiThreadTableName)
                .where('ai_thread_uuid', threadUuid)
                .delete();
        }
    });

    it('persists and clears the policy limit marker only while the run is running', async () => {
        const run = await createRun();

        expect(
            await model.savePolicyLimitReached(
                run.ai_deep_research_run_uuid,
                'The runtime policy limit was reached.',
            ),
        ).toBe(false);

        await model.claimRun(run.ai_deep_research_run_uuid);
        expect(
            await model.savePolicyLimitReached(
                run.ai_deep_research_run_uuid,
                'The runtime policy limit was reached.',
            ),
        ).toBe(true);
        expect(
            await model.findByUuid(run.ai_deep_research_run_uuid),
        ).toMatchObject({
            policy_limit_reached: 'The runtime policy limit was reached.',
        });

        expect(
            await model.savePolicyLimitReached(
                run.ai_deep_research_run_uuid,
                null,
            ),
        ).toBe(true);
        expect(
            await model.findByUuid(run.ai_deep_research_run_uuid),
        ).toMatchObject({ policy_limit_reached: null });
    });
});
