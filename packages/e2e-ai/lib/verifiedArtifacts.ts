import { setTimeout as sleep } from 'node:timers/promises';
import type { Pool } from 'pg';
import { z } from 'zod';
import { agentPath, type Agent } from './agents';
import type { LightdashApi } from './api';
import { single } from './assert';
import { queryRows } from './db';
import { backendLogPath } from './env';
import { WITNESS_PROMPTS } from './fixtureData';
import { expect, test } from './fixtures';
import { createThread, generateAnswer } from './threads';
import { explainFromLog, type UsageLogMark } from './usageLog';

// Verified chart artifacts: the corpus the embedding jobs write (T3.1) and
// agent turns retrieve from (T3.2).

const JOB_TASKS = ['embedArtifactVersion', 'generateArtifactQuestion'];
const EMBED_FAILURE_LOG = 'Failed to embed artifact version';
const QUESTION_FAILURE_LOG = 'Failed to generate question for artifact version';
// The verify request enqueues both jobs without awaiting them.
const ENQUEUE_GRACE_MS = 3_000;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export const verifyPath = (
    agent: Agent,
    artifactUuid: string,
    versionUuid: string,
) =>
    `${agentPath(agent)}/artifacts/${artifactUuid}/versions/${versionUuid}/verified`;

/**
 * Skips unless answer verification is on. The enable check runs before the
 * artifact lookup: 501 means it is off (AI_EMBEDDING_ENABLED), 404 on.
 */
export const requireVerification = async (api: LightdashApi, agent: Agent) => {
    const probe = await api.send(
        'PATCH',
        verifyPath(agent, NIL_UUID, NIL_UUID),
        { verified: true },
    );
    test.skip(
        probe.status === 501,
        'answer verification is off: start the backend with AI_EMBEDDING_ENABLED=true',
    );
    if (probe.status !== 404) {
        throw new Error(
            `Verification probe: HTTP ${probe.status} ${probe.text}`,
        );
    }
};

const versionRowSchema = z.object({
    verified_question: z.string().nullable(),
    has_embedding: z.boolean(),
    embedding_model: z.string().nullable(),
    embedding_model_provider: z.string().nullable(),
    title: z.string().nullable(),
    description: z.string().nullable(),
});

type VersionRow = z.output<typeof versionRowSchema>;

export const readVersion = async (db: Pool, versionUuid: string) =>
    single(
        await queryRows(
            db,
            `SELECT verified_question, embedding_vector IS NOT NULL AS has_embedding,
                    embedding_model, embedding_model_provider, title, description
             FROM ai_artifact_versions WHERE ai_artifact_version_uuid = $1`,
            [versionUuid],
            versionRowSchema,
        ),
        `ai_artifact_versions ${versionUuid}`,
    );

/** The text the embedding job embeds: the title and description, as the job joins them. */
export const embeddedText = (row: VersionRow) =>
    [row.title, row.description]
        .filter((part): part is string => Boolean(part))
        .join('\n');

// Queued, running or failed jobs stay in graphile_worker.jobs and a finished
// job is deleted: the progress signal. These tasks write no scheduler_log.
const pendingJobs = (db: Pool, versionUuid: string) =>
    queryRows(
        db,
        `SELECT task_identifier, attempts, last_error FROM graphile_worker.jobs
         WHERE payload->>'artifactVersionUuid' = $1 AND task_identifier = ANY($2)`,
        [versionUuid, JOB_TASKS],
        z.object({
            task_identifier: z.string(),
            attempts: z.number(),
            last_error: z.string().nullable(),
        }),
    );

/** Waits while either job is queued or running, then reads the version. */
const awaitJobs = async (db: Pool, versionUuid: string, verifiedAt: number) => {
    for (;;) {
        const row = await readVersion(db, versionUuid);
        if (row.verified_question !== null && row.has_embedding) return row;
        const jobs = await pendingJobs(db, versionUuid);
        const failed = jobs.filter((job) => job.last_error !== null);
        if (failed.length > 0) {
            throw new Error(`Artifact job failed: ${JSON.stringify(failed)}`);
        }
        if (jobs.length === 0 && Date.now() - verifiedAt > ENQUEUE_GRACE_MS) {
            return row;
        }
        await sleep(500);
    }
};

type ChartArtifact = {
    ai_artifact_uuid: string;
    ai_artifact_version_uuid: string;
};

/** Verifies the version, then waits for its question and embedding jobs. */
export const verifyAndAwaitJobs = async (
    api: LightdashApi,
    db: Pool,
    agent: Agent,
    artifact: ChartArtifact,
) => {
    const verifiedAt = Date.now();
    const reply = await api.send(
        'PATCH',
        verifyPath(
            agent,
            artifact.ai_artifact_uuid,
            artifact.ai_artifact_version_uuid,
        ),
        { verified: true },
    );
    expect(reply.status, reply.text).toBe(200);
    return awaitJobs(db, artifact.ai_artifact_version_uuid, verifiedAt);
};

/** The backend's reason the question job wrote nothing, for failure messages. */
export const explainQuestionJobFailure = (mark: UsageLogMark) =>
    explainFromLog(mark, [QUESTION_FAILURE_LOG]);

/**
 * Why the version has no embedding. Throws when the embedding job failed,
 * which is red; otherwise the provider cannot embed, which is a skip.
 */
export const missingEmbeddingReason = async (
    mark: UsageLogMark,
    row: VersionRow,
) => {
    if (embeddedText(row) === '') {
        throw new Error(
            'The chart has no title or description, so the embedding job had nothing to embed',
        );
    }
    const explanation = await explainFromLog(mark, [EMBED_FAILURE_LOG]);
    if (backendLogPath !== null && explanation.startsWith('Backend log')) {
        throw new Error(`The embedding job failed. ${explanation}`);
    }
    return `no embedding was written and no embedding failure was logged: the default embedding provider (AI_DEFAULT_EMBEDDING_PROVIDER, else AI_DEFAULT_PROVIDER) is not one of openai, bedrock, azure. ${explanation}`;
};

/** One agent turn with the chart prompt; its chart artifact, if it made one. */
const makeChartArtifact = async (api: LightdashApi, db: Pool, agent: Agent) => {
    const thread = await createThread(
        api,
        agent,
        WITNESS_PROMPTS.ordersByStatusChart,
    );
    await generateAnswer(api, agent, thread.uuid);
    const rows = await queryRows(
        db,
        `SELECT a.ai_artifact_uuid, v.ai_artifact_version_uuid
         FROM ai_artifacts a
         JOIN ai_artifact_versions v ON v.ai_artifact_uuid = a.ai_artifact_uuid
         WHERE a.ai_thread_uuid = $1 AND a.artifact_type = 'chart'
         ORDER BY v.version_number DESC LIMIT 1`,
        [thread.uuid],
        z.object({
            ai_artifact_uuid: z.string(),
            ai_artifact_version_uuid: z.string(),
        }),
    );
    return rows[0] ?? null;
};

/** A chart artifact, retried once: no artifact once is variance. */
export const makeChartArtifactOrRetry = async (
    api: LightdashApi,
    db: Pool,
    agent: Agent,
    onRetry: () => void,
): Promise<ChartArtifact> => {
    const first = await makeChartArtifact(api, db, agent);
    if (first !== null) return first;
    onRetry();
    const second = await makeChartArtifact(api, db, agent);
    if (second === null) throw new Error('No chart artifact twice in a row');
    return second;
};
