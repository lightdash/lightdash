import {
    AGENT_CLIENT_IDS,
    AgentActorSurface,
    buildAgentIdentityClaim,
    QuerySurface,
    type Account,
    type AgentIdentityClaim,
    type QueryExecutionContext,
} from '@lightdash/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
    connectionSurfaceFromQuerySurface,
    getAccountAgentIdentityFacts,
    getAgentActor,
    surfaceFromQueryContext,
} from '../WarehouseClientFactory/ConnectionContext';

type QueryAgentActor = { surface: AgentActorSurface; clientId: string | null };

export const agentExecutionContext = new AsyncLocalStorage<QueryAgentActor>();

export const resolveQueryAgentActor = ({
    context,
    querySurface,
    oauthClientId,
    explicitActor,
}: {
    context: QueryExecutionContext;
    querySurface: QuerySurface | null;
    oauthClientId: string | null;
    explicitActor?: QueryAgentActor | null;
}): QueryAgentActor | null => {
    if (explicitActor !== undefined) return explicitActor;
    const scopedActor = agentExecutionContext.getStore();
    if (scopedActor) return scopedActor;
    if (querySurface === QuerySurface.CLI) {
        return {
            surface: AgentActorSurface.CLI,
            clientId: AGENT_CLIENT_IDS[AgentActorSurface.CLI],
        };
    }
    const actor = getAgentActor({
        surface:
            querySurface === null
                ? surfaceFromQueryContext(context)
                : connectionSurfaceFromQuerySurface(querySurface, context),
        person: null,
        aiClient: null,
    });
    return actor?.surface === AgentActorSurface.MCP
        ? { ...actor, clientId: oauthClientId }
        : actor;
};

export const buildQueryAgentIdentity = (
    account: Account,
    context: QueryExecutionContext,
    querySurface: QuerySurface | null,
): AgentIdentityClaim | null => {
    const { serviceAccountUuid, oauthClientId } =
        getAccountAgentIdentityFacts(account);
    const actor = resolveQueryAgentActor({
        context,
        querySurface,
        oauthClientId,
    });
    const serviceAccount = account.isServiceAccount();
    const uuid = serviceAccount ? serviceAccountUuid : account.user.id;
    return actor && uuid && (serviceAccount || account.isRegisteredUser())
        ? buildAgentIdentityClaim({
              subject: {
                  type: serviceAccount ? 'service_account' : 'user',
                  uuid,
              },
              ...actor,
          })
        : null;
};
