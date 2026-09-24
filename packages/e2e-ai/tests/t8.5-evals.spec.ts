import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { agentPath } from '../lib/agents';
import type { LightdashApi } from '../lib/api';
import { single } from '../lib/assert';
import { markUndone, recordUndo } from '../lib/cleanupLedger';
import { optInEnabled, runId } from '../lib/env';
import { WITNESS_PROMPTS } from '../lib/fixtureData';
import { expect, test } from '../lib/fixtures';
import { reportObservation, reportWarning } from '../lib/report';

// Plan T8.5 (O). Verdicts are not asserted. A result the product gives up on
// (its stale-lock sweeper fails interrupted results) is red with its error.
// Preconditions: F1.

const EXPECTED =
    'The answer states the total number of orders as a single number.';
// A run whose results no scheduler worker picks up by then has no worker.
const START_WINDOW_MS = 60_000;

const resultSchema = z.object({
    resultUuid: z.string(),
    evalPromptUuid: z.string().nullable(),
    status: z.enum(['pending', 'running', 'completed', 'assessing', 'failed']),
    errorMessage: z.string().nullable(),
    prompt: z.string().nullable(),
    expectedResponse: z.string().nullable(),
    assessment: z
        .object({
            assessmentType: z.string(),
            passed: z.boolean(),
            reason: z.string().nullable(),
            llmJudgeProvider: z.string().nullable(),
            llmJudgeModel: z.string().nullable(),
        })
        .nullable(),
});
const runSchema = z.object({
    runUuid: z.string(),
    status: z.enum(['pending', 'running', 'completed', 'failed']),
    results: z.array(resultSchema),
});

const isSettled = (status: string) =>
    status === 'completed' || status === 'failed';

/** Polls the run until it and every result are settled. */
const awaitRun = async (api: LightdashApi, runPath: string) => {
    const startedAt = Date.now();
    for (;;) {
        const run = await api.get(runPath, runSchema);
        if (
            isSettled(run.status) &&
            run.results.every((result) => isSettled(result.status))
        ) {
            return run;
        }
        if (
            run.results.every((result) => result.status === 'pending') &&
            Date.now() - startedAt > START_WINDOW_MS
        ) {
            throw new Error(
                `No scheduler worker started the evaluation within ${START_WINDOW_MS / 1000} s`,
            );
        }
        await sleep(2_000);
    }
};

test.skip(
    !optInEnabled,
    'opt-in (O): set E2E_AI_OPT_IN=1; the evaluation runs F1 on two prompts and a judge on each answer',
);

test('T8.5 Evals run with judge scoring', async ({ api, f1Agent }) => {
    const evaluationsPath = `${agentPath(f1Agent)}/evaluations`;
    const { evalUuid } = await api.post(
        evaluationsPath,
        {
            title: `e2e-ai eval ${runId}`,
            prompts: [
                {
                    prompt: WITNESS_PROMPTS.totalOrders,
                    expectedResponse: EXPECTED,
                },
                { prompt: WITNESS_PROMPTS.topCustomer, expectedResponse: null },
            ],
        },
        z.object({ evalUuid: z.string() }),
    );
    const evalPath = `${evaluationsPath}/${evalUuid}`;
    const undo = recordUndo({ kind: 'http', method: 'DELETE', path: evalPath });
    try {
        const { runUuid } = await api.post(
            `${evalPath}/run`,
            {},
            z.object({ runUuid: z.string() }),
        );
        const run = await awaitRun(api, `${evalPath}/runs/${runUuid}`);
        expect(run.results.length, 'one result per prompt').toBe(2);
        expect(
            new Set(run.results.map((result) => result.evalPromptUuid)).size,
            'distinct prompts',
        ).toBe(2);
        run.results.forEach((result) =>
            expect(
                result.status,
                `${result.prompt}: ${result.errorMessage ?? ''}`,
            ).toBe('completed'),
        );
        expect(run.status, 'run status').toBe('completed');

        const withExpected = single(
            run.results.filter((result) => result.expectedResponse !== null),
            'result with an expected answer',
        );
        const { assessment } = withExpected;
        if (assessment === null) {
            throw new Error(
                'The result with an expected answer was never assessed',
            );
        }
        expect(assessment.assessmentType).toBe('llm');
        expect(assessment.llmJudgeProvider, 'judge provider').not.toBeNull();
        expect(assessment.llmJudgeModel, 'judge model').not.toBeNull();
        expect(assessment.reason ?? '', 'factuality verdict').toContain(
            'Factuality score passed:',
        );
        run.results.forEach((result) => {
            const relevancy = result.assessment?.reason?.includes(
                'Context relevancy score passed:',
            );
            reportObservation(
                `${result.prompt}: ${result.assessment === null ? 'unassessed (no expected answer and no context)' : `passed=${result.assessment.passed}, context relevancy ${relevancy ? 'judged' : 'not judged (no query context)'}`}`,
            );
        });
        reportWarning(
            'assessment scores are not observable: only passed and a reason text are stored, so the schema bounds of the judge scores are not checked',
        );
    } finally {
        await api.delete(evalPath);
        markUndone(undo);
    }
});
