import { Knex } from 'knex';

const AiDeepResearchRunsTableName = 'ai_deep_research_runs';

const CHART_FENCE_RE = /```chart\n([\s\S]*?)\n```/g;

/**
 * Aligns persisted report chart blocks with the current schema:
 * - `caption` was removed (prose around the chart carries the narrative)
 * - grouped charts (`groupBy`) are no longer supported; they cannot render
 *   from the preserved unpivoted query, so they become table charts, which
 *   show the full breakdown.
 */
const migrateChartBlocks = (markdown: string): string =>
    markdown.replace(CHART_FENCE_RE, (fence, body: string) => {
        let block: Record<string, unknown>;
        try {
            block = JSON.parse(body);
        } catch {
            return fence;
        }
        if (typeof block !== 'object' || block === null) {
            return fence;
        }

        delete block.caption;
        const chartConfig = block.chartConfig as
            | Record<string, unknown>
            | undefined;
        if (
            chartConfig &&
            Array.isArray(chartConfig.groupBy) &&
            chartConfig.groupBy.length > 0
        ) {
            chartConfig.groupBy = null;
            chartConfig.stackBars = null;
            chartConfig.defaultVizType = 'table';
        }

        return `\`\`\`chart\n${JSON.stringify(block)}\n\`\`\``;
    });

export async function up(knex: Knex): Promise<void> {
    const runs = await knex(AiDeepResearchRunsTableName)
        .whereNotNull('result_markdown')
        .select<
            { ai_deep_research_run_uuid: string; result_markdown: string }[]
        >('ai_deep_research_run_uuid', 'result_markdown');

    for (const run of runs) {
        const migrated = migrateChartBlocks(run.result_markdown);
        if (migrated !== run.result_markdown) {
            // eslint-disable-next-line no-await-in-loop
            await knex(AiDeepResearchRunsTableName)
                .where(
                    'ai_deep_research_run_uuid',
                    run.ai_deep_research_run_uuid,
                )
                .update({ result_markdown: migrated });
        }
    }
}

export async function down(): Promise<void> {
    // Lossy transform (captions removed) — not reversible.
}
