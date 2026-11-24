import {
    AI_BILLABLE_FEATURES,
    ANALYTICS_AI_USAGE_DASHBOARD_SLUG,
    ChartType,
    Compact,
    CustomFormatType,
    DashboardTileTypes,
    FilterOperator,
    MetricType,
    TableCalculationType,
    UnitOfTime,
    type ChartAsCode,
    type DashboardAsCode,
} from '@lightdash/common';
import { caution, positive } from './analyticsChartPresentation';
import {
    analyticsColorPalette,
    modelProviders,
    modelProviderTints,
    modelTierRankExpression,
    modelTiers,
    unmatchedModelTints,
} from './analyticsColorPalette';
import type { LibraryChartBinding } from './libraryCharts';
import type { AnalyticsContentBundle } from './usageDashboardTypes';

const dashboardSlug = ANALYTICS_AI_USAGE_DASHBOARD_SLUG;
const spaceSlug = 'lightdash-usage-overview';
const tokens = 'ai_usage_total_tokens_used';
const day = 'ai_usage_event_ts_day';
const queryLimit = 5000;
// The top five groups take the Analytics palette; grey marks "Other".
// The one place billing scope is defined; other tiles refer to "tokens in billing scope".
const scopeDescription =
    'Tokens from completed work on Lightdash-managed keys, for agents, deep research, agent tools, compaction and data apps. These tokens are not credits or cost.';

type Query = ChartAsCode['metricQuery'];
// Tokens in a table read 48.1M, like the cards and the share bars, not 48,123,257
const compactTokens = {
    [tokens]: {
        formatOptions: { type: CustomFormatType.NUMBER, compact: Compact.AUTO },
    },
};
type Breakdown = {
    // Names the charts' slugs, so it stays as it is when the title changes
    key: string;
    title: string;
    // The title for more than one, when adding an s is wrong
    plural?: string;
    // The tab's slug, when it is not the key. A tab keeps its place on sync by having the slug its name
    // gives, so a renamed tab needs the new name's slug.
    tabSlug?: string;
    dimensions: string[];
    identity: string;
    label: string;
    billingScope: boolean;
    // How many groups to name before the rest are added up as Other. Five when not given.
    top?: number;
    // Rows to keep, as a test on a row. Rows that fail it are left out of the chart and its shares.
    where?: string;
    // A fixed colour for a named group, for groups that mean good or not good
    colors?: Record<string, string>;
    // Chart descriptions; billing-scope breakdowns derive theirs from the title.
    descriptions?: { daily: string; rank?: string };
};

const breakdownDescription = (
    { title, plural, billingScope, descriptions, top }: Breakdown,
    daily: boolean,
): string => {
    if (!billingScope && descriptions) {
        return daily ? descriptions.daily : (descriptions.rank ?? '');
    }
    const groups = `the ${top === 6 ? 'six' : 'five'} largest ${plural ?? `${title.toLowerCase()}s`} plus Other`;
    return daily
        ? `Tokens in billing scope per day, for ${groups}.`
        : `Each group's share of tokens in billing scope, for ${groups}.`;
};

const breakdowns: Breakdown[] = [
    {
        key: 'feature',
        title: 'Feature',
        dimensions: ['ai_usage_feature', 'ai_usage_feature_name'],
        identity: "datum.ai_usage_feature || 'Unknown feature'",
        label: "datum.ai_usage_feature_name || 'Unknown feature'",
        billingScope: true,
    },
    {
        key: 'channel',
        title: 'Channel',
        dimensions: ['ai_usage_channel', 'ai_usage_channel_name'],
        identity: "datum.ai_usage_channel || 'Unknown channel'",
        label: "datum.ai_usage_channel_name || 'Unknown channel'",
        billingScope: true,
    },
    {
        key: 'user',
        title: 'Person',
        plural: 'people',
        tabSlug: 'person',
        dimensions: [
            'ai_usage_user_name',
            'ai_usage_user_id',
            'ai_usage_channel',
        ],
        identity:
            "datum.ai_usage_channel === 'embed' ? 'embedded-viewers' : datum.ai_usage_user_id || 'unattributed-user'",
        label: "datum.ai_usage_channel === 'embed' ? 'Embedded viewers' : datum.ai_usage_user_id ? (datum.ai_usage_user_name || 'Unknown user') : 'No user recorded'",
        billingScope: true,
        // One more than the other tabs: tokens are spread across many people
        top: 6,
        // People only, like the rankings of people on the other dashboards
        where: "datum.ai_usage_user_id && datum.ai_usage_channel !== 'embed'",
    },
    {
        key: 'project',
        title: 'Project',
        dimensions: ['ai_usage_project_name', 'ai_usage_project_id'],
        identity: "datum.ai_usage_project_id || 'unattributed-project'",
        label: "datum.ai_usage_project_id ? datum.ai_usage_project_name && datum.ai_usage_project_name !== 'Unknown project' ? datum.ai_usage_project_name : 'Unknown project · ' + substring(datum.ai_usage_project_id,0,8) : 'No project'",
        billingScope: true,
    },
    {
        key: 'agent',
        title: 'Agent',
        dimensions: ['ai_usage_agent_name', 'ai_usage_agent_id'],
        identity: "datum.ai_usage_agent_id || 'unattributed-agent'",
        label: "datum.ai_usage_agent_id ? (datum.ai_usage_agent_name || 'Unknown agent') : 'No agent'",
        billingScope: true,
    },
    {
        key: 'model',
        title: 'Model',
        // The name without a date stamp, so two dated versions of one model are one group
        dimensions: ['ai_usage_model_name'],
        identity: "datum.ai_usage_model_name || 'Unknown model'",
        label: "datum.ai_usage_model_name || 'Unknown model'",
        billingScope: false,
        descriptions: {
            daily: 'All recorded tokens per day, for the five largest models plus Other. Models are coloured by provider, darker for the more powerful.',
            rank: "Each model's share of all recorded tokens, for the five largest models plus Other. Models are coloured by provider, darker for the more powerful.",
        },
    },
    {
        key: 'key',
        title: 'Key origin',
        dimensions: ['ai_usage_key_management', 'ai_usage_key_management_name'],
        identity: "datum.ai_usage_key_management || 'Unknown key'",
        label: "datum.ai_usage_key_management_name || 'Unknown key'",
        billingScope: false,
        descriptions: {
            daily: "All recorded tokens per day by whose provider key was used: Lightdash's or your own.",
        },
    },
    {
        key: 'outcome',
        title: 'Outcome',
        dimensions: ['ai_usage_outcome', 'ai_usage_outcome_name'],
        identity: "datum.ai_usage_outcome || 'Unknown outcome'",
        label: "datum.ai_usage_outcome_name || 'Unknown outcome'",
        billingScope: false,
        // The same good and not-good pair as every other outcome chart
        colors: { Success: positive, Error: caution },
        descriptions: {
            daily: 'All recorded tokens per day by outcome.',
        },
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
        labelFontSize: 11,
        titleFontSize: 12,
        labelPadding: 6,
    },
    legend: {
        title: null,
        orient: 'bottom',
        columns: 2,
        labelLimit: { expr: 'min(140, max(60, (width - 64) / 2))' },
        labelFontSize: 11,
        rowPadding: 6,
        symbolType: 'square',
    },
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
const sourceRows = {
    joinaggregate: [
        { op: 'count', as: 'source_rows' },
        { op: 'valid', field: tokens, as: 'reported_rows' },
    ],
};
const preserveSourceRows = {
    op: 'max',
    field: 'source_rows',
    as: 'source_rows',
};
const preserveReportedRows = {
    op: 'max',
    field: 'reported_rows',
    as: 'reported_rows',
};
const completeRows = {
    filter: `datum.source_rows < ${queryLimit} && datum.reported_rows > 0`,
};
const noReportedTokens = {
    transform: [
        {
            filter: `datum.reported_rows === 0 && datum.source_rows < ${queryLimit}`,
        },
        { aggregate: [{ op: 'count', as: 'groups' }] },
        { filter: 'datum.groups > 0' },
    ],
    mark: { type: 'text', align: 'center', color: '#868e96', fontSize: 12 },
    encoding: {
        x: { value: { expr: 'width / 2' } },
        y: { value: { expr: 'height / 2' } },
        text: { value: 'No reported token totals' },
    },
};

// Groups models by provider, so a provider's models sit together and share its colour: the most
// powerful tier in the provider's own colour and weaker tiers in lighter tints. A model that matches no
// provider is a light grey, and Other keeps its grey. Runs on the grouped rows (the five largest groups and Other).
const providerOf = `datum.group === '__other__' ? 'Other' : ${modelProviders
    .map(
        ({ label, prefixes }) =>
            `${prefixes
                .map(
                    (prefix) =>
                        `indexof(lower(datum.group), '${prefix}') === 0`,
                )
                .join(' || ')} ? '${label}' : `,
    )
    .join('')}'Unmatched'`;
const providerColouring = [
    { calculate: providerOf, as: 'provider' },
    {
        joinaggregate: [{ op: 'sum', field: 'tokens', as: 'provider_tokens' }],
        groupby: ['provider'],
    },
    {
        joinaggregate: [{ op: 'sum', field: 'tokens', as: 'group_tokens' }],
        groupby: ['group'],
    },
    {
        window: [{ op: 'dense_rank', as: 'provider_rank' }],
        sort: [
            { field: 'provider_tokens', order: 'descending' },
            { field: 'provider', order: 'ascending' },
        ],
    },
    {
        window: [{ op: 'dense_rank', as: 'size_rank' }],
        sort: [
            { field: 'group_tokens', order: 'descending' },
            { field: 'group', order: 'ascending' },
        ],
        groupby: ['provider'],
    },
    // Darker means the more powerful model: the shade comes from the model's tier, read from its
    // name by the same ranked words as the cartesian chart's splitShadeRank
    {
        calculate: modelTierRankExpression('datum.group', 'datum.provider'),
        as: 'tier',
    },
    {
        // Each provider's tiers are spread over its four strongest shades, and a model with no tier
        // word takes the palest. A model of no known provider is shaded by its size.
        calculate: `${modelTiers
            .map(
                ({ label, count }) =>
                    `datum.provider === '${label}' ? min(4, round(datum.tier * 3 / ${Math.max(count - 1, 1)})) : `,
            )
            .join('')}min(datum.size_rank, 5) - 1`,
        as: 'shade',
    },
    {
        // Within a provider the strongest tier is first: at the bottom of a stack
        calculate:
            "(datum.provider === 'Other' ? 90 : datum.provider_rank) * 10000 + min(datum.tier, 99) * 100 + min(datum.size_rank, 99)",
        as: 'group_order',
    },
    {
        calculate: `datum.provider === 'Other' ? '#868e96' : (${JSON.stringify(modelProviderTints)}[datum.provider] || ${JSON.stringify(unmatchedModelTints)})[datum.shade]`,
        as: 'group_color',
    },
    {
        calculate: "datum.group_color + '|' + datum.group_name",
        as: 'legend_key',
    },
];

// A legend drawn as marks, two to a row under the date axis: a square in each group's own colour and
// its name. The chart's built-in legend can only take its colours from a fixed list.
const legendEntries = [
    completeRows,
    {
        aggregate: [{ op: 'min', field: 'group_order', as: 'group_order' }],
        groupby: ['group_name', 'group_color'],
    },
    {
        window: [{ op: 'row_number', as: 'entry' }],
        sort: [{ field: 'group_order', order: 'ascending' }],
    },
    { calculate: '((datum.entry - 1) % 2) * (width / 2) + 6', as: 'entry_x' },
    {
        calculate: 'height + 36 + floor((datum.entry - 1) / 2) * 18',
        as: 'entry_y',
    },
];
const legendPosition = {
    y: { field: 'entry_y', type: 'quantitative', scale: null, axis: null },
};
const providerLegend = [
    {
        transform: legendEntries,
        mark: { type: 'square', size: 90, opacity: 1, aria: false },
        encoding: {
            x: {
                field: 'entry_x',
                type: 'quantitative',
                scale: null,
                axis: null,
            },
            ...legendPosition,
            fill: {
                field: 'group_color',
                type: 'nominal',
                scale: null,
                legend: null,
            },
        },
    },
    {
        transform: [
            ...legendEntries,
            { calculate: 'datum.entry_x + 12', as: 'entry_x' },
        ],
        mark: {
            type: 'text',
            align: 'left',
            baseline: 'middle',
            fontSize: 11,
            color: '#868e96',
            limit: { expr: 'max(60, width / 2 - 28)' },
        },
        encoding: {
            x: {
                field: 'entry_x',
                type: 'quantitative',
                scale: null,
                axis: null,
            },
            ...legendPosition,
            text: { field: 'group_name' },
        },
    },
];

const visualSpec = (
    breakdown: Breakdown,
    daily: boolean,
): Record<string, unknown> => {
    const tooltip = [
        ...(daily
            ? [
                  {
                      field: 'utc_day_label',
                      type: 'nominal',
                      title: 'UTC day',
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
    const byProvider = breakdown.key === 'model';
    const top = breakdown.top ?? 5;
    // Bars filled with a colour worked out for each group, not taken in turn from the palette
    const ownColors = byProvider || breakdown.colors !== undefined;
    const color = {
        // By provider, each bar is filled with the colour worked out for it, and the legend entry
        // carries that colour in front of the name ("#6366F1|claude-...") so it can draw the same one
        field: ownColors ? 'legend_key' : 'group_name',
        type: 'nominal',
        sort: { field: 'group_order', op: 'min' },
        scale: {
            range: [...analyticsColorPalette.colors.slice(0, top), '#868e96'],
        },
        legend: null,
    };
    const fill = ownColors
        ? {
              fill: {
                  field: 'group_color',
                  type: 'nominal',
                  scale: null,
                  legend: null,
              },
          }
        : {};
    const transform = [
        sourceRows,
        // Retain an all-null input only to render its missing-usage message.
        // Those rows are excluded from every plotted mark by completeRows.
        {
            filter: `isValid(datum.${tokens}) || datum.reported_rows === 0`,
        },
        ...(breakdown.where ? [{ filter: breakdown.where }] : []),
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
                preserveReportedRows,
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
            calculate: `datum.rank <= ${top} ? datum.identity : '__other__'`,
            as: 'group',
        },
        {
            calculate: `datum.rank <= ${top} ? datum.display_label : 'Other'`,
            as: 'group_name',
        },
        {
            calculate: `datum.rank <= ${top} ? datum.rank : ${top + 1}`,
            as: 'group_order',
        },
        {
            aggregate: [
                { op: 'sum', field: 'tokens', as: 'tokens' },
                { op: 'min', field: 'group_order', as: 'group_order' },
                preserveSourceRows,
                preserveReportedRows,
                ...(!daily ? [{ op: 'max', field: 'total', as: 'total' }] : []),
            ],
            groupby: [...(daily ? [day] : []), 'group', 'group_name'],
        },
        ...(byProvider ? providerColouring : []),
        ...(breakdown.colors
            ? [
                  {
                      calculate: `${JSON.stringify(breakdown.colors)}[datum.group_name] || '#868e96'`,
                      as: 'group_color',
                  },
                  {
                      calculate: "datum.group_color + '|' + datum.group_name",
                      as: 'legend_key',
                  },
              ]
            : []),
        // Other sits at the bottom of a stack, under the named groups
        {
            calculate: "datum.group === '__other__' ? 0 : datum.group_order",
            as: 'stack_order',
        },
        ...(daily
            ? [
                  {
                      calculate: `utcFormat(toDate(datum.${day}), '%b %-d, %Y')`,
                      as: 'utc_day_label',
                  },
              ]
            : []),
        ...(!daily
            ? [
                  {
                      calculate:
                          'datum.total > 0 ? datum.tokens / datum.total : 0',
                      as: 'share',
                  },
                  {
                      calculate:
                          "replace(replace(format(datum.tokens, '.3~s'), 'k', 'K'), 'G', 'B') + ' tokens · ' + format(datum.share, '.1%')",
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
    const rankText = { type: 'text', dy: -11, fontSize: 12 };
    if (daily) {
        const reportedAxisOpacity = {
            expr: "length(domain('color')) ? 1 : 0",
        };
        const dailyColor = {
            ...color,
            legend: {
                // An empty symbol legend collapses Vega's fit
                // height to zero. Keep a transparent layout
                // entry. Bars already expose each group and its
                // value to assistive technology.
                aria: false,
                values: {
                    expr: "length(domain('color')) ? domain('color') : ['']",
                },
                symbolOpacity: {
                    expr: "length(domain('color')) ? 1 : 0",
                },
                labelLimit: {
                    expr: 'min(140, max(60, (width - 64) / 2))',
                },
            },
        };
        return {
            ...base,
            // By provider, the legend is drawn in the bottom padding: three rows of two
            padding: {
                left: 8,
                right: 12,
                top: 8,
                bottom: ownColors ? 60 : 10,
            },
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
                                format: '%b %-d',
                                labelAngle: 0,
                                tickCount: {
                                    expr: 'max(3, floor(width / 90))',
                                },
                            },
                        },
                        y: {
                            field: 'tokens',
                            type: 'quantitative',
                            stack: 'zero',
                            axis: {
                                title: 'Reported tokens',
                                format: '.2~s',
                                // Unknown totals must not look like a zero
                                // observation behind the missing-usage message.
                                labelOpacity: reportedAxisOpacity,
                                // 500K and 2B, like the cards: the format writes k and G
                                labelExpr:
                                    "length(domain('color')) ? replace(replace(datum.label, 'k', 'K'), 'G', 'B') : ''",
                                titleOpacity: reportedAxisOpacity,
                                tickOpacity: reportedAxisOpacity,
                                domainOpacity: reportedAxisOpacity,
                                gridOpacity: {
                                    expr: "length(domain('color')) ? 0.18 : 0",
                                },
                            },
                        },
                        ...(ownColors ? fill : { color: dailyColor }),
                        order: {
                            field: byProvider ? 'group_order' : 'stack_order',
                            type: 'quantitative',
                            sort: 'ascending',
                        },
                        tooltip,
                    },
                },
                // The bars are filled directly, so an unseen layer keeps the colour scale the
                // empty-state rules read, and the legend is drawn as marks under the axis
                ...(ownColors
                    ? [
                          {
                              transform: [completeRows],
                              mark: { type: 'point', opacity: 0, size: 0 },
                              encoding: { color: { ...color, legend: null } },
                          },
                          ...providerLegend,
                      ]
                    : []),
                limitWarning,
                noReportedTokens,
            ],
        };
    }
    return {
        ...base,
        padding: { left: 16, right: 16, top: 20, bottom: 20 },
        encoding: {
            y: {
                field: 'group',
                type: 'ordinal',
                // Largest share first. Models keep their provider's colour, so the list need not be
                // grouped by provider to show it.
                sort: byProvider
                    ? { field: 'share', op: 'max', order: 'descending' }
                    : { field: 'group_order', op: 'min' },
                axis: null,
                scale: { paddingInner: 0.65, paddingOuter: 0.5 },
            },
        },
        layer: [
            layer(
                {
                    type: 'bar',
                    height: 8,
                    color: '#868e96',
                    opacity: 0.15,
                    cornerRadius: 3,
                },
                { x: { datum: 0, ...shareScale }, x2: { datum: 1 } },
            ),
            layer(
                { type: 'bar', height: 8, cornerRadius: 3 },
                {
                    x: { field: 'share', ...shareScale },
                    ...(ownColors ? fill : { color }),
                    tooltip,
                },
            ),
            layer(
                {
                    ...rankText,
                    color: 'currentColor',
                    align: 'left',
                    fontWeight: 500,
                    limit: { expr: 'max(80, width - 16)' },
                },
                { x: { value: 0 }, text: { field: 'group_name' }, tooltip },
            ),
            layer(
                { ...rankText, dy: 12, align: 'right', color: '#868e96' },
                {
                    x: { value: 'width' },
                    text: { field: 'value_label' },
                    tooltip,
                },
            ),
            limitWarning,
            noReportedTokens,
        ],
    };
};

const chart = (
    key: string,
    name: string,
    query: Query,
    chartConfig: ChartAsCode['chartConfig'],
    description: string,
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
    tableConfig: {
        columnOrder: [
            ...query.tableCalculations.map(({ name: field }) => field),
            ...query.dimensions.filter((field) => !field.endsWith('_id')),
            ...query.metrics,
            // IDs last: they tell apart rows with the same name, and are not what a reader scans
            ...query.dimensions.filter((field) => field.endsWith('_id')),
        ],
    },
});

const number = (
    key: string,
    name: string,
    metric: string,
    description: string,
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
        description,
    );

// The number tiles as headline cards: the month's total with the daily trend behind it. A card holds
// only the current month, so it has no change against an earlier period.
export const aiTokenLibraryChartBindings = (
    charts: ChartAsCode[],
): Map<string, LibraryChartBinding> =>
    new Map(
        charts.flatMap((item): [string, LibraryChartBinding][] => {
            if (item.chartConfig.type !== ChartType.BIG_NUMBER) return [];
            const [metric] = item.metricQuery.metrics;
            return [
                [
                    item.slug,
                    {
                        slug: 'big-number-with-sparkline-trend',
                        minVersion: '0.7.1',
                        fieldMapping: {
                            value: metric,
                            sparklineMetric: metric,
                            time: day,
                        },
                        optionValues: {
                            valueAggregation: 'sum',
                            style: 'compact',
                            showComparison: false,
                            colorSparklineByTrend: false,
                            showSparklineArea: true,
                            showLabel: true,
                            label: 'This month',
                            showCardBorder: false,
                            showCardShadow: false,
                        },
                        query: {
                            dimensions: [day],
                            metrics: [metric],
                            sorts: [{ fieldId: day, descending: false }],
                            limit: 31,
                            description: item.description ?? '',
                        },
                    },
                ],
            ];
        }),
    );

export const buildAiTokenDashboard = (): AnalyticsContentBundle => {
    const tableConfig = {
        type: ChartType.TABLE as const,
        config: { showTableNames: false, hideRowNumbers: true },
    };
    const charts = [
        number(
            'total',
            'Tokens (all usage)',
            tokens,
            'All recorded tokens this month, in and out of billing scope. Missing provider usage is unknown, not zero.',
        ),
        number(
            'eligible',
            'Tokens in billing scope',
            tokens,
            scopeDescription,
            true,
        ),
        number(
            'records',
            'AI calls',
            'ai_usage_total_ai_calls',
            'AI calls this month. An AI call is not an agent request, and this is not an exact count of provider calls.',
        ),
        ...[
            [
                'input',
                'Input tokens',
                'input',
                'Input tokens. Includes cache-read and cache-write tokens.',
            ],
            [
                'output',
                'Output tokens',
                'output',
                'Output tokens. May include reasoning tokens.',
            ],
            [
                'cache-read',
                'Cache-read tokens',
                'cache_read',
                'Cache-read tokens. Already counted in input tokens.',
            ],
            [
                'cache-write',
                'Cache-write tokens',
                'cache_write',
                'Cache-write tokens. Already counted in input tokens.',
            ],
            [
                'reasoning',
                'Reasoning tokens',
                'reasoning',
                'Reasoning tokens. May already be counted in output tokens.',
            ],
        ].map(([key, name, field, description]) =>
            number(key, name, `ai_usage_total_${field}_tokens`, description),
        ),
        ...breakdowns.flatMap((breakdown) =>
            (['key', 'outcome'].includes(breakdown.key)
                ? [true]
                : [true, false]
            ).map((daily) =>
                chart(
                    `${breakdown.key}-${daily ? 'daily' : 'rank'}`,
                    daily
                        ? `Tokens by ${breakdown.title.toLowerCase()} and day`
                        : `Token share by ${breakdown.title.toLowerCase()}`,
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
                    breakdownDescription(breakdown, daily),
                ),
            ),
        ),
        chart(
            'details',
            'AI calls in billing scope: attribution details',
            metricQuery(true, {
                dimensions: [
                    'ai_usage_user_name',
                    'ai_usage_user_email',
                    'ai_usage_user_id',
                    'ai_usage_project_name',
                    'ai_usage_project_id',
                    'ai_usage_agent_name',
                    'ai_usage_agent_id',
                    'ai_usage_feature_name',
                    'ai_usage_channel_name',
                    'ai_usage_model_name',
                ],
                metrics: [tokens, 'ai_usage_total_ai_calls'],
                tableCalculations: [
                    {
                        name: 'user_display_name',
                        displayName: 'Person',
                        type: TableCalculationType.STRING,
                        sql: `CASE
                            WHEN \${ai_usage.channel_name} = 'Embed' THEN 'Embedded viewers'
                            WHEN NULLIF(TRIM(\${ai_usage.user_name}), '') IS NOT NULL AND \${ai_usage.user_name} <> 'Unknown user' THEN \${ai_usage.user_name}
                            WHEN NULLIF(TRIM(\${ai_usage.user_email}), '') IS NOT NULL THEN TRIM(\${ai_usage.user_email})
                            WHEN NULLIF(TRIM(\${ai_usage.user_id}), '') IS NOT NULL THEN 'User ' || \${ai_usage.user_id}
                            ELSE 'No user recorded'
                        END`,
                    },
                ],
                sorts: [{ fieldId: tokens, descending: true }],
                limit: 1000,
                metricOverrides: compactTokens,
            }),
            {
                ...tableConfig,
                config: {
                    ...tableConfig.config,
                    columns: {
                        ai_usage_user_name: { visible: false },
                        ai_usage_user_email: { visible: false },
                    },
                },
            },
            'AI calls in billing scope, up to 1,000 grouped rows. An AI call is not an agent request.',
        ),
        chart(
            'quality',
            'AI calls with a token count, by feature, AI key and outcome',
            metricQuery(false, {
                dimensions: [
                    'ai_usage_feature_name',
                    'ai_usage_key_management_name',
                    'ai_usage_outcome_name',
                ],
                metrics: [
                    tokens,
                    'ai_usage_total_ai_calls',
                    'ai_usage_known_usage_records',
                ],
                sorts: [{ fieldId: tokens, descending: true }],
                metricOverrides: compactTokens,
                additionalMetrics: [
                    {
                        name: 'known_usage_records',
                        label: 'AI calls with a token count',
                        type: MetricType.COUNT,
                        table: 'ai_usage',
                        sql: '${ai_usage.total_tokens}',
                    },
                ],
            }),
            tableConfig,
            'How many AI calls have a token count. Some provider calls may not have been recorded at all.',
        ),
    ];

    const dashboard: DashboardAsCode = {
        version: 1,
        slug: dashboardSlug,
        spaceSlug,
        name: 'AI token usage',
        description: 'AI tokens used this month, in and out of billing scope.',
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
        user: ' Embedded viewers and usage with no person recorded are left out of these two tiles. A short ID tells apart people with the same name.',
        project:
            ' Project names are from the latest successful project snapshot. Projects with no name are still listed separately. Full UUIDs are in the tooltips and the attribution table.',
        agent: ' Usage with no agent, including data app generation, is shown as No agent. Unknown agent is an agent ID that matches no agent.',
        channel:
            ' Usage with no channel is shown as Unknown channel. The channel is not guessed from the feature.',
    };
    const tabs = [
        ...breakdowns
            .filter(({ billingScope }) => billingScope)
            .map(({ key, title, tabSlug, top }) => ({
                key: tabSlug ?? key,
                name: title,
                rows: [
                    note(
                        1,
                        '**Current month up to yesterday (UTC). Today is excluded.** Tokens in billing scope include unpriced models. Credits and allowance are measured separately.',
                    ),
                    row(3, 'eligible', 'total', 'records'),
                    row(7, `${key}-daily`),
                    row(8, `${key}-rank`),
                    note(
                        3,
                        `**Top ${top === 6 ? 'six' : 'five'} groups plus Other.** Bars show each group's share of tokens in billing scope, not remaining allowance. Groups with the same name are kept separate. Data updates when usage is processed.${attributionNotes[key] ?? ''}`,
                    ),
                ],
            })),
        {
            key: 'all-usage',
            name: 'All usage',
            rows: [
                note(
                    2,
                    '### All recorded AI usage\nTokens in billing scope, excluded or background usage, and self-managed usage. **Current month up to yesterday (UTC). Today is excluded.** Recorded usage is not a provider invoice or a count of agent requests.',
                ),
                row(3, 'total', 'input', 'output'),
                row(3, 'cache-read', 'cache-write', 'reasoning'),
                note(
                    1,
                    '**Do not add these tiles together.** Cache-read and cache-write tokens are included in input tokens. Reasoning tokens may be included in output tokens. Missing provider usage is unknown, not zero.',
                ),
                row(7, 'model-daily'),
                row(8, 'model-rank'),
            ],
        },
        // A tab of its own, so no tab loads more than eight charts
        {
            key: 'completeness-attribution',
            name: 'Completeness & attribution',
            rows: [
                row(7, 'key-daily', 'outcome-daily'),
                row(7, 'quality'),
                note(
                    5,
                    '### Limits of these numbers\n**Tokens are not credits or cost.** Credits are calculated from model rates that apply from a given date, with separate rates for cached tokens. Contract periods, allowances and holds are not shown here.\n\n**Attribution:** usage cannot be linked to an individual data app or build. Unknown channels and missing identities are shown as they are, not assigned to another group.\n\n**Completeness:** totals cover recorded usage only. Partial usage from failed or aborted provider calls may not be recorded. For data apps, one AI call can cover a whole run for one model. Settings uses a live ledger. To reconcile with it, compare the same time window, because Analytics covers complete days only.',
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
