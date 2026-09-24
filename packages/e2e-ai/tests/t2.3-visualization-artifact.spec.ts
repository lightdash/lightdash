import { assertUnreachable } from '@lightdash/common';
import { z } from 'zod';
import { agentPath } from '../lib/agents';
import { checkAnsweredTurn } from '../lib/agentTurn';
import { askInNewThread } from '../lib/agentUi';
import { queryRows } from '../lib/db';
import { WITNESS_PROMPTS } from '../lib/fixtureData';
import { expect, test } from '../lib/fixtures';
import { pollQuery } from '../lib/query';
import { retryOnceOnVariance } from '../lib/variance';

// Plan T2.3. V: no chart artifact once may be the model answering with a
// table; twice is real. An artifact row without a rendered visualization is
// real. Preconditions: F1.

const chartArtifactsSchema = z.object({
    ai_artifact_uuid: z.string(),
    ai_artifact_version_uuid: z.string(),
    ai_prompt_uuid: z.string().nullable(),
    has_chart_config: z.boolean(),
});

// The viz-query endpoint starts the chart's query; rows come from polling it.
const vizQuerySchema = z.object({
    source: z.literal('semantic'),
    query: z.object({ queryUuid: z.string() }),
});

test('T2.3 Visualization artifact', async ({ page, api, db, f1Agent }) => {
    await retryOnceOnVariance(async () => {
        const { thread } = await askInNewThread(
            page,
            f1Agent,
            WITNESS_PROMPTS.ordersByStatusChart,
        );
        const promptUuid = thread.firstMessage.uuid;
        const { ledger } = await checkAnsweredTurn(db, promptUuid);

        const artifacts = await queryRows(
            db,
            `SELECT a.ai_artifact_uuid, v.ai_artifact_version_uuid, v.ai_prompt_uuid,
                    v.chart_config IS NOT NULL AS has_chart_config
             FROM ai_artifacts a
             JOIN ai_artifact_versions v ON v.ai_artifact_uuid = a.ai_artifact_uuid
             WHERE a.ai_thread_uuid = $1 AND a.artifact_type = 'chart'`,
            [thread.uuid],
            chartArtifactsSchema,
        );
        if (artifacts.length === 0) {
            return {
                kind: 'variance',
                assertion:
                    'no chart artifact: the model may have answered with a table',
                ledger,
            };
        }
        expect(
            artifacts,
            'chart artifact versions for the thread',
        ).toHaveLength(1);
        const [artifact] = artifacts;
        if (artifact === undefined) throw new Error('No chart artifact');
        expect(artifact, 'chart artifact version').toMatchObject({
            ai_prompt_uuid: promptUuid,
            has_chart_config: true,
        });

        await expect(
            page.getByTestId('ai-visualization').first(),
        ).toBeVisible();
        expect(
            ledger.toolResults.filter(
                (row) =>
                    row.tool_name === 'generateVisualization' &&
                    row.metadata?.status === 'success',
            ).length,
            'successful generateVisualization results',
        ).toBeGreaterThan(0);

        const vizQuery = await api.get(
            `${agentPath(f1Agent)}/artifacts/${artifact.ai_artifact_uuid}/versions/${artifact.ai_artifact_version_uuid}/viz-query`,
            vizQuerySchema,
        );
        const run = await pollQuery(api, vizQuery.query.queryUuid);
        switch (run.kind) {
            case 'rows':
                expect(run.rowCount, 'viz-query rows').toBeGreaterThan(0);
                return { kind: 'pass' };
            case 'error':
                throw new Error(
                    `The artifact's viz query failed: ${run.message}`,
                );
            default:
                return assertUnreachable(run, 'Unknown query run');
        }
    });
});
