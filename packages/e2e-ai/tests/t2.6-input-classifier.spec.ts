import { assertUnreachable } from '@lightdash/common';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { Agent } from '../lib/agents';
import type { LightdashApi } from '../lib/api';
import { single } from '../lib/assert';
import { queryRows } from '../lib/db';
import { expect, test } from '../lib/fixtures';
import { attachJson, reportObservation } from '../lib/report';
import { createThread, generateAnswer } from '../lib/threads';
import { explainFromLog, markUsageLog } from '../lib/usageLog';

// Plan T2.6. V only on the reply triggering the regex pre-gate; a gated reply
// whose classification never lands within the classifier's abort window is
// real. Preconditions: AI_AGENT_PROMPT_INPUT_REQUEST_CLASSIFIER_ENABLED=true
// on the backend, mirrored in the runner's env so the test knows; F3.

// promptInputRequestClassifier.ts: PROMPT_INPUT_REQUEST_CLASSIFIER_TIMEOUT_MS,
// and CLARIFYING_QUESTION_RE, the pre-gate.
const CLASSIFIER_ABORT_MS = 10_000;
const CLARIFYING_QUESTION_RE =
    /(\?\s*$)|(could you clarify)|(did you mean)|(which (one|of these))|(let me know which)|(what would you like)/i;
// The classification is written after the model call returns.
const WRITE_MARGIN_MS = 5_000;

const PROMPT = 'Tell me about orders';

const classificationSchema = z.object({
    responded_at: z.date().nullable(),
    needs_user_input: z.boolean().nullable(),
    needs_user_input_metadata: z
        .object({
            gate: z.enum(['match', 'no_match']),
            model: z.string().nullable(),
            durationMs: z.number(),
            confidence: z.number().nullable(),
        })
        .nullable(),
});

const readClassification = async (db: Pool, promptUuid: string) =>
    single(
        await queryRows(
            db,
            `SELECT responded_at, needs_user_input, needs_user_input_metadata
             FROM ai_prompt WHERE ai_prompt_uuid = $1`,
            [promptUuid],
            classificationSchema,
        ),
        `ai_prompt ${promptUuid}`,
    );

/** Polls until classified, giving up once the abort window has passed. */
const awaitClassification = async (
    db: Pool,
    promptUuid: string,
    windowStart: Date,
) => {
    const deadline =
        windowStart.getTime() + CLASSIFIER_ABORT_MS + WRITE_MARGIN_MS;
    for (;;) {
        const row = await readClassification(db, promptUuid);
        if (row.needs_user_input !== null || Date.now() > deadline) return row;
        await sleep(500);
    }
};

type Classified =
    | { kind: 'gate-not-triggered'; response: string }
    | { kind: 'classified'; promptUuid: string; threadUuid: string };

const answerAndClassify = async (
    api: LightdashApi,
    db: Pool,
    agent: Agent,
): Promise<Classified> => {
    const mark = await markUsageLog();
    const thread = await createThread(api, agent, PROMPT);
    const promptUuid = thread.firstMessage.uuid;
    const { response } = await generateAnswer(api, agent, thread.uuid);
    const answered = await readClassification(db, promptUuid);
    if (answered.responded_at === null)
        throw new Error('ai_prompt.responded_at is null');
    const row = await awaitClassification(
        db,
        promptUuid,
        answered.responded_at,
    );
    await attachJson('classification', { response, row });

    if (row.needs_user_input === null) {
        if (!CLARIFYING_QUESTION_RE.test(response)) {
            // The gate writes false for a non-matching reply, so nothing at
            // all means the classifier is not running.
            throw new Error(
                'needs_user_input stayed null for a reply the gate does not match: the backend is not running the classifier (AI_AGENT_PROMPT_INPUT_REQUEST_CLASSIFIER_ENABLED)',
            );
        }
        throw new Error(
            `The reply matched the gate but no classification landed within the ${CLASSIFIER_ABORT_MS} ms abort window. ${await explainFromLog(
                mark,
                ['AI agent prompt input request classification failed'],
            )}. With no failure logged, the backend is probably not running the classifier (AI_AGENT_PROMPT_INPUT_REQUEST_CLASSIFIER_ENABLED).`,
        );
    }
    const metadata = row.needs_user_input_metadata;
    if (metadata === null) throw new Error('needs_user_input_metadata is null');
    switch (metadata.gate) {
        case 'no_match':
            return { kind: 'gate-not-triggered', response };
        case 'match':
            expect(metadata.model, 'classifier model').not.toBeNull();
            reportObservation(
                `needs_user_input=${row.needs_user_input}, confidence=${metadata.confidence}`,
            );
            return { kind: 'classified', promptUuid, threadUuid: thread.uuid };
        default:
            return assertUnreachable(metadata.gate, 'Unknown classifier gate');
    }
};

test('T2.6 Needs-user-input classifier after a reply', async ({
    api,
    db,
    f3Agent,
}) => {
    test.skip(
        process.env.AI_AGENT_PROMPT_INPUT_REQUEST_CLASSIFIER_ENABLED !== 'true',
        'set AI_AGENT_PROMPT_INPUT_REQUEST_CLASSIFIER_ENABLED=true on the backend and export it in the runner shell too: no endpoint reports the setting, so the test reads the runner copy',
    );

    let classified: Extract<Classified, { kind: 'classified' }> | null = null;
    for (const attempt of [1, 2]) {
        const outcome = await answerAndClassify(api, db, f3Agent);
        if (outcome.kind === 'classified') {
            classified = outcome;
            break;
        }
        reportObservation(
            `attempt ${attempt}: the reply did not trigger the gate: ${outcome.response.slice(-200)}`,
        );
    }
    if (classified === null) {
        test.skip(
            true,
            "F3's reply twice did not end with a question, so the classifier's gate could not fire",
        );
        return;
    }

    const first = await readClassification(db, classified.promptUuid);
    // A second answer to the same prompt must not replace the classification.
    await generateAnswer(api, f3Agent, classified.threadUuid);
    await sleep(CLASSIFIER_ABORT_MS + WRITE_MARGIN_MS);
    const second = await readClassification(db, classified.promptUuid);
    expect(
        {
            needsUserInput: second.needs_user_input,
            metadata: second.needs_user_input_metadata,
        },
        'classification after a second generate',
    ).toEqual({
        needsUserInput: first.needs_user_input,
        metadata: first.needs_user_input_metadata,
    });
});
