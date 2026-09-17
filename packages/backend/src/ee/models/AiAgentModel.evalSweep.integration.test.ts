import {
    EE_SCHEDULER_TASKS,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { runMigrations as runGraphileMigrations } from 'graphile-worker';
import { type Knex } from 'knex';
import { Pool } from 'pg';
import { getModels, getTestContext } from '../../vitest.setup.integration';
import { AiThreadTableName } from '../database/entities/ai';
import {
    AiAgentTableName,
    type AiAgentTable,
} from '../database/entities/aiAgent';
import {
    AiEvalRunResultTableName,
    AiEvalRunTableName,
    AiEvalTableName,
    type DbAiEvalRun,
    type DbAiEvalRunResult,
} from '../database/entities/aiEvals';
import { type AiAgentModel } from './AiAgentModel';

// The test database is migrated by Knex only; the sweep joins the Graphile
// queue, so create its schema the way a worker would.
const createGraphileSchema = async (database: Knex): Promise<void> => {
    const pool = new Pool(
        database.client.config.connection as ConstructorParameters<
            typeof Pool
        >[0],
    );
    try {
        await runGraphileMigrations({ pgPool: pool });
    } finally {
        await pool.end();
    }
};

const STALE_LOCK_THRESHOLD_MINUTES = 15;
const ERROR_MESSAGE = 'interrupted';

type JobLock =
    | { kind: 'none' }
    | { kind: 'released' }
    | { kind: 'live' }
    | { kind: 'stale' };

describe('AiAgentModel eval run sweep', () => {
    let database: Knex;
    let model: AiAgentModel;
    const agentUuids: string[] = [];
    const threadUuids: string[] = [];
    const jobIds: string[] = [];

    beforeAll(async () => {
        const context = getTestContext();
        database = context.db;
        model = getModels(context.app).aiAgentModel;
        await createGraphileSchema(database);
    });

    afterEach(async () => {
        await database('graphile_worker.jobs').whereIn('id', jobIds).delete();
        jobIds.length = 0;
        await database(AiThreadTableName)
            .whereIn('ai_thread_uuid', threadUuids)
            .delete();
        threadUuids.length = 0;
        await database(AiAgentTableName)
            .whereIn('ai_agent_uuid', agentUuids)
            .delete();
        agentUuids.length = 0;
    });

    const createAgent = async (): Promise<string> => {
        const [agent] = await database<AiAgentTable>(AiAgentTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                name: 'eval-sweep-agent',
                slug: `eval-sweep-agent-${Date.now()}-${agentUuids.length}`,
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
                thread_retention_hours: null,
            })
            .returning('*');
        agentUuids.push(agent.ai_agent_uuid);
        return agent.ai_agent_uuid;
    };

    const createRun = async (): Promise<{
        runUuid: string;
        promptUuid: string;
        agentUuid: string;
    }> => {
        const agentUuid = await createAgent();
        const evaluation = await model.createEval(
            agentUuid,
            {
                title: 'sweep',
                prompts: [
                    { prompt: 'How many orders?', expectedResponse: null },
                ],
            },
            SEED_ORG_1_ADMIN.user_uuid,
        );
        const { runUuid } = await model.createEvalRun(evaluation.evalUuid);
        return {
            runUuid,
            promptUuid: evaluation.prompts[0].evalPromptUuid,
            agentUuid,
        };
    };

    const enqueueJob = async (
        resultUuid: string,
        lock: JobLock,
    ): Promise<void> => {
        if (lock.kind === 'none') {
            return;
        }
        const { rows } = await database.raw<{ rows: Array<{ id: string }> }>(
            `SELECT id FROM graphile_worker.add_job(?, ?::json, max_attempts => 1)`,
            [
                EE_SCHEDULER_TASKS.AI_AGENT_EVAL_RESULT,
                JSON.stringify({ evalRunResultUuid: resultUuid }),
            ],
        );
        const jobId = rows[0].id;
        jobIds.push(jobId);
        const lockedAt = (() => {
            switch (lock.kind) {
                case 'released':
                    return null;
                case 'live':
                    return database.raw('now()');
                case 'stale':
                    return database.raw("now() - interval '20 minutes'");
                default:
                    return null;
            }
        })();
        await database('graphile_worker.jobs')
            .where('id', jobId)
            .update({
                attempts: 1,
                locked_by: lockedAt === null ? null : 'worker-test',
                locked_at: lockedAt,
                last_error:
                    lockedAt === null ? 'Scheduler worker stopping' : null,
            });
    };

    const createResult = async ({
        runUuid,
        promptUuid,
        agentUuid,
        status,
        lock,
    }: {
        runUuid: string;
        promptUuid: string;
        agentUuid: string;
        status: DbAiEvalRunResult['status'];
        lock: JobLock;
    }): Promise<string> => {
        const threadUuid = await model.createWebAppThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
            createdFrom: 'evals',
            agentUuid,
        });
        threadUuids.push(threadUuid);
        const resultUuid = await model.createEvalRunResult(
            runUuid,
            promptUuid,
            threadUuid,
        );
        await model.updateEvalRunResult(resultUuid, { status });
        await enqueueJob(resultUuid, lock);
        return resultUuid;
    };

    const getResult = async (
        resultUuid: string,
    ): Promise<Pick<DbAiEvalRunResult, 'status' | 'error_message'>> => {
        const row = await database(AiEvalRunResultTableName)
            .select(['status', 'error_message'])
            .where('ai_eval_run_result_uuid', resultUuid)
            .first();
        if (!row) {
            throw new Error(`result ${resultUuid} missing`);
        }
        return row;
    };

    const getRun = async (
        runUuid: string,
    ): Promise<Pick<DbAiEvalRun, 'status' | 'completed_at'>> => {
        const row = await database(AiEvalRunTableName)
            .select(['status', 'completed_at'])
            .where('ai_eval_run_uuid', runUuid)
            .first();
        if (!row) {
            throw new Error(`run ${runUuid} missing`);
        }
        return row;
    };

    const sweep = () =>
        model.failInterruptedEvalRunResults({
            staleLockThresholdMinutes: STALE_LOCK_THRESHOLD_MINUTES,
            errorMessage: ERROR_MESSAGE,
        });

    it('fails running results whose job was released, lost or locked by a dead worker', async () => {
        const run = await createRun();
        const released = await createResult({
            ...run,
            status: 'running',
            lock: { kind: 'released' },
        });
        const lost = await createResult({
            ...run,
            status: 'assessing',
            lock: { kind: 'none' },
        });
        const stale = await createResult({
            ...run,
            status: 'running',
            lock: { kind: 'stale' },
        });

        const swept = await sweep();

        expect(swept.map(({ resultUuid }) => resultUuid).sort()).toEqual(
            [released, lost, stale].sort(),
        );
        expect(swept.every(({ runUuid }) => runUuid === run.runUuid)).toBe(
            true,
        );
        expect(await getResult(released)).toEqual({
            status: 'failed',
            error_message: ERROR_MESSAGE,
        });
        expect(await getResult(lost)).toMatchObject({ status: 'failed' });
        expect(await getResult(stale)).toMatchObject({ status: 'failed' });
    });

    it('leaves results alone while a live worker holds their job or they are still queued', async () => {
        const run = await createRun();
        const live = await createResult({
            ...run,
            status: 'running',
            lock: { kind: 'live' },
        });
        const queued = await createResult({
            ...run,
            status: 'pending',
            lock: { kind: 'none' },
        });
        const completed = await createResult({
            ...run,
            status: 'completed',
            lock: { kind: 'none' },
        });

        const swept = await sweep();

        expect(swept).toEqual([]);
        expect(await getResult(live)).toMatchObject({ status: 'running' });
        expect(await getResult(queued)).toMatchObject({ status: 'pending' });
        expect(await getResult(completed)).toMatchObject({
            status: 'completed',
        });
        expect(await model.findEvalRunsAwaitingCompletion()).not.toContain(
            run.runUuid,
        );
    });

    it('reports a pending run whose results are all terminal so its status can be recomputed', async () => {
        const run = await createRun();
        await createResult({
            ...run,
            status: 'completed',
            lock: { kind: 'none' },
        });
        await createResult({
            ...run,
            status: 'running',
            lock: { kind: 'released' },
        });
        expect(await model.findEvalRunsAwaitingCompletion()).not.toContain(
            run.runUuid,
        );

        await sweep();

        expect(await model.findEvalRunsAwaitingCompletion()).toContain(
            run.runUuid,
        );
        await model.checkAndUpdateEvalRunCompletion(run.runUuid);
        const updated = await getRun(run.runUuid);
        expect(updated.status).toBe('failed');
        expect(updated.completed_at).not.toBeNull();
        expect(await model.findEvalRunsAwaitingCompletion()).not.toContain(
            run.runUuid,
        );
    });

    it('ignores runs that have no results yet', async () => {
        const run = await createRun();

        expect(await model.findEvalRunsAwaitingCompletion()).not.toContain(
            run.runUuid,
        );
        expect(await getRun(run.runUuid)).toMatchObject({ status: 'pending' });
        await database(AiEvalTableName)
            .where('agent_uuid', run.agentUuid)
            .delete();
    });
});
