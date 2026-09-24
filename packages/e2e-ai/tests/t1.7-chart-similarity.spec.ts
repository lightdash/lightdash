import {
    assertUnreachable,
    ContentReviewContentType,
    SEED_ORG_1,
} from '@lightdash/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { projectUuid } from '../lib/agents';
import { resultsOf } from '../lib/api';
import { seededChart } from '../lib/charts';
import { runId } from '../lib/env';
import { expect, test } from '../lib/fixtures';
import { reportObservation, reportSkippedCheck } from '../lib/report';
import {
    equals,
    expectUsageLine,
    jsonLogMessagesSince,
    markUsageLog,
    present,
    usageLinesSince,
    usageValue,
    type UsageLine,
    type UsageLogMark,
} from '../lib/usageLog';
import { retryOnceOnVariance } from '../lib/variance';

// Plan T1.7. Deterministic on shape. The endpoint answers 200 [] when the
// model call fails or hits its own abort (AbortSignal.timeout(25_000) in
// chartSimilarity.ts), so only the backend log tells an empty result from a
// failure; a failure once is retried, twice is real.
// Preconditions: seeded charts. The ledger half needs E2E_AI_BACKEND_LOG
// (LIGHTDASH_LOG_FORMAT=json, debug level for the failure and decision lines).

// A seeded chart with a seeded copy, so the comparison has a candidate.
const SOURCE_CHART_NAME =
    'How do orders break down by completion status, shipping method, and cost tier?';

const similarPath = `/api/v1/projects/${projectUuid}/review-requests/similar`;

// ContentReviewSimilarContentItem as this endpoint fills it: sanitised to at
// most five matches, explanations cut to 240 characters, unrelated dropped.
const matchesSchema = z
    .array(
        z.object({
            contentType: z.literal(ContentReviewContentType.CHART),
            contentUuid: z.string(),
            name: z.string(),
            score: z.union([z.literal(100), z.literal(75)]),
            matchReason: z.enum(['potential_duplicate', 'related']),
            explanation: z.string().min(1).max(240),
        }),
    )
    .max(5);

const savedChartSchema = z.object({
    name: z.string(),
    metricQuery: z.record(z.string(), z.unknown()),
    parameters: z.record(z.string(), z.unknown()).optional(),
    merge: z.unknown(),
});

type SimilarityPath =
    | { kind: 'model'; line: UsageLine }
    | { kind: 'failed'; messages: string[] }
    | { kind: 'decision-client' }
    | { kind: 'no-model-call' };

const FAILURE_PREFIX = 'Chart similarity AI unavailable';
const DECISION_PREFIX = 'AI agent decision: chart-reuse, outcome=success';

const readPath = async (
    mark: Extract<UsageLogMark, { kind: 'marked' }>,
): Promise<SimilarityPath> => {
    const line = (await usageLinesSince(mark)).find(
        (usage) =>
            usageValue(usage, 'feature') === 'chart-similarity' &&
            usageValue(usage, 'projectId') === projectUuid,
    );
    if (line !== undefined) return { kind: 'model', line };
    const messages = await jsonLogMessagesSince(mark);
    const failures = messages.filter((m) => m.startsWith(FAILURE_PREFIX));
    if (failures.length > 0) return { kind: 'failed', messages: failures };
    if (messages.some((m) => m.startsWith(DECISION_PREFIX))) {
        return { kind: 'decision-client' };
    }
    return { kind: 'no-model-call' };
};

/** Which path answered, from the log the backend already wrote. */
const similarityPath = async (
    mark: Extract<UsageLogMark, { kind: 'marked' }>,
): Promise<SimilarityPath> => {
    // The lines are written before the response; this only waits for flushing.
    for (let read = 0; read < 20; read += 1) {
        const path = await readPath(mark);
        if (path.kind !== 'no-model-call') return path;
        await sleep(250);
    }
    return { kind: 'no-model-call' };
};

test('T1.7 Chart similarity for review requests', async ({ api }) => {
    const source = await seededChart(api, SOURCE_CHART_NAME);
    const saved = await api.get(
        `/api/v1/saved/${source.uuid}`,
        savedChartSchema,
    );

    await retryOnceOnVariance(async (attemptNumber) => {
        const mark = await markUsageLog();
        // The name and query of the seeded chart, as for an unsaved chart. A
        // run-specific name keeps the 60 s result cache from answering.
        const reply = await api.send('POST', similarPath, {
            contentType: ContentReviewContentType.CHART,
            name: `${saved.name} (e2e ${runId}, attempt ${attemptNumber})`,
            excludeContentUuid: null,
            chart: {
                metricQuery: saved.metricQuery,
                parameters: saved.parameters,
                merge: saved.merge,
            },
        });
        expect(reply.status, reply.text).toBe(200);
        const matches = resultsOf(reply, matchesSchema);
        reportObservation(
            `${matches.length} match(es): ${matches.map((match) => `${match.name} (${match.matchReason})`).join('; ') || 'none'}`,
        );

        switch (mark.kind) {
            case 'unset':
                reportSkippedCheck(
                    'chart similarity ledger',
                    'E2E_AI_BACKEND_LOG is unset, so an empty result cannot be told apart from a failed or aborted model call',
                );
                return { kind: 'pass' };
            case 'marked':
                break;
            default:
                return assertUnreachable(mark, 'Unknown usage log mark');
        }

        const path = await similarityPath(mark);
        switch (path.kind) {
            case 'model':
                expectUsageLine(path.line, {
                    functionId: equals('compareChartQueries'),
                    organizationId: equals(SEED_ORG_1.organization_uuid),
                    projectId: equals(projectUuid),
                    provider: present,
                    model: present,
                    keyManagement: present,
                });
                return { kind: 'pass' };
            case 'failed':
                return {
                    kind: 'variance',
                    assertion:
                        'the similarity model call failed or aborted, and the endpoint answered []',
                    ledger: path.messages,
                };
            case 'decision-client':
                reportSkippedCheck(
                    'Output.object with system + prompt',
                    'the AI decision client answered (ai-agent-fast-decisions on and JEV_API_KEY set), so the model call this test targets did not run',
                );
                return { kind: 'pass' };
            case 'no-model-call':
                reportSkippedCheck(
                    'model call',
                    'no model call, failure or decision was logged: the comparison found no candidates',
                );
                return { kind: 'pass' };
            default:
                return assertUnreachable(path, 'Unknown similarity path');
        }
    });
});
