import {
    assertUnreachable,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
} from '@lightdash/common';
import { z } from 'zod';
import { projectUuid } from '../lib/agents';
import { resultsOf } from '../lib/api';
import { single } from '../lib/assert';
import { requireDataApps } from '../lib/dataApps';
import { expect, test } from '../lib/fixtures';
import { reportObservation, reportSkippedCheck } from '../lib/report';
import {
    equals,
    expectUsageLine,
    jsonLogMessagesSince,
    markUsageLog,
    usageValue,
    witnessUsage,
} from '../lib/usageLog';

// Plan T5.1. Deterministic. Clarify persists nothing and answers 200 with no
// questions on any failure, so the backend log is the only proof the model
// was consulted: "App clarify: N question(s)" per call, never a failure.
// Preconditions: data apps enabled (APPS_RUNTIME_ENABLED=true). The log half
// needs E2E_AI_BACKEND_LOG with the backend on LIGHTDASH_LOG_FORMAT=json.

const PROMPTS = {
    vague: 'make me an app',
    specified:
        'Build an app with two charts side by side, a bar chart of the number of orders by status and a line chart of total order amount by month, and below them a table of the ten customers with the most orders.',
};

const clarifyPath = `/api/v1/ee/projects/${projectUuid}/apps/clarify`;

// AppGenerateService.clarifyApp's log lines; only the first two name the
// project.
const SUCCESS_PREFIX = 'App clarify: ';
const FAILURE_PREFIX = 'App clarify failed';
const NO_PROVIDER_PREFIX = 'Skipping app clarification';

test('T5.1 Data app clarify', async ({ api }) => {
    await requireDataApps(api);
    for (const [label, prompt] of Object.entries(PROMPTS)) {
        await test.step(`${label} prompt`, async () => {
            const mark = await markUsageLog();
            const reply = await api.send('POST', clarifyPath, { prompt });
            expect(reply.status, reply.text).toBe(200);
            const { questions } = resultsOf(
                reply,
                z.object({ questions: z.array(z.string().min(1)).max(4) }),
            );
            reportObservation(`${label}: ${questions.length} question(s)`);

            switch (mark.kind) {
                case 'unset':
                    reportSkippedCheck(
                        `${label} clarify ledger`,
                        'E2E_AI_BACKEND_LOG is unset, so an empty answer cannot be told apart from the no-questions fallback',
                    );
                    return;
                case 'marked': {
                    // Written before the response; this only waits for flushing.
                    let messages: string[] = [];
                    await expect
                        .poll(
                            async () => {
                                messages = (
                                    await jsonLogMessagesSince(mark)
                                ).filter(
                                    (message) =>
                                        message.startsWith(
                                            NO_PROVIDER_PREFIX,
                                        ) ||
                                        (message.includes(
                                            `project=${projectUuid}`,
                                        ) &&
                                            [
                                                SUCCESS_PREFIX,
                                                FAILURE_PREFIX,
                                            ].some((prefix) =>
                                                message.startsWith(prefix),
                                            )),
                                );
                                return messages.length;
                            },
                            { message: 'App clarify log line' },
                        )
                        .toBeGreaterThan(0);
                    const line = single(
                        messages,
                        `${label} App clarify log line`,
                    );
                    expect(line, 'App clarify outcome').toMatch(
                        new RegExp(
                            `^${SUCCESS_PREFIX}${questions.length} question\\(s\\)`,
                        ),
                    );
                    await witnessUsage(
                        mark,
                        `${label} clarify attribution`,
                        (usage) =>
                            usageValue(usage, 'feature') === 'data-app' &&
                            usageValue(usage, 'functionId') === 'clarifyApp',
                        (lines) =>
                            expectUsageLine(
                                single(lines, 'clarifyApp usage line'),
                                {
                                    organizationId: equals(
                                        SEED_ORG_1.organization_uuid,
                                    ),
                                    projectId: equals(projectUuid),
                                    userId: equals(SEED_ORG_1_ADMIN.user_uuid),
                                },
                            ),
                    );
                    return;
                }
                default:
                    assertUnreachable(mark, 'Unknown usage log mark');
            }
        });
    }
});
