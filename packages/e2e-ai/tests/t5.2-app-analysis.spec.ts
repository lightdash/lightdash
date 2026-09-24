import { SEED_ORG_1_ADMIN } from '@lightdash/common';
import type { Pool } from 'pg';
import type { Response } from 'playwright/test';
import { z } from 'zod';
import { replyOfResponse, resultsOf } from '../lib/api';
import { single } from '../lib/assert';
import { markUndone, recordUndo } from '../lib/cleanupLedger';
import { requireAppRuntime, requireDataApps } from '../lib/dataApps';
import { queryRows } from '../lib/db';
import { expect, test } from '../lib/fixtures';
import { isFeatureFlagEnabled } from '../lib/flags';
import { ensurePlayground } from '../lib/playground';
import { reportObservation } from '../lib/report';

// Plan T5.2. Nothing variance-prone is asserted (anomaly presence is
// reported), so no retry. Preconditions, all read before anything is
// created: data apps and enable-data-app-analysis on, the app runtime
// mounted, and new-onboarding on so the F5 playground can be ensured. F5
// exists only in an organization that had no project, so the seed org skips.
// The org's data app runtime AI setting is switched on for the test and
// restored. NOT YET VERIFIED LIVE.

const SETTINGS_PATH = '/api/v1/aiAgents/admin/settings';
// DataAppAnalysisService's note when grounding dropped findings.
const UNMATCHED_LIMITATION =
    /^(\d+) findings? could not be matched to the data/;

const sourcesSchema = z.array(
    z.object({ queryUuid: z.string(), label: z.string().nullable() }),
);
type Sources = z.output<typeof sourcesSchema>;

// DataAppDetectionSchema after grounding, plus the stored analysis id.
const analysisSchema = z.object({
    analysisId: z.string(),
    headline: z.string().min(1).max(200),
    summary: z.string().min(1).max(1200),
    anomalies: z.array(
        z.object({
            id: z.string(),
            severity: z.enum(['high', 'medium', 'positive', 'info']),
            text: z.string(),
            queryUuid: z.string(),
            fieldId: z.string(),
            dimensionValues: z.record(z.string(), z.string()),
            expected: z.string().nullable(),
            actual: z.string().nullable(),
        }),
    ),
    limitations: z.array(z.string()),
    dataAsOf: z.string().nullable(),
});
type Analysis = z.output<typeof analysisSchema>;

/** Grounding as seen from outside: every finding names a query it was given. */
const checkGrounded = (analysis: Analysis, sources: Sources, label: string) => {
    const queryUuids = sources.map((source) => source.queryUuid);
    analysis.anomalies.forEach((anomaly) => {
        expect(queryUuids, `${label}: anomaly ${anomaly.id} query`).toContain(
            anomaly.queryUuid,
        );
    });
    const dropped = analysis.limitations.flatMap((limitation) => {
        const match = UNMATCHED_LIMITATION.exec(limitation);
        return match ? [Number(match[1])] : [];
    });
    expect(
        dropped.length,
        `${label}: unmatched findings notes`,
    ).toBeLessThanOrEqual(1);
    dropped.forEach((count) =>
        expect(count, `${label}: findings dropped`).toBeGreaterThan(0),
    );
    const tableWide = analysis.anomalies.filter(
        (anomaly) => Object.keys(anomaly.dimensionValues).length === 0,
    ).length;
    reportObservation(
        `${label}: ${analysis.anomalies.length} anomalies (${tableWide} about a whole table), ${dropped[0] ?? 0} dropped as unmatched`,
    );
};

const readAnalysisRow = async (db: Pool, analysisUuid: string) =>
    single(
        await queryRows(
            db,
            `SELECT operation, model_id FROM data_app_analyses
             WHERE data_app_analysis_uuid = $1`,
            [analysisUuid],
            z.object({
                operation: z.string(),
                model_id: z.string().nullable(),
            }),
        ),
        `data_app_analyses ${analysisUuid}`,
    );

const countAnalysisRows = async (db: Pool, appId: string) =>
    single(
        await queryRows(
            db,
            `SELECT COUNT(*)::int AS count FROM data_app_analyses
             WHERE app_id = $1 AND created_by_user_uuid = $2`,
            [appId, SEED_ORG_1_ADMIN.user_uuid],
            z.object({ count: z.number() }),
        ),
        'data_app_analyses count',
    ).count;

const isPostTo = (path: string) => (response: Response) =>
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === path;

test('T5.2 Data app analysis: detect, prompt, lookup reuse', async ({
    page,
    api,
    db,
}) => {
    await requireDataApps(api);
    test.skip(
        !(await isFeatureFlagEnabled(api, 'enable-data-app-analysis')),
        'data app analysis is off: enable the enable-data-app-analysis feature flag',
    );
    await requireAppRuntime(api);
    test.skip(
        !(await isFeatureFlagEnabled(api, 'new-onboarding')),
        'playground projects are off: the F5 ensure needs the new-onboarding feature flag',
    );

    // F5: idempotent, reused across runs, never deleted.
    const playground = await ensurePlayground(api, db);
    const app = single(
        await queryRows(
            db,
            `SELECT DISTINCT a.app_id FROM apps a
             JOIN app_versions v ON v.app_id = a.app_id
             WHERE a.project_uuid = $1 AND a.name = 'Jaffle pulse'
               AND a.deleted_at IS NULL AND v.status = 'ready'`,
            [playground.projectUuid],
            z.object({ app_id: z.string() }),
        ),
        `ready "Jaffle pulse" in the playground ${playground.projectUuid}, which F5 seeds when app-runtime S3 is mounted`,
    );
    const analysisPath = `/api/v2/projects/${playground.projectUuid}/apps/${app.app_id}/analysis`;

    const settings = await api.get(
        SETTINGS_PATH,
        z.looseObject({ dataAppRuntimeAiEnabled: z.boolean().optional() }),
    );
    const previous = {
        dataAppRuntimeAiEnabled: settings.dataAppRuntimeAiEnabled ?? false,
    };
    const undo = recordUndo({
        kind: 'http',
        method: 'PATCH',
        path: SETTINGS_PATH,
        body: previous,
    });
    await api.patch(
        SETTINGS_PATH,
        { dataAppRuntimeAiEnabled: true },
        z.unknown(),
    );
    try {
        const sources =
            await test.step('browser: detect from the analysis panel', async () => {
                await page.goto(
                    `/projects/${playground.projectUuid}/apps/${app.app_id}/view`,
                );
                // The header toggle opens the panel.
                await page
                    .getByRole('button', { name: 'Analyse this view' })
                    .click();
                const panel = page.getByTestId('data-app-analysis-panel');
                await expect(panel).toBeVisible();
                const detected = page.waitForResponse(
                    isPostTo(`${analysisPath}/detect`),
                    { timeout: 0 },
                );
                // "Re-analyse" once a stored analysis of these rows has loaded.
                await panel
                    .getByRole('button', {
                        name: /^(Analyse this view|Re-analyse)$/,
                    })
                    .click();
                const response = await detected;
                const analysis = resultsOf(
                    await replyOfResponse(response),
                    analysisSchema,
                );
                const body = z
                    .object({ sources: sourcesSchema, force: z.boolean() })
                    .parse(response.request().postDataJSON());
                reportObservation(
                    `browser detect sent force=${body.force}; a stored analysis of the same rows is reused unless forced`,
                );
                checkGrounded(analysis, body.sources, 'browser detect');
                await expect(
                    panel.getByText(analysis.headline, { exact: true }),
                ).toBeVisible();
                expect(
                    (await readAnalysisRow(db, analysis.analysisId)).model_id,
                    'browser analysis model_id',
                ).not.toBeNull();
                return body.sources;
            });

        await test.step('API: forced detect, lookup reuse, prompt', async () => {
            const before = await countAnalysisRows(db, app.app_id);
            // Without force the same rows return the stored analysis and
            // never reach the model.
            const detection = await api.post(
                `${analysisPath}/detect`,
                { sources, force: true },
                analysisSchema,
            );
            checkGrounded(detection, sources, 'API detect');
            const detectRow = await readAnalysisRow(db, detection.analysisId);
            expect(detectRow.operation).toBe('detect');
            expect(detectRow.model_id, 'detect model_id').not.toBeNull();
            expect(
                await countAnalysisRows(db, app.app_id),
                'rows after detect',
            ).toBe(before + 1);

            const lookup = await api.post(
                `${analysisPath}/lookup`,
                { sources },
                z
                    .object({ analysis: z.object({ analysisId: z.string() }) })
                    .nullable(),
            );
            expect(
                lookup?.analysis.analysisId,
                'lookup returns the stored analysis',
            ).toBe(detection.analysisId);
            expect(
                await countAnalysisRows(db, app.app_id),
                'rows after lookup',
            ).toBe(before + 1);

            const answer = await api.post(
                `${analysisPath}/prompt`,
                { prompt: 'What stands out?', sources },
                z.object({ promptId: z.string(), text: z.string() }),
            );
            expect(answer.text.trim(), 'prompt answer').not.toBe('');
            const promptRow = await readAnalysisRow(db, answer.promptId);
            expect(promptRow.operation).toBe('prompt');
            expect(promptRow.model_id, 'prompt model_id').not.toBeNull();
            expect(
                await countAnalysisRows(db, app.app_id),
                'rows after prompt',
            ).toBe(before + 2);
        });
    } finally {
        await api.patch(SETTINGS_PATH, previous, z.unknown());
        markUndone(undo);
    }
});
