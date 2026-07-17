import { Knex } from 'knex';

const AiDeepResearchRunsTableName = 'ai_deep_research_runs';
const QueryHistoryTableName = 'query_history';

const CHART_FENCE_RE = /```chart\n([\s\S]*?)\n```/g;

type LegacyChartBlock = {
    queryUuid: string;
    title: string;
    chartConfig: Record<string, unknown>;
};

const parseLegacyChartBlock = (body: string): LegacyChartBlock | null => {
    let block: unknown;
    try {
        block = JSON.parse(body);
    } catch {
        return null;
    }
    if (
        typeof block !== 'object' ||
        block === null ||
        !('queryUuid' in block) ||
        !('title' in block) ||
        !('chartConfig' in block) ||
        typeof block.queryUuid !== 'string' ||
        typeof block.title !== 'string' ||
        typeof block.chartConfig !== 'object' ||
        block.chartConfig === null
    ) {
        return null;
    }
    return {
        queryUuid: block.queryUuid,
        title: block.title,
        chartConfig: block.chartConfig as Record<string, unknown>,
    };
};

/**
 * Reports now persist charts as `[title](#chart-<key>)` references in the
 * markdown plus render data in `result_chart_data`. Converts previously
 * persisted fenced ```chart blocks: the fence becomes a reference and its
 * query's metricQuery/fields move into the chart-data map. Historical charts
 * carry no snapshot (`snapshot: null`) and render via live refresh.
 */
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.jsonb('result_chart_data').nullable();
    });

    const runs = await knex(AiDeepResearchRunsTableName)
        .whereNotNull('result_markdown')
        .select<
            { ai_deep_research_run_uuid: string; result_markdown: string }[]
        >('ai_deep_research_run_uuid', 'result_markdown');

    for (const run of runs) {
        const chartData: Record<string, unknown> = {};
        let changed = false;

        const fences = [...run.result_markdown.matchAll(CHART_FENCE_RE)];
        let migrated = run.result_markdown;
        for (const fence of fences) {
            const block = parseLegacyChartBlock(fence[1]);
            let query:
                | {
                      metric_query: Record<string, unknown>;
                      fields: Record<string, unknown>;
                  }
                | undefined;
            if (block) {
                // eslint-disable-next-line no-await-in-loop
                query = await knex(QueryHistoryTableName)
                    .where('query_uuid', block.queryUuid)
                    .select('metric_query', 'fields')
                    .first();
            }

            const replacement =
                block && query
                    ? `[${block.title}](#chart-${block.queryUuid})`
                    : '*(chart omitted: its query evidence could not be verified)*';
            if (block && query) {
                chartData[block.queryUuid] = {
                    source: 'warehouse',
                    title: block.title,
                    chartConfig: block.chartConfig,
                    queryUuid: block.queryUuid,
                    derivedFrom: null,
                    metricQuery: query.metric_query,
                    fields: query.fields,
                    snapshot: null,
                };
            }
            migrated = migrated.replace(fence[0], replacement);
            changed = true;
        }

        if (changed) {
            // eslint-disable-next-line no-await-in-loop
            await knex(AiDeepResearchRunsTableName)
                .where(
                    'ai_deep_research_run_uuid',
                    run.ai_deep_research_run_uuid,
                )
                .update({
                    result_markdown: migrated,
                    result_chart_data: JSON.stringify(chartData),
                });
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    // The fence-to-reference markdown rewrite is not reversible.
    await knex.schema.alterTable(AiDeepResearchRunsTableName, (table) => {
        table.dropColumn('result_chart_data');
    });
}
