import { SEED_ORG_1 } from '@lightdash/common';
import { z } from 'zod';
import { projectUuid } from '../lib/agents';
import { resultsOf } from '../lib/api';
import { single } from '../lib/assert';
import { baseTableOf, fieldId, getExplore } from '../lib/explores';
import { expect, test } from '../lib/fixtures';
import { reportObservation } from '../lib/report';
import {
    equals,
    expectUsageLine,
    markUsageLog,
    present,
    usageTokens,
    usageValue,
    witnessUsage,
} from '../lib/usageLog';

// Plan T0.2. Deterministic: a non-200 or a body that is not { html } is real;
// a missing attribution field on the line is real.
// Preconditions: T0.1's environment. The attribution half needs
// E2E_AI_BACKEND_LOG and the backend on LIGHTDASH_LOG_FORMAT=json; with the
// log path unset it is reported skipped.

// useGenerateTooltip aborts the request after this long.
const UI_ABORT_MS = 10_000;

test('T0.2 Tooltip generation, the smallest model round trip', async ({
    api,
}) => {
    const orders = await getExplore(api, 'orders');
    const metric = Object.values(baseTableOf(orders).metrics)[0];
    if (metric === undefined) throw new Error('orders has no metric');

    const mark = await markUsageLog();
    const startedAt = Date.now();
    // The body the UI sends: field ids only.
    const reply = await api.send(
        'POST',
        `/api/v1/ai/${projectUuid}/tooltip/generate`,
        {
            prompt: 'show the value with two decimals',
            fieldsContext: [{ name: fieldId(metric) }],
        },
    );
    const wallMs = Date.now() - startedAt;
    reportObservation(
        `tooltip round trip took ${wallMs} ms${wallMs > UI_ABORT_MS ? `, longer than the UI's ${UI_ABORT_MS} ms abort` : ''}`,
    );

    expect(reply.status, reply.text).toBe(200);
    resultsOf(reply, z.object({ html: z.string().min(1) }));

    await witnessUsage(
        mark,
        'tooltip attribution',
        (line) =>
            usageValue(line, 'feature') === 'tooltip' &&
            usageValue(line, 'projectId') === projectUuid,
        (lines) => {
            const line = single(lines, 'tooltip AI usage line');
            expectUsageLine(line, {
                functionId: equals('generateTooltip'),
                organizationId: equals(SEED_ORG_1.organization_uuid),
                projectId: equals(projectUuid),
                provider: present,
                model: present,
                keyManagement: present,
            });
            expect(usageTokens(line, 'totalTokens')).toBeGreaterThan(0);
        },
    );
});
