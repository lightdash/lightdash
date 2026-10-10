import {
    AgentActorSurface,
    buildAgentIdentityClaim,
    QueryExecutionContext,
    QuerySurface,
    type Account,
    type AgentIdentityClaim,
    type QueryResultReader,
} from '@lightdash/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { type AuditActor } from '../../logging/auditLog';
import { createActorFromAccount } from '../../logging/caslAuditWrapper';

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
    const facts = {
        oauthClientId:
            account.authentication.type === 'oauth'
                ? account.authentication.clientId
                : null,
        serviceAccountUuid:
            account.authentication.type === 'service-account'
                ? account.authentication.serviceAccountUuid
                : null,
    };
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

export const buildQueryAgentIdentity = (
    account: Account,
    _context: QueryExecutionContext,
    _querySurface: QuerySurface | null,
): AgentIdentityClaim | null =>
    getContentWriteAgentIdentity({
        userUuid: account.user.id,
        organizationUuid: account.organization.organizationUuid,
    });

export const buildResultReader = (
    account: Account,
    context: QueryExecutionContext = QueryExecutionContext.EXPLORE,
    querySurface: QuerySurface | null = null,
): QueryResultReader => {
    const claim = buildQueryAgentIdentity(account, context, querySurface);
    const authMethod = account.authentication.type;
    return claim === null
        ? { kind: 'person', authMethod }
        : { kind: 'agent', claim, authMethod };
};
