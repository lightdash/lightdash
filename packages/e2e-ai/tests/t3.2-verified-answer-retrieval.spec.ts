import { FeatureFlags } from '@lightdash/common';
import type { Pool } from 'pg';
import { z } from 'zod';
import { createTrackedAgent, projectUuid, type Agent } from '../lib/agents';
import type { LightdashApi } from '../lib/api';
import { single } from '../lib/assert';
import { markUndone, recordUndo } from '../lib/cleanupLedger';
import { queryRows } from '../lib/db';
import { runId } from '../lib/env';
import { f1RetrievalAgent, WITNESS_PROMPTS } from '../lib/fixtureData';
import { expect, test } from '../lib/fixtures';
import { isFeatureFlagEnabled } from '../lib/flags';
import {
    reportObservation,
    reportSkippedCheck,
    reportWarning,
} from '../lib/report';
import { createThread, generateAnswer } from '../lib/threads';
import {
    equals,
    expectUsageLine,
    explainFromLog,
    markUsageLog,
    usageValue,
    witnessUsage,
} from '../lib/usageLog';
import {
    embeddedText,
    makeChartArtifactOrRetry,
    missingEmbeddingReason,
    requireVerification,
    verifyAndAwaitJobs,
} from '../lib/verifiedArtifacts';

// Not in the plan: the read half of T3.1's embeddings. A thread's first prompt
// is embedded and matched against the agent's verified charts; each match is
// recorded in ai_prompt_artifact_references and shown to the model. Only the
// control is deterministic, and the similar and unrelated questions are model
// dependent, so they warn. Preconditions: as T3.1.

const UNRELATED_QUESTION = 'Which customers signed up this year?';
const THRESHOLD =
    'AI_VERIFIED_ANSWER_SIMILARITY_THRESHOLD on the backend, default 0.6';

const referenceSchema = z.object({
    ai_artifact_version_uuid: z.string(),
    similarity_score: z.number().nullable(),
});

/** Asks in a new thread; returns what its first prompt retrieved. */
const ask = async (
    api: LightdashApi,
    db: Pool,
    agent: Agent,
    question: string,
) => {
    const thread = await createThread(api, agent, question);
    await generateAnswer(api, agent, thread.uuid);
    return queryRows(
        db,
        `SELECT ai_artifact_version_uuid, similarity_score
         FROM ai_prompt_artifact_references WHERE ai_prompt_uuid = $1`,
        [thread.firstMessage.uuid],
        referenceSchema,
    );
};

const SET_EMBEDDING_MODEL =
    'UPDATE ai_artifact_versions SET embedding_model = $2 WHERE ai_artifact_version_uuid = $1';

/** Runs `fn` with the version labelled as embedded by `model`; kill-safe. */
const withEmbeddingModel = async (
    db: Pool,
    versionUuid: string,
    { actual, pretended }: { actual: string; pretended: string },
    fn: () => Promise<void>,
) => {
    const undo = recordUndo({
        kind: 'sql',
        text: SET_EMBEDDING_MODEL,
        params: [versionUuid, actual],
    });
    await db.query(SET_EMBEDDING_MODEL, [versionUuid, pretended]);
    try {
        await fn();
    } finally {
        await db.query(SET_EMBEDDING_MODEL, [versionUuid, actual]);
        markUndone(undo);
    }
};

test('T3.2 Retrieve a verified answer for a similar question', async ({
    api,
    db,
}) => {
    const tracked = await createTrackedAgent(api, f1RetrievalAgent(runId));
    const { agent } = tracked;
    try {
        await requireVerification(api, agent);
        const fastDecisions = await isFeatureFlagEnabled(
            api,
            FeatureFlags.AiAgentFastDecisions,
        );
        const selection = fastDecisions
            ? 'fast decisions are on, so a model picks among the nearest charts'
            : 'fast decisions are off, so every chart above the similarity threshold is retrieved';
        reportObservation(selection);

        const artifact = await makeChartArtifactOrRetry(api, db, agent, () =>
            reportObservation(
                'no chart artifact on attempt 1 (variance); retrying once',
            ),
        );
        const versionUuid = artifact.ai_artifact_version_uuid;
        const jobsMark = await markUsageLog();
        const version = await verifyAndAwaitJobs(api, db, agent, artifact);
        if (!version.has_embedding) {
            test.skip(true, await missingEmbeddingReason(jobsMark, version));
        }
        const { embedding_model: model, embedding_model_provider: provider } =
            version;
        if (model === null || provider === null) {
            throw new Error(
                `Version ${versionUuid} has an embedding but no model or provider`,
            );
        }
        const control = embeddedText(version);
        const retrieved = (references: z.output<typeof referenceSchema>[]) =>
            references.find(
                (reference) =>
                    reference.ai_artifact_version_uuid === versionUuid,
            ) ?? null;

        await test.step('control: the text the chart was embedded from', async () => {
            const mark = await markUsageLog();
            const references = await ask(api, db, agent, control);
            // The search only compares vectors from the same provider and
            // model, so a mismatch here is why nothing was retrieved.
            await witnessUsage(
                mark,
                'query embedding model',
                (line) =>
                    usageValue(line, 'feature') === 'embedding' &&
                    usageValue(line, 'aiAgentId') === agent.uuid &&
                    usageValue(line, 'projectId') === projectUuid,
                (lines) => {
                    const line = single(lines, 'query embedding AI usage line');
                    reportObservation(
                        `the question was embedded by ${usageValue(line, 'provider')}/${usageValue(line, 'model')} and the verified chart by ${provider}/${model}`,
                    );
                    expectUsageLine(line, {
                        provider: equals(provider),
                        model: equals(model),
                    });
                },
            );
            const hit = retrieved(references);
            if (hit === null) {
                throw new Error(
                    `Retrieval returned nothing for the exact text the verified chart was embedded from (${JSON.stringify(control)}), with ${selection}. ${await explainFromLog(mark, ['Failed to retrieve relevant artifacts'])}`,
                );
            }
            reportObservation(`control similarity ${hit.similarity_score}`);
        });

        await test.step('similar questions', async () => {
            const similar = [
                {
                    label: 'the question that made the chart',
                    question: WITNESS_PROMPTS.ordersByStatusChart,
                },
                ...(version.verified_question === null
                    ? []
                    : [
                          {
                              label: 'its verified question',
                              question: version.verified_question,
                          },
                      ]),
            ];
            if (version.verified_question === null) {
                reportSkippedCheck(
                    'verified question',
                    'the question job wrote no question (T3.1 covers that job)',
                );
            }
            for (const { label, question } of similar) {
                const hit = retrieved(await ask(api, db, agent, question));
                if (hit === null) {
                    reportWarning(
                        `${label} (${JSON.stringify(question)}) did not retrieve the verified chart embedded from ${JSON.stringify(control)}: its similarity is at or below ${THRESHOLD}, so someone asking it gets no verified answer (${selection})`,
                    );
                } else {
                    reportObservation(
                        `${label} retrieved the verified chart, similarity ${hit.similarity_score}`,
                    );
                }
            }
        });

        await test.step('unrelated question', async () => {
            const hit = retrieved(
                await ask(api, db, agent, UNRELATED_QUESTION),
            );
            if (hit === null) {
                reportObservation('the unrelated question retrieved nothing');
            } else {
                reportWarning(
                    `the unrelated question ${JSON.stringify(UNRELATED_QUESTION)} retrieved the verified chart embedded from ${JSON.stringify(control)} with similarity ${hit.similarity_score} (${THRESHOLD}; ${selection})`,
                );
            }
        });

        await test.step('embedding model filter', async () => {
            await withEmbeddingModel(
                db,
                versionUuid,
                { actual: model, pretended: `${model}-e2e-filter-probe` },
                async () => {
                    const references = await ask(api, db, agent, control);
                    expect(
                        references,
                        'a chart embedded by another model must never be compared with the question',
                    ).toEqual([]);
                },
            );
        });
    } finally {
        await tracked.remove();
    }
});
