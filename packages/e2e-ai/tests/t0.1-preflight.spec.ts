import { assertUnreachable } from '@lightdash/common';
import { z } from 'zod';
import { agentSchema, agentsPath, projectUuid } from '../lib/agents';
import { expect, test } from '../lib/fixtures';
import { reportObservation, reportSkippedCheck } from '../lib/report';
import { jsonLogMessagesSince, markUsageLog } from '../lib/usageLog';

// Plan T0.1. Deterministic: any failure here is environment.
// Preconditions: backend up, seed data present. With E2E_AI_BACKEND_LOG set,
// the backend must log JSON (LIGHTDASH_LOG_FORMAT=json) at a level that
// includes info.

const WITNESS_EXPLORES = ['orders', 'customers', 'payments'];

// HealthService logs this at info on every health check.
const HEALTH_LOG_MESSAGE = 'Health check execution times';

const healthSchema = z.object({
    ai: z.object({ isAmbientAiEnabled: z.boolean() }),
    requiresMigration: z.boolean(),
});

const exploreSummarySchema = z.object({
    name: z.string(),
    errors: z.array(z.object({ message: z.string() })).optional(),
});

test('T0.1 Preflight: AI on, explores present, fixture agent', async ({
    api,
    f1Agent,
}) => {
    await test.step('ambient AI is enabled', async () => {
        const health = await api.get('/api/v1/health', healthSchema);
        expect(health.ai.isAmbientAiEnabled, 'ai.isAmbientAiEnabled').toBe(
            true,
        );
        // A pending migration is a normal dev state, not an AI defect.
        if (health.requiresMigration) {
            reportObservation(
                'the backend reports pending DB migrations (health.requiresMigration); a missing column can explain an odd later failure',
            );
        }
    });

    await test.step('witness explores are present and compile', async () => {
        const explores = await api.get(
            `/api/v1/projects/${projectUuid}/explores`,
            z.array(exploreSummarySchema),
        );
        WITNESS_EXPLORES.forEach((name) => {
            const explore = explores.find((summary) => summary.name === name);
            expect(explore, `explore ${name}`).toBeDefined();
            expect(explore?.errors ?? [], `errors on explore ${name}`).toEqual(
                [],
            );
        });
    });

    await test.step('fixture agent F1 is created and reads back', async () => {
        expect(f1Agent).toMatchObject({
            enableDataAccess: true,
            enableSqlMode: true,
            enableContentTools: false,
        });
        const readBack = await api.get(
            `${agentsPath}/${f1Agent.uuid}`,
            agentSchema,
        );
        expect(readBack).toEqual(f1Agent);
    });

    await test.step('backend log witness is readable, growing and JSON', async () => {
        const mark = await markUsageLog();
        switch (mark.kind) {
            case 'unset':
                reportSkippedCheck(
                    'backend log witness',
                    'E2E_AI_BACKEND_LOG is unset, so attribution checks in later tests are skipped',
                );
                return;
            case 'marked':
                await api.get('/api/v1/health', healthSchema);
                await expect
                    .poll(
                        async () =>
                            (await jsonLogMessagesSince(mark)).some((message) =>
                                message.startsWith(HEALTH_LOG_MESSAGE),
                            ),
                        {
                            message: `${mark.path} gains the health check's JSON info line`,
                        },
                    )
                    .toBe(true);
                return;
            default:
                assertUnreachable(mark, 'Unknown usage log mark');
        }
    });
});
