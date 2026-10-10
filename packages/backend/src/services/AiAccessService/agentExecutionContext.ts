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
import { randomUUID } from 'node:crypto';
import { type AuditActor } from '../../logging/auditLog';
import { createActorFromAccount } from '../../logging/caslAuditWrapper';
import {
    connectionSurfaceFromQuerySurface,
    getAccountAgentIdentityFacts,
    getAgentActor,
    surfaceFromQueryContext,
} from '../WarehouseClientFactory/ConnectionContext';

export type QueryAgentActor = {
    surface: AgentActorSurface;
    clientId: string | null;
    agentUuid?: string | null;
};

export type AgentExecutionContext = Readonly<{
    surface: AgentActorSurface;
    clientId: string | null;
    agentUuid: string | null;
    claim: AgentIdentityClaim | null;
    actor: AuditActor;
    organizationUuid: string | null;
    writerUuid: string;
    operationId: string;
    agentIdentityEnabled: boolean;
}>;

export const agentExecutionContext =
    new AsyncLocalStorage<AgentExecutionContext>();

export const createAgentExecutionContext = ({
    account,
    surface,
    clientId,
    agentUuid,
    agentIdentityEnabled,
}: {
    account: Account;
    surface: AgentActorSurface;
    clientId: string | null;
    agentUuid: string | null;
    agentIdentityEnabled: boolean;
}): AgentExecutionContext => {
    const facts = getAccountAgentIdentityFacts(account);
    const resolvedClientId =
        surface === AgentActorSurface.MCP ? facts.oauthClientId : clientId;
    const resolvedAgentUuid =
        surface === AgentActorSurface.MCP ? null : agentUuid;
    const subjectUuid = account.isServiceAccount()
        ? facts.serviceAccountUuid
        : account.user.id;
    const claim =
        subjectUuid &&
        (account.isRegisteredUser() || account.isServiceAccount())
            ? buildAgentIdentityClaim({
                  subject: {
                      type: account.isServiceAccount()
                          ? 'service_account'
                          : 'user',
                      uuid: subjectUuid,
                  },
                  surface,
                  clientId: resolvedClientId,
                  agentUuid: resolvedAgentUuid,
              })
            : null;
    if (claim) {
        Object.freeze(claim.subject);
        Object.freeze(claim.act);
        Object.freeze(claim);
    }
    const actor = createActorFromAccount(account);
    if ('groupMemberships' in actor && actor.groupMemberships)
        Object.freeze(actor.groupMemberships);
    if ('impersonatedBy' in actor && actor.impersonatedBy)
        Object.freeze(actor.impersonatedBy);
    return Object.freeze({
        surface,
        clientId: resolvedClientId,
        agentUuid: resolvedAgentUuid,
        claim,
        actor: Object.freeze(actor),
        organizationUuid: account.organization.organizationUuid ?? null,
        writerUuid: account.user.id,
        operationId: randomUUID(),
        agentIdentityEnabled,
    });
};

export const getContentWriteAgentIdentity = ({
    userUuid,
    organizationUuid,
}: {
    userUuid: string;
    organizationUuid: string | undefined | null;
}): AgentIdentityClaim | null => {
    const scope = agentExecutionContext.getStore();
    if (
        !scope?.agentIdentityEnabled ||
        !scope.claim ||
        scope.organizationUuid === null ||
        scope.writerUuid !== userUuid ||
        scope.organizationUuid !== organizationUuid
    )
        return null;
    return scope.claim;
};

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
    if (scopedActor)
        return {
            surface: scopedActor.surface,
            clientId: scopedActor.clientId,
            agentUuid: scopedActor.agentUuid,
        };
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

export const withQueryAgentUuid = (
    claim: AgentIdentityClaim | null | undefined,
    actor: QueryAgentActor | null | undefined,
): AgentIdentityClaim | null =>
    claim && actor?.agentUuid != null
        ? { ...claim, act: { ...claim.act, agent_uuid: actor.agentUuid } }
        : (claim ?? null);
