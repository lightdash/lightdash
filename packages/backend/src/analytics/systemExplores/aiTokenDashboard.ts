import {
    AI_BILLABLE_FEATURES,
    ChartType,
    Compact,
    DashboardTileTypes,
    FilterOperator,
    MetricType,
    UnitOfTime,
    type ChartAsCode,
    type DashboardAsCode,
} from '@lightdash/common';
import type { AnalyticsContentBundle } from './usageDashboardTypes';

const dashboardSlug = 'lightdash-analytics-ai-tokens';
const spaceSlug = 'lightdash-usage-overview';
const tokens = 'ai_usage_total_tokens_used';
const day = 'ai_usage_event_ts_day';
const queryLimit = 5000;
const colors = [
    '#9775fa',
    '#4dabf7',
    '#38d9a9',
    '#ffa94d',
    '#f783ac',
    '#868e96',
];
const scopeDescription =
    'Complete usage on Lightdash-managed keys for Ask AI, deep research, subtasks, compaction and Data Apps, including unpriced models. These tokens are not credits or the priced billable-token total in Settings.';
const periodDescription =
    'Current month through yesterday UTC, using retained captured usage. Today is excluded. Missing provider usage is unknown, not zero.';

type Query = ChartAsCode['metricQuery'];
type Breakdown = {
    key: string;
    title: string;
    dimensions: string[];
    identity: string;
    label: string;
    billingScope: boolean;
};

const breakdowns: Breakdown[] = [
    {
        key: 'feature',
        title: 'Feature',
        dimensions: ['ai_usage_feature'],
        identity: "datum.ai_usage_feature || 'Unknown feature'",
        label: "({agent:'Ask AI','data-app':'Data App','deep-research':'Deep research','agent-subtask':'Agent subtask',compaction:'Compaction'})[datum.ai_usage_feature] || datum.ai_usage_feature || 'Unknown feature'",
        billingScope: true,
    },
    {
        key: 'channel',
        title: 'Channel',
        dimensions: ['ai_usage_channel'],
        identity: "datum.ai_usage_channel || 'Unknown channel'",
        label: "datum.ai_usage_channel || 'Unknown channel'",
        billingScope: true,
    },
    {
        key: 'user',
        title: 'User',
        dimensions: [
            'ai_usage_user_name',
            'ai_usage_user_id',
            'ai_usage_channel',
        ],
        identity:
            "datum.ai_usage_channel === 'embed' ? 'embedded-viewers' : datum.ai_usage_user_id || 'unattributed-user'",
        label: "datum.ai_usage_channel === 'embed' ? 'Embedded viewers' : datum.ai_usage_user_id ? (datum.ai_usage_user_name || 'Unknown user') + ' · ' + substring(datum.ai_usage_user_id,0,6) : 'Unattributed user'",
        billingScope: true,
    },
    {
        key: 'project',
        title: 'Project',
        dimensions: ['ai_usage_project_name', 'ai_usage_project_id'],
        identity: "datum.ai_usage_project_id || 'unattributed-project'",
        label: "datum.ai_usage_project_id ? datum.ai_usage_project_name && datum.ai_usage_project_name !== 'Unknown project' ? datum.ai_usage_project_name : 'Unknown project · ' + substring(datum.ai_usage_project_id,0,8) : 'Unattributed project'",
        billingScope: true,
    },
    {
        key: 'agent',
        title: 'Agent',
        dimensions: ['ai_usage_agent_name', 'ai_usage_agent_id'],
        identity: "datum.ai_usage_agent_id || 'unattributed-agent'",
        label: "datum.ai_usage_agent_id ? (datum.ai_usage_agent_name || 'Unknown agent') + ' · ' + substring(datum.ai_usage_agent_id,0,6) : 'Unattributed agent'",
        billingScope: true,
    },
    {
        key: 'model',
        title: 'Model',
        dimensions: ['ai_usage_model'],
        identity: "datum.ai_usage_model || 'Unknown model'",
        label: "datum.ai_usage_model || 'Unknown model'",
        billingScope: false,
    },
    {
        key: 'key',
        title: 'Key origin',
        dimensions: ['ai_usage_key_management'],
        identity: "datum.ai_usage_key_management || 'Unknown key origin'",
        label: "datum.ai_usage_key_management || 'Unknown key origin'",
        billingScope: false,
    },
    {
        key: 'outcome',
        title: 'Outcome',
        dimensions: ['ai_usage_outcome'],
        identity: "datum.ai_usage_outcome || 'Unknown outcome'",
        label: "datum.ai_usage_outcome || 'Unknown outcome'",
        billingScope: false,
    },
];

const metricQuery = (
    billingScope: boolean,
    fields: Partial<Query> = {},
): Query => ({
    exploreName: 'ai_usage',
    dimensions: [],
    metrics: [],
    sorts: [],
    limit: queryLimit,
    tableCalculations: [],
    timezone: 'UTC',
    filters: {
        dimensions: {
            id: 'ai-token-period',
            and: [
                {
                    id: 'current-month',
                    target: { fieldId: 'ai_usage_event_ts_raw' },
                    operator: FilterOperator.IN_THE_CURRENT,
                    values: [],
                    settings: { unitOfTime: UnitOfTime.months },
                },
                {
                    id: 'closed-days',
                    target: { fieldId: 'ai_usage_event_ts_raw' },
                    operator: FilterOperator.IN_THE_PAST,
                    values: [31],
                    settings: { unitOfTime: UnitOfTime.days, completed: true },
                },
                ...(billingScope
                    ? [
                          {
                              id: 'managed-key',
                              target: { fieldId: 'ai_usage_key_management' },
                              operator: FilterOperator.EQUALS,
                              values: ['lightdash-managed'],
                          },
                          {
                              id: 'complete',
                              target: { fieldId: 'ai_usage_outcome' },
                              operator: FilterOperator.EQUALS,
                              values: ['complete'],
                          },
                          {
                              id: 'billing-features',
                              target: { fieldId: 'ai_usage_feature' },
                              operator: FilterOperator.EQUALS,
                              values: [...AI_BILLABLE_FEATURES],
                          },
                      ]
                    : []),
            ],
        },
    },
    ...fields,
});

const vegaConfig = {
    view: { stroke: null },
    font: 'Inter, Arial, sans-serif',
    axis: {
        domain: false,
        tickColor: '#868e96',
        gridColor: '#868e96',
        gridOpacity: 0.18,
        labelColor: '#868e96',
        titleColor: '#868e96',
    },
    legend: { title: null, orient: 'bottom', labelLimit: 250 },
};

// Never show a partial top-five/Other total when the grouped query reaches its cap.
const limitWarning = {
    transform: [
        { filter: `datum.source_rows >= ${queryLimit}` },
        { aggregate: [{ op: 'max', field: 'source_rows', as: 'rows' }] },
        { filter: 'isValid(datum.rows)' },
    ],
    mark: { type: 'text', align: 'center', color: '#868e96', fontSize: 12 },
    encoding: {
        x: { value: { expr: 'width / 2' } },
        y: { value: { expr: 'height / 2' } },
        text: {
            value: 'Too many groups for a complete breakdown. Add a filter.',
        },
    },
};
const sourceRows = { joinaggregate: [{ op: 'count', as: 'source_rows' }] };
const preserveSourceRows = {
    op: 'max',
    field: 'source_rows',
    as: 'source_rows',
};
const completeRows = { filter: `datum.source_rows < ${queryLimit}` };

const visualSpec = (
    breakdown: Breakdown,
    daily: boolean,
): Record<string, unknown> => {
    const tooltip = [
        ...(daily
            ? [
                  {
                      field: day,
                      type: 'temporal',
                      title: 'UTC day',
                      format: '%d %b %Y',
                  },
              ]
            : []),
        { field: 'group_name', title: breakdown.title },
        {
            field: 'tokens',
            type: 'quantitative',
            title: 'Reported tokens',
            format: ',.0f',
        },
        ...(!daily
            ? [
                  {
                      field: 'share',
                      type: 'quantitative',
                      title: 'Share of scope',
                      format: '.2%',
                  },
              ]
            : []),
        { field: 'group', title: 'Group identity' },
    ];
    const color = {
        field: 'group_name',
        type: 'nominal',
        sort: { field: 'group_order', op: 'min' },
        scale: { range: colors },
        legend: null,
    };
    const transform = [
        sourceRows,
        { filter: `isValid(datum.${tokens})` },
        { calculate: breakdown.identity, as: 'identity' },
        { calculate: breakdown.label, as: 'label' },
        {
            joinaggregate: [
                { op: 'distinct', field: 'identity', as: 'label_identities' },
            ],
            groupby: ['label'],
        },
        {
            calculate:
                "datum.label_identities > 1 || datum.label === 'Other' ? datum.label + ' · ' + substring(datum.identity,0,8) : datum.label",
            as: 'display_label',
        },
        {
            aggregate: [
                { op: 'sum', field: tokens, as: 'tokens' },
                preserveSourceRows,
            ],
            groupby: [...(daily ? [day] : []), 'identity', 'display_label'],
        },
        {
            joinaggregate: [
                {
                    op: 'sum',
                    field: 'tokens',
                    as: daily ? 'group_total' : 'total',
                },
            ],
            ...(daily ? { groupby: ['identity'] } : {}),
        },
        {
            window: [{ op: daily ? 'dense_rank' : 'row_number', as: 'rank' }],
            sort: [
                {
                    field: daily ? 'group_total' : 'tokens',
                    order: 'descending',
                },
                { field: 'identity', order: 'ascending' },
            ],
        },
        {
            calculate: "datum.rank <= 5 ? datum.identity : '__other__'",
            as: 'group',
        },
        {
            calculate: "datum.rank <= 5 ? datum.display_label : 'Other'",
            as: 'group_name',
        },
        { calculate: 'datum.rank <= 5 ? datum.rank : 6', as: 'group_order' },
        {
            aggregate: [
                { op: 'sum', field: 'tokens', as: 'tokens' },
                { op: 'min', field: 'group_order', as: 'group_order' },
                preserveSourceRows,
                ...(!daily ? [{ op: 'max', field: 'total', as: 'total' }] : []),
            ],
            groupby: [...(daily ? [day] : []), 'group', 'group_name'],
        },
        ...(!daily
            ? [
                  {
                      calculate:
                          'datum.total > 0 ? datum.tokens / datum.total : 0',
                      as: 'share',
                  },
                  {
                      calculate:
                          "format(datum.tokens, ',.0f') + ' tokens · ' + format(datum.share, '.1%')",
                      as: 'value_label',
                  },
              ]
            : []),
    ];
    const base = {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        autosize: { type: 'fit', contains: 'padding' },
        transform,
        config: vegaConfig,
    };
    const layer = (
        mark: Record<string, unknown>,
        encoding: Record<string, unknown>,
    ) => ({ transform: [completeRows], mark, encoding });
    const shareScale = {
        type: 'quantitative',
        scale: { domain: [0, 1] },
        axis: null,
    };
    const rankText = { type: 'text', dy: -15, fontSize: 12 };
    if (daily) {
        return {
            ...base,
            padding: { left: 8, right: 12, top: 8, bottom: 10 },
            layer: [
                {
                    transform: [completeRows],
                    mark: {
                        type: 'bar',
                        cornerRadiusTopLeft: 3,
                        cornerRadiusTopRight: 3,
                        width: { band: 0.72 },
                    },
                    encoding: {
                        x: {
                            field: day,
                            type: 'temporal',
                            timeUnit: 'utcyearmonthdate',
                            axis: {
                                title: null,
                                format: '%d %b',
                                labelAngle: 0,
                                tickCount: 10,
                            },
                        },
                        y: {
                            field: 'tokens',
                            type: 'quantitative',
                            stack: 'zero',
                            axis: { title: 'Reported tokens', format: '.2~s' },
                        },
                        color: {
                            ...color,
                            legend: { labelLimit: 250 },
                        },
                        order: {
                            field: 'group_order',
                            type: 'quantitative',
                            sort: 'ascending',
                        },
                        tooltip,
                    },
                },
                limitWarning,
            ],
        };
    }
    return {
        ...base,
        padding: { left: 16, right: 16, top: 30, bottom: 18 },
        encoding: {
            y: {
                field: 'group',
                type: 'ordinal',
                sort: { field: 'group_order', op: 'min' },
                axis: null,
                scale: { paddingInner: 0.65, paddingOuter: 0.5 },
            },
        },
        layer: [
            layer(
                {
                    type: 'bar',
                    height: 6,
                    color: '#868e96',
                    opacity: 0.15,
                    cornerRadius: 3,
                },
                { x: { datum: 0, ...shareScale }, x2: { datum: 1 } },
            ),
            layer(
                { type: 'bar', height: 6, cornerRadius: 3 },
                { x: { field: 'share', ...shareScale }, color, tooltip },
            ),
            layer(
                {
                    ...rankText,
                    color: 'currentColor',
                    align: 'left',
                    limit: 360,
                },
                { x: { value: 0 }, text: { field: 'group_name' }, tooltip },
            ),
            layer(
                { ...rankText, align: 'right', color: '#868e96' },
                {
                    x: { value: 'width' },
                    text: { field: 'value_label' },
                    tooltip,
                },
            ),
            limitWarning,
        ],
    };
};

const chart = (
    key: string,
    name: string,
    query: Query,
    chartConfig: ChartAsCode['chartConfig'],
    description = periodDescription,
): ChartAsCode => ({
    version: 1,
    slug: `${dashboardSlug}-${key}`,
    dashboardSlug,
    spaceSlug,
    name,
    description,
    tableName: 'ai_usage',
    metricQuery: query,
    chartConfig,
    tableConfig: { columnOrder: [...query.dimensions, ...query.metrics] },
});

const number = (
    key: string,
    name: string,
    metric: string,
    billingScope = false,
) =>
    chart(
        key,
        name,
        metricQuery(billingScope, { metrics: [metric] }),
        {
            type: ChartType.BIG_NUMBER,
            config: {
                selectedField: metric,
                style: Compact.AUTO,
                showBigNumberLabel: false,
            },
        },
        billingScope ? scopeDescription : periodDescription,
    );

export const buildAiTokenDashboard = (): AnalyticsContentBundle => {
    const tableConfig = {
        type: ChartType.TABLE as const,
        config: { showTableNames: false, hideRowNumbers: true },
    };
    const charts = [
        number('total', 'Reported tokens · all usage', tokens),
        number('eligible', 'Tokens in billing scope', tokens, true),
        number('records', 'Recorded usage events', 'ai_usage_total_ai_calls'),
        ...[
            ['input', 'Input tokens', 'input'],
            ['output', 'Output tokens', 'output'],
            ['cache-read', 'Cache-read tokens', 'cache_read'],
            ['cache-write', 'Cache-write tokens', 'cache_write'],
            ['reasoning', 'Reasoning tokens', 'reasoning'],
        ].map(([key, name, field]) =>
            number(key, name, `ai_usage_total_${field}_tokens`),
        ),
        ...breakdowns.flatMap((breakdown) =>
            (['key', 'outcome'].includes(breakdown.key)
                ? [true]
                : [true, false]
            ).map((daily) =>
                chart(
                    `${breakdown.key}-${daily ? 'daily' : 'rank'}`,
                    daily
                        ? `Daily tokens by ${breakdown.title.toLowerCase()}`
                        : `${breakdown.title} · token share`,
                    metricQuery(breakdown.billingScope, {
                        dimensions: [
                            ...(daily ? [day] : []),
                            ...breakdown.dimensions,
                        ],
                        metrics: [tokens],
                        sorts: [
                            {
                                fieldId: daily ? day : tokens,
                                descending: !daily,
                            },
                        ],
                    }),
                    {
                        type: ChartType.CUSTOM,
                        config: { spec: visualSpec(breakdown, daily) },
                    },
                    `${breakdown.billingScope ? scopeDescription : periodDescription} Largest five groups plus Other; shares describe tokens in this scope, not allowance. Identical names retain separate identities.`,
                ),
            ),
        ),
        chart(
            'details',
            'Billing-scope records · attribution details',
            metricQuery(true, {
                dimensions: [
                    'ai_usage_user_name',
                    'ai_usage_user_id',
                    'ai_usage_project_name',
                    'ai_usage_project_id',
                    'ai_usage_agent_name',
                    'ai_usage_agent_id',
                    'ai_usage_feature',
                    'ai_usage_channel',
                    'ai_usage_model',
                ],
                metrics: [tokens, 'ai_usage_total_ai_calls'],
                sorts: [{ fieldId: tokens, descending: true }],
                limit: 1000,
            }),
            tableConfig,
            `${scopeDescription} Up to 1,000 grouped rows. Usage records are not human questions or an exact provider-call count.`,
        ),
        chart(
            'quality',
            'Token coverage by feature, key origin and outcome',
            metricQuery(false, {
                dimensions: [
                    'ai_usage_feature',
                    'ai_usage_key_management',
                    'ai_usage_outcome',
                ],
                metrics: [
                    tokens,
                    'ai_usage_total_ai_calls',
                    'ai_usage_known_usage_records',
                ],
                sorts: [{ fieldId: tokens, descending: true }],
                additionalMetrics: [
                    {
                        name: 'known_usage_records',
                        label: 'Events with reported token total',
                        type: MetricType.COUNT,
                        table: 'ai_usage',
                        sql: '${ai_usage.total_tokens}',
                    },
                ],
            }),
            tableConfig,
            'Known totals count captured events where total_tokens is non-null. Complete reporting among captured events does not prove all provider calls were captured. Data App events may aggregate a run per model.',
        ),
    ];

    const dashboard: DashboardAsCode = {
        version: 1,
        slug: dashboardSlug,
        spaceSlug,
        name: 'AI usage · Tokens & billing coverage',
        description:
            'Daily token usage by feature, channel, user, project and agent, plus all-usage composition and reporting coverage. Duplicate this dashboard to keep a customized copy separate from future Sync content updates.',
        config: { isDateZoomDisabled: true, isAddFilterDisabled: false },
        tabs: [],
        tiles: [],
        filters: { dimensions: [], metrics: [], tableCalculations: [] },
    };
    type Row =
        | { type: 'note'; h: number; content: string }
        | { type: 'charts'; h: number; keys: string[] };
    const note = (h: number, content: string): Row => ({
        type: 'note',
        h,
        content,
    });
    const row = (h: number, ...keys: string[]): Row => ({
        type: 'charts',
        h,
        keys,
    });
    const attributionNotes: Record<string, string> = {
        user: ' Embedded viewers are combined. Unattributed and deleted users remain visible; short UUIDs distinguish people with the same name.',
        project:
            ' Project names reflect the latest successful project snapshot. Unresolved projects retain their identity; full UUIDs are available in tooltips and the attribution table.',
        agent: ' Usage with no agent ID, including Data App generation, stays in Unattributed agent.',
        channel:
            ' Missing channel attribution stays in Unknown channel; it is not inferred from the feature.',
    };
    const tabs = [
        ...breakdowns
            .filter(({ billingScope }) => billingScope)
            .map(({ key, title }) => ({
                key,
                name: title,
                rows: [
                    note(
                        1,
                        '**Current month through yesterday UTC.** Billing-scope tokens include unpriced models. Credit accounting and allowance are separate measures.',
                    ),
                    row(2, 'eligible', 'total', 'records'),
                    row(4, `${key}-daily`),
                    row(6, `${key}-rank`),
                    note(
                        3,
                        `${scopeDescription} **Top five groups + Other**; bars show share of scope, not remaining allowance. Data updates with the usage-processing refresh; today is excluded.${attributionNotes[key] ?? ''}`,
                    ),
                ],
            })),
        {
            key: 'all-usage-coverage',
            name: 'All usage & coverage',
            rows: [
                note(
                    2,
                    '### All recorded AI usage\nIncludes billing-scope, excluded/background and self-managed consumption. **Current month through yesterday UTC**; captured usage is not a provider invoice or a count of human questions.',
                ),
                row(2, 'total', 'input', 'output'),
                row(2, 'cache-read', 'cache-write', 'reasoning'),
                note(
                    1,
                    '**Do not add all six categories.** Cache reads/writes are included in input; reasoning may be included in output. Missing provider usage is unknown, not zero.',
                ),
                row(4, 'model-daily'),
                row(6, 'model-rank'),
                row(4, 'key-daily', 'outcome-daily'),
                row(7, 'quality'),
                note(
                    5,
                    '### Reporting coverage\n**Tokens are not credits or currency.** Credit accounting uses effective-dated model rates, including separate cache rates. Contract periods, allowances and holds are not part of this explore.\n\n**Attribution:** app/build identity is not available in this model. Unknown channel and missing identities are retained, not silently assigned.\n\n**Completeness:** reported totals describe captured usage. Failed or aborted partial provider usage may not be captured. A Data App record can aggregate a model over a run. Settings uses a live ledger; compare the same time window before reconciling it with retained closed-day Analytics data.',
                ),
                row(8, 'details'),
            ],
        },
    ];
    tabs.forEach(({ key: tabSlug, name, rows }, order) => {
        dashboard.tabs.push({ slug: tabSlug, name, order });
        let y = 0;
        for (const content of rows) {
            const position = { tabSlug, y, h: content.h };
            if (content.type === 'note') {
                dashboard.tiles.push({
                    ...position,
                    type: DashboardTileTypes.MARKDOWN,
                    uuid: undefined,
                    tileSlug: `${tabSlug}-note-${y}`,
                    x: 0,
                    w: 36,
                    properties: {
                        title: '',
                        content: content.content,
                        hideFrame: true,
                    },
                });
            } else {
                content.keys.forEach((key, index) => {
                    const chartSlug = `${dashboardSlug}-${key}`;
                    if (!charts.some(({ slug }) => slug === chartSlug))
                        throw new Error(`Missing AI token chart: ${key}`);
                    const w = 36 / content.keys.length;
                    dashboard.tiles.push({
                        ...position,
                        type: DashboardTileTypes.SAVED_CHART,
                        uuid: undefined,
                        tileSlug: `${tabSlug}-${key}`,
                        x: index * w,
                        w,
                        properties: { chartSlug, title: '' },
                    });
                });
            }
            y += content.h;
        }
    });
    return { dashboard, charts };
};
