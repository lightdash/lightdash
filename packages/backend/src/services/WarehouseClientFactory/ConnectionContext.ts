import {
    AGENT_CLIENT_IDS,
    AgentActorSurface,
    assertUnreachable,
    isAiAccessQueryContext,
    QueryExecutionContext,
    QuerySurface,
    type Account,
    type AgentIdentityClaim,
} from '@lightdash/common';
import { getContentWriteAgentIdentity } from '../AiAccessService/agentExecutionContext';

export enum ConnectionSurface {
    APP = 'app',
    IN_APP_AGENT = 'in_app_agent',
    SLACK_AGENT = 'slack_agent',
    MCP = 'mcp',
    API = 'api',
    CLI = 'cli',
    SCHEDULE = 'schedule',
    EMBED = 'embed',
    DATA_APP = 'data_app',
}

export enum WarehouseCredentialKind {
    SHARED = 'shared',
    PERSONAL = 'personal',
    AI_AGENT_SIGN_IN = 'ai_agent_sign_in',
    AI_SERVICE_ACCOUNT = 'ai_service_account',
    COMPILE = 'compile',
}

export type ConnectionPerson = {
    userUuid: string;
    isRegisteredUser: boolean;
    isServiceAccount: boolean;
    serviceAccountUuid?: string | null;
    oauthClientId?: string | null;
};

export type ConnectionAiClient = {
    kind: 'agent' | 'mcp' | 'data_app';
    surface?: AgentActorSurface;
    clientId?: string | null;
    agentUuid?: string | null;
};

const agentSurfaces: Partial<Record<ConnectionSurface, AgentActorSurface>> = {
    [ConnectionSurface.IN_APP_AGENT]: AgentActorSurface.IN_APP_AGENT,
    [ConnectionSurface.MCP]: AgentActorSurface.MCP,
    [ConnectionSurface.CLI]: AgentActorSurface.CLI,
    [ConnectionSurface.SLACK_AGENT]: AgentActorSurface.SLACK_AGENT,
    [ConnectionSurface.DATA_APP]: AgentActorSurface.DATA_APP,
};

export const getAgentActor = (
    actor: ConnectionActor,
): {
    surface: AgentActorSurface;
    clientId: string | null;
    agentUuid?: string | null;
} | null => {
    const surface = actor.aiClient?.surface ?? agentSurfaces[actor.surface];
    if (surface === undefined) return null;
    const clientId =
        actor.aiClient?.clientId !== undefined
            ? actor.aiClient.clientId
            : AGENT_CLIENT_IDS[surface];
    return {
        surface,
        clientId,
        ...(actor.aiClient?.agentUuid !== undefined
            ? { agentUuid: actor.aiClient.agentUuid }
            : {}),
    };
};

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
    aiAccess: 'enforce' | 'diagnostic';
    agentIdentity?: AgentIdentityClaim | null;
};

export const querySurfaceFromConnectionSurface = (
    surface: ConnectionSurface,
): QuerySurface => {
    switch (surface) {
        case ConnectionSurface.IN_APP_AGENT:
        case ConnectionSurface.APP:
        case ConnectionSurface.DATA_APP:
        case ConnectionSurface.SCHEDULE:
        case ConnectionSurface.EMBED:
            return QuerySurface.APP;
        case ConnectionSurface.SLACK_AGENT:
            return QuerySurface.SLACK;
        case ConnectionSurface.MCP:
            return QuerySurface.MCP;
        case ConnectionSurface.API:
            return QuerySurface.API;
        case ConnectionSurface.CLI:
            return QuerySurface.CLI;
        default:
            return assertUnreachable(surface, 'Unknown connection surface');
    }
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

export const connectionSurfaceFromAgentSurface = (
    surface: AgentActorSurface,
): ConnectionSurface => {
    switch (surface) {
        case AgentActorSurface.API:
            return ConnectionSurface.API;
        case AgentActorSurface.MCP:
            return ConnectionSurface.MCP;
        case AgentActorSurface.SLACK_AGENT:
            return ConnectionSurface.SLACK_AGENT;
        case AgentActorSurface.CLI:
            return ConnectionSurface.CLI;
        case AgentActorSurface.DATA_APP:
            return ConnectionSurface.DATA_APP;
        case AgentActorSurface.IN_APP_AGENT:
        case AgentActorSurface.AI_SUMMARY:
            return ConnectionSurface.IN_APP_AGENT;
        default:
            return assertUnreachable(surface, 'Unknown agent surface');
    }
};

export const connectionSurfaceFromQuerySurface = (
    surface: QuerySurface,
    queryContext: QueryExecutionContext | null,
): ConnectionSurface => {
    switch (surface) {
        case QuerySurface.APP:
            return surfaceFromQueryContext(queryContext);
        case QuerySurface.SLACK:
            return ConnectionSurface.SLACK_AGENT;
        case QuerySurface.MCP:
            return ConnectionSurface.MCP;
        case QuerySurface.API:
            return ConnectionSurface.API;
        case QuerySurface.CLI:
            return queryContext !== null && isAiAccessQueryContext(queryContext)
                ? ConnectionSurface.CLI
                : ConnectionSurface.API;
        default:
            return assertUnreachable(surface, 'Unknown query surface');
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
        case ConnectionSurface.CLI:
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
    aiAccess?: ConnectionContext['aiAccess'];
    agentIdentity?: AgentIdentityClaim | null;
    surface?: ConnectionSurface;
    agentActor?: {
        surface: AgentActorSurface;
        clientId: string | null;
        agentUuid?: string | null;
    };
};

export const connectionContextFromUser = (
    {
        userUuid,
        isRegisteredUser = true,
        isServiceAccount = false,
        serviceAccountUuid = null,
        oauthClientId = null,
    }: {
        userUuid: string;
        isRegisteredUser?: boolean;
        isServiceAccount?: boolean;
        serviceAccountUuid?: string | null;
        oauthClientId?: string | null;
    },
    {
        organizationUuid,
        queryContext,
        purpose = 'query',
        aiAccess = 'enforce',
        surface = surfaceFromQueryContext(queryContext),
        agentActor,
        agentIdentity,
    }: ConnectionContextOptions,
): ConnectionContext => ({
    organizationUuid,
    agentIdentity:
        agentIdentity === undefined
            ? getContentWriteAgentIdentity({ userUuid, organizationUuid })
            : agentIdentity,
    actor: {
        surface,
        person: {
            userUuid,
            isRegisteredUser,
            isServiceAccount,
            serviceAccountUuid,
            oauthClientId,
        },
        aiClient: agentActor
            ? {
                  kind: aiClientFromQueryContext(queryContext)?.kind ?? 'agent',
                  ...agentActor,
              }
            : aiClientFromQueryContext(queryContext),
    },
    queryContext,
    purpose,
    aiAccess,
});

export const getAccountAgentIdentityFacts = (
    account: Account,
): { serviceAccountUuid: string | null; oauthClientId: string | null } => ({
    serviceAccountUuid:
        account.authentication.type === 'service-account'
            ? account.authentication.serviceAccountUuid
            : null,
    oauthClientId:
        account.authentication.type === 'oauth'
            ? account.authentication.clientId
            : null,
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
            ...getAccountAgentIdentityFacts(account),
        },
        options,
    );
