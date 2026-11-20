import {
    FilterOperator,
    UnitOfTime,
    type ChartAsCode,
    type DashboardAsCode,
} from '@lightdash/common';

type DashboardFilter = NonNullable<
    NonNullable<DashboardAsCode['filters']>['dimensions']
>[number];
type Target = { fieldId: string; tableName: string };

export const usageDashboardDateFilterLabel = 'Date';
export const usageDashboardProjectFilterLabel = 'Project';

// Models named differently from the table their fields belong to
const tableOfModel: Record<string, string> = {
    content_inventory: 'content_health',
    content_created: 'content_health',
    agent_request_starts: 'agent_requests',
};
// These tables describe the present, not a period, so a date range does not apply to them
const tablesWithoutPeriod = ['content_health', 'people_adoption'];
const dateFieldOfTable: Record<string, string> = {
    user_activity: 'activity_date_day',
    agent_requests: 'requested_at_day',
};

// A chart of a table that describes the present can still count what was created in the period
const dateFieldOfChart: Record<string, string> = {
    'lightdash-analytics-home-content-created': 'created_at_day',
    // New content is content created in the period, whenever it was viewed
    'lightdash-analytics-content-new-content-adoption-creation-week-proxy':
        'created_at_day',
};

const tableOf = (chart: ChartAsCode) =>
    tableOfModel[chart.metricQuery.exploreName] ??
    chart.metricQuery.exploreName;

// A chart that already limits its own period, like the last 12 months, keeps that period
const setsOwnPeriod = (chart: ChartAsCode) =>
    /"fieldId":"[a-z_]+_(raw|day|week|month|quarter|year)"/.test(
        JSON.stringify(chart.metricQuery.filters ?? {}),
    );

const dateTarget = (chart: ChartAsCode): Target | false => {
    const tableName = tableOf(chart);
    const ownField = dateFieldOfChart[chart.slug];
    if (ownField) return { fieldId: `${tableName}_${ownField}`, tableName };
    if (tablesWithoutPeriod.includes(tableName) || setsOwnPeriod(chart))
        return false;
    return {
        fieldId: `${tableName}_${dateFieldOfTable[tableName] ?? 'event_ts_day'}`,
        tableName,
    };
};

const projectTarget = (chart: ChartAsCode): Target => {
    const tableName = tableOf(chart);
    return { fieldId: `${tableName}_project_id`, tableName };
};

const filterOver = (
    charts: ChartAsCode[],
    targetOf: (chart: ChartAsCode) => Target | false,
    rule: Omit<DashboardFilter, 'target' | 'tileTargets'>,
): DashboardFilter[] => {
    const targets = charts.map((chart) => [chart.slug, targetOf(chart)]);
    const first = targets.find(([, target]) => target !== false)?.[1];
    // With no chart to act on, the filter would only be a control that does nothing
    if (!first) return [];
    return [
        {
            ...rule,
            target: first as Target,
            tileTargets: Object.fromEntries(targets),
        },
    ];
};

// The date range and project that the Analytics settings page offers, as filters of the dashboard itself. Each
// chart is pointed at the matching field of its own table. A filter the dashboard already defines is kept
export const withUsageDashboardFilters = (
    dashboard: DashboardAsCode,
    charts: ChartAsCode[],
): DashboardAsCode => {
    const dimensions = dashboard.filters?.dimensions ?? [];
    const has = (label: string) =>
        dimensions.some((filter) => filter.label === label);
    const shown = charts.filter(({ slug }) =>
        dashboard.tiles.some(
            (tile) =>
                'chartSlug' in tile.properties &&
                tile.properties.chartSlug === slug,
        ),
    );
    return {
        ...dashboard,
        filters: {
            metrics: [],
            tableCalculations: [],
            ...dashboard.filters,
            dimensions: [
                ...dimensions,
                ...(has(usageDashboardDateFilterLabel)
                    ? []
                    : filterOver(shown, dateTarget, {
                          label: usageDashboardDateFilterLabel,
                          operator: FilterOperator.IN_THE_PAST,
                          values: [30],
                          settings: {
                              unitOfTime: UnitOfTime.days,
                              completed: true,
                          },
                      })),
                ...(has(usageDashboardProjectFilterLabel)
                    ? []
                    : filterOver(shown, projectTarget, {
                          label: usageDashboardProjectFilterLabel,
                          operator: FilterOperator.EQUALS,
                          values: [],
                          // Any project, until one is chosen
                          disabled: true,
                      })),
            ],
        },
    };
};
