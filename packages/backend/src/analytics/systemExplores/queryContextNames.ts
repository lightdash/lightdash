import { QueryExecutionContext } from '@lightdash/common';

// Plain names for where a query was run from. The recorded value is a code name ("autorefreshedDashboard");
// charts show these instead. A value with no name here is shown as recorded.
export const queryContextNames: Record<QueryExecutionContext, string> = {
    [QueryExecutionContext.DASHBOARD]: 'Dashboard view',
    [QueryExecutionContext.AUTOREFRESHED_DASHBOARD]: 'Auto-refreshed dashboard',
    [QueryExecutionContext.EXPLORE]: 'Explore',
    [QueryExecutionContext.FILTER_AUTOCOMPLETE]: 'Filter autocomplete',
    [QueryExecutionContext.CHART]: 'Chart view',
    [QueryExecutionContext.CHART_HISTORY]: 'Chart history',
    [QueryExecutionContext.SQL_CHART]: 'SQL chart view',
    [QueryExecutionContext.SQL_RUNNER]: 'SQL runner',
    [QueryExecutionContext.VIEW_UNDERLYING_DATA]: 'View underlying data',
    [QueryExecutionContext.ALERT]: 'Alert',
    [QueryExecutionContext.SCHEDULED_DELIVERY]: 'Scheduled delivery',
    [QueryExecutionContext.CSV]: 'CSV download',
    [QueryExecutionContext.GSHEETS]: 'Google Sheets',
    [QueryExecutionContext.GSHEETS_ADDON]: 'Google Sheets add-on',
    [QueryExecutionContext.SCHEDULED_GSHEETS_CHART]:
        'Scheduled Google Sheets chart',
    [QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD]:
        'Scheduled Google Sheets dashboard',
    [QueryExecutionContext.SCHEDULED_GSHEETS_SQL_CHART]:
        'Scheduled Google Sheets SQL chart',
    [QueryExecutionContext.SCHEDULED_CHART]: 'Scheduled chart',
    [QueryExecutionContext.SCHEDULED_DASHBOARD]: 'Scheduled dashboard',
    [QueryExecutionContext.CALCULATE_TOTAL]: 'Totals',
    [QueryExecutionContext.CALCULATE_SUBTOTAL]: 'Subtotals',
    [QueryExecutionContext.EMBED]: 'Embed',
    [QueryExecutionContext.AI]: 'AI',
    [QueryExecutionContext.MCP_RUN_METRIC_QUERY]: 'MCP metric query',
    [QueryExecutionContext.MCP_RUN_SQL]: 'MCP SQL query',
    [QueryExecutionContext.MCP_SEARCH_FIELD_VALUES]: 'MCP field value search',
    [QueryExecutionContext.MCP_QUERY]: 'MCP query',
    [QueryExecutionContext.API]: 'API',
    [QueryExecutionContext.CLI]: 'CLI',
    [QueryExecutionContext.METRICS_EXPLORER]: 'Metrics explorer',
    [QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION]:
        'Pre-aggregate build',
    [QueryExecutionContext.COMPOSE_SQL_RUNNER]: 'Compose SQL runner',
    [QueryExecutionContext.PYTHON_RUNNER]: 'Python runner',
    [QueryExecutionContext.MULTI_SOURCE_QUERY]: 'Multi-source query',
    [QueryExecutionContext.DATA_APP_SAMPLE]: 'Data app sample',
    [QueryExecutionContext.DESKTOP]: 'Desktop',
};

// SQL that turns the recorded value in `column` into its plain name.
export const queryContextNameSql = (column: string): string =>
    `CASE ${column} ${Object.entries(queryContextNames)
        .map(([value, name]) => `WHEN '${value}' THEN '${name}'`)
        .join(' ')} ELSE ${column} END`;
