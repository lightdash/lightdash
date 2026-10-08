import {
    assertUnreachable,
    QueryExecutionContext,
    type Account,
} from '@lightdash/common';

export enum ConnectionSurface {
    APP = 'app',
    IN_APP_AGENT = 'in_app_agent',
    SLACK_AGENT = 'slack_agent',
    MCP = 'mcp',
    API = 'api',
    SCHEDULE = 'schedule',
    EMBED = 'embed',
    DATA_APP = 'data_app',
}

export enum WarehouseCredentialKind {
    SHARED = 'shared',
    PERSONAL = 'personal',
    AI_SERVICE_ACCOUNT = 'ai_service_account',
    COMPILE = 'compile',
}

export type ConnectionPerson = {
    userUuid: string;
    isRegisteredUser: boolean;
    isServiceAccount: boolean;
};

export type ConnectionAiClient = { kind: 'agent' | 'mcp' | 'data_app' };

export type ConnectionActor = {
    surface: ConnectionSurface;
    person: ConnectionPerson | null;
    aiClient: ConnectionAiClient | null;
};

export type ConnectionContext = {
    organizationUuid: string;
    actor: ConnectionActor;
    queryContext: QueryExecutionContext | null;
    purpose: 'query' | 'compile';
};

export const surfaceFromQueryContext = (
    context: QueryExecutionContext | null,
): ConnectionSurface => {
    switch (context) {
        case QueryExecutionContext.AI:
            return ConnectionSurface.IN_APP_AGENT;
        case QueryExecutionContext.MCP_RUN_METRIC_QUERY:
        case QueryExecutionContext.MCP_RUN_SQL:
        case QueryExecutionContext.MCP_SEARCH_FIELD_VALUES:
            return ConnectionSurface.MCP;
        case QueryExecutionContext.EMBED:
            return ConnectionSurface.EMBED;
        case QueryExecutionContext.ALERT:
        case QueryExecutionContext.SCHEDULED_DELIVERY:
        case QueryExecutionContext.SCHEDULED_GSHEETS_CHART:
        case QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD:
        case QueryExecutionContext.SCHEDULED_GSHEETS_SQL_CHART:
        case QueryExecutionContext.SCHEDULED_CHART:
        case QueryExecutionContext.SCHEDULED_DASHBOARD:
            return ConnectionSurface.SCHEDULE;
        case QueryExecutionContext.API:
        case QueryExecutionContext.CLI:
            return ConnectionSurface.API;
        case QueryExecutionContext.DATA_APP_SAMPLE:
            return ConnectionSurface.DATA_APP;
        case null:
        case QueryExecutionContext.DASHBOARD:
        case QueryExecutionContext.AUTOREFRESHED_DASHBOARD:
        case QueryExecutionContext.EXPLORE:
        case QueryExecutionContext.FILTER_AUTOCOMPLETE:
        case QueryExecutionContext.CHART:
        case QueryExecutionContext.CHART_HISTORY:
        case QueryExecutionContext.SQL_CHART:
        case QueryExecutionContext.SQL_RUNNER:
        case QueryExecutionContext.VIEW_UNDERLYING_DATA:
        case QueryExecutionContext.CSV:
        case QueryExecutionContext.GSHEETS:
        case QueryExecutionContext.GSHEETS_ADDON:
        case QueryExecutionContext.CALCULATE_TOTAL:
        case QueryExecutionContext.CALCULATE_SUBTOTAL:
        case QueryExecutionContext.METRICS_EXPLORER:
        case QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION:
        case QueryExecutionContext.COMPOSE_SQL_RUNNER:
        case QueryExecutionContext.MULTI_SOURCE_QUERY:
        case QueryExecutionContext.DESKTOP:
            return ConnectionSurface.APP;
        default:
            return assertUnreachable(
                context,
                'Unknown query execution context',
            );
    }
};

export const aiClientFromQueryContext = (
    context: QueryExecutionContext | null,
): ConnectionAiClient | null => {
    const surface = surfaceFromQueryContext(context);
    switch (surface) {
        case ConnectionSurface.IN_APP_AGENT:
            return { kind: 'agent' };
        case ConnectionSurface.MCP:
            return { kind: 'mcp' };
        case ConnectionSurface.DATA_APP:
            return { kind: 'data_app' };
        case ConnectionSurface.APP:
        case ConnectionSurface.SLACK_AGENT:
        case ConnectionSurface.API:
        case ConnectionSurface.SCHEDULE:
        case ConnectionSurface.EMBED:
            return null;
        default:
            return assertUnreachable(surface, 'Unknown connection surface');
    }
};

type ConnectionContextOptions = {
    organizationUuid: string;
    queryContext: QueryExecutionContext | null;
    purpose?: 'query' | 'compile';
};

export const connectionContextFromUser = (
    {
        userUuid,
        isRegisteredUser = true,
        isServiceAccount = false,
    }: {
        userUuid: string;
        isRegisteredUser?: boolean;
        isServiceAccount?: boolean;
    },
    {
        organizationUuid,
        queryContext,
        purpose = 'query',
    }: ConnectionContextOptions,
): ConnectionContext => ({
    organizationUuid,
    actor: {
        surface: surfaceFromQueryContext(queryContext),
        person: { userUuid, isRegisteredUser, isServiceAccount },
        aiClient: aiClientFromQueryContext(queryContext),
    },
    queryContext,
    purpose,
});

export const connectionContextFromAccount = (
    account: Account,
    options: ConnectionContextOptions,
): ConnectionContext =>
    connectionContextFromUser(
        {
            userUuid: account.user.id,
            isRegisteredUser: account.isRegisteredUser(),
            isServiceAccount: account.isServiceAccount(),
        },
        options,
    );
