import { type z } from 'zod';
import { MetricType } from '../../../../types/field';
import { MergeJoinType } from '../../../../types/mergeQuery';
import { QuerySourceType } from '../../../../types/querySources';
import { type createToolComposerQueriesArgsSchema } from './toolComposerQueryArgs';

type QueryPipelineNodeInput = z.input<
    ReturnType<typeof createToolComposerQueriesArgsSchema>
>['queries'][number];

// `query` arguments the MCP query-pipelines skill shows; a backend test parses each with the registered `query` schema.
type QueryPipelineExample = {
    intro: string;
    args: {
        sessionId?: string;
        terminalNodeId?: string;
        queries: QueryPipelineNodeInput[];
    };
};

export const QUERY_PIPELINE_EXAMPLES: QueryPipelineExample[] = [
    {
        intro: 'Two `semanticLayer` nodes → `merge` → `python`:',
        args: {
            terminalNodeId: 'rate_trend',
            queries: [
                {
                    sourceType: QuerySourceType.SEMANTIC_LAYER,
                    nodeId: 'inv_mo',
                    title: 'Invoices by month',
                    description:
                        'Monthly invoiced amount, prior-year amount, paid count.',
                    exploreName: 'invoices',
                    dimensions: ['invoices_date_month'],
                    metrics: ['invoices_amount'],
                    customMetrics: [
                        {
                            table: 'invoices',
                            name: 'paid_count',
                            label: 'Paid invoices',
                            aggregation: MetricType.COUNT_DISTINCT,
                            dimensionFieldId: 'invoices_id',
                            filter: 'invoices_status equals="paid"',
                        },
                    ],
                    periodComparisons: [
                        {
                            metricFieldId: 'invoices_amount',
                            timeDimensionFieldId: 'invoices_date_month',
                            periodOffset: 12,
                        },
                    ],
                    filters: {
                        dimensions:
                            'invoices_date_month inThePast=12{unit:months,completed:true}',
                        metrics: null,
                    },
                },
                {
                    sourceType: QuerySourceType.SEMANTIC_LAYER,
                    nodeId: 'tkt_mo',
                    title: 'Tickets by month',
                    description: 'Counts tickets opened per month.',
                    exploreName: 'tickets',
                    dimensions: ['tickets_date_month'],
                    metrics: ['tickets_count'],
                },
                {
                    sourceType: QuerySourceType.MERGE,
                    nodeId: 'inv_tkt',
                    title: 'Monthly ticket rate',
                    description:
                        'Joins invoices and tickets by month with rate.',
                    sources: [{ nodeId: 'inv_mo' }, { nodeId: 'tkt_mo' }],
                    joinKey: [
                        {
                            name: 'month',
                            fields: [
                                {
                                    nodeId: 'inv_mo',
                                    fieldId: 'invoices_date_month',
                                },
                                {
                                    nodeId: 'tkt_mo',
                                    fieldId: 'tickets_date_month',
                                },
                            ],
                        },
                    ],
                    joinType: MergeJoinType.LEFT,
                    tableCalculations: [
                        {
                            name: 'ticket_rate',
                            displayName: 'Ticket rate',
                            formula:
                                'COALESCE(tkt_mo_tickets_count, 0) / inv_mo_invoices_paid_count',
                            format: { type: 'number', decimals: 2 },
                        },
                    ],
                    sorts: [{ fieldId: 'merge_month', descending: false }],
                },
                {
                    sourceType: QuerySourceType.PYTHON,
                    nodeId: 'rate_trend',
                    title: 'Ticket rate trend',
                    description: 'Fits linear slope to ticket rate.',
                    references: ['inv_tkt'],
                    code: 'import numpy as np\nimport pandas as pd\ndef run(inputs, params):\n    df = inputs["inv_tkt"].sort_values("merge_month")\n    y = pd.to_numeric(df["merge_ticket_rate"], errors="coerce")\n    x = np.flatnonzero(y.notna())\n    s = float(np.polyfit(x, y.iloc[x].astype(float), 1)[0]) if len(x) > 1 else np.nan\n    return df.assign(trend_slope=s)',
                },
            ],
        },
    },
    {
        intro: 'Follow-up reusing the saved `inv_mo` through `sessionId`, with `external` → `duckdb`:',
        args: {
            sessionId: '<from earlier result>',
            queries: [
                {
                    sourceType: QuerySourceType.EXTERNAL,
                    nodeId: 'targets_mo',
                    title: 'Monthly targets',
                    description: 'Reads uploaded monthly targets.',
                    tables: ['targets'],
                    sql: 'SELECT month AS mo, target AS goal FROM targets',
                },
                {
                    sourceType: QuerySourceType.DUCKDB,
                    nodeId: 'inv_target',
                    title: 'Invoices vs target',
                    description:
                        'Joins saved invoices to targets with running total.',
                    references: ['inv_mo', 'targets_mo'],
                    sql: 'SELECT i.invoices_date_month AS mo, i.invoices_amount AS amount, t.goal AS target, SUM(i.invoices_amount) OVER (ORDER BY i.invoices_date_month) AS running_total FROM inv_mo AS i LEFT JOIN targets_mo AS t ON i.invoices_date_month = t.mo',
                    limit: 100,
                },
            ],
        },
    },
    {
        intro: '`sql` on a table the user named:',
        args: {
            queries: [
                {
                    sourceType: QuerySourceType.SQL,
                    nodeId: 'refunds',
                    title: 'Refunds by reason',
                    description:
                        'Counts refunds per reason in billing.refunds.',
                    sql: 'SELECT reason, COUNT(*) AS refunds FROM billing.refunds GROUP BY reason',
                },
            ],
        },
    },
];

// One node per line keeps each call short and readable.
const formatQueryPipelineArgs = ({
    queries,
    ...rest
}: QueryPipelineExample['args']) =>
    `{${Object.entries(rest)
        .map(
            ([key, value]) =>
                `${JSON.stringify(key)}: ${JSON.stringify(value)}, `,
        )
        .join('')}"queries": [\n${queries
        .map((node) => `  ${JSON.stringify(node)}`)
        .join(',\n')}\n]}`;

export const formatQueryPipelineExamples = () =>
    QUERY_PIPELINE_EXAMPLES.map(
        ({ intro, args }) =>
            `${intro}\n\n\`\`\`\n${formatQueryPipelineArgs(args)}\n\`\`\``,
    ).join('\n\n');
