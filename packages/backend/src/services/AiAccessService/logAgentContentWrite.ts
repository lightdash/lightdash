import { type AgentIdentityClaim } from '@lightdash/common';
import { type AgentActionPolicyLayer } from '../../database/entities/agentActionLog';
import { createAuditLogEvent } from '../../logging/auditLog';
import { logAuditEvent } from '../../logging/winston';
import { type AgentActionLogModel } from '../../models/AgentActionLogModel';
import { agentExecutionContext } from './agentExecutionContext';

type AgentActionTarget = {
    model: Pick<AgentActionLogModel, 'insert'>;
    agentIdentity: AgentIdentityClaim | null;
    projectUuid: string | null;
    objectType: string;
    objectUuid: string | null;
    versionUuid: string | null;
    action: string;
};

type AgentActionDecision =
    | { outcome: 'allowed'; policyLayer: null; reasonCode: null }
    | {
          outcome: 'denied';
          policyLayer: AgentActionPolicyLayer;
          reasonCode: string;
      };

export const recordAgentAction = async ({
    model,
    agentIdentity,
    projectUuid,
    objectType,
    objectUuid,
    objectId,
    versionUuid,
    action,
    outcome,
    policyLayer,
    reasonCode,
}: AgentActionTarget & {
    objectId: string | null;
} & AgentActionDecision): Promise<void> => {
    if (agentIdentity === null) return;
    const scope = agentExecutionContext.getStore();
    if (
        !scope?.agentIdentityEnabled ||
        scope.claim !== agentIdentity ||
        scope.organizationUuid === null
    )
        return;
    await model.insert({
        organization_uuid: scope.organizationUuid,
        project_uuid: projectUuid,
        agent_identity: agentIdentity,
        object_type: objectType,
        object_uuid: objectUuid,
        object_id: objectId,
        version_uuid: versionUuid,
        action,
        outcome,
        policy_layer: policyLayer,
        reason_code: reasonCode,
    });
    logAuditEvent(
        createAuditLogEvent(
            scope.actor,
            action,
            {
                type: objectType,
                organizationUuid: scope.organizationUuid,
                ...(projectUuid === null ? {} : { projectUuid }),
                metadata: {
                    event:
                        outcome === 'allowed'
                            ? 'agent_content.write'
                            : 'agent_action.refused',
                    objectType,
                    objectUuid,
                    versionUuid,
                    action,
                    surface: agentIdentity.act.surface,
                    clientId: agentIdentity.act.client_id,
                    agentUuid: agentIdentity.act.agent_uuid,
                    personUuid: agentIdentity.subject.uuid,
                    subjectType: agentIdentity.subject.type,
                    policyLayer,
                    reasonCode,
                },
            },
            { requestId: scope.operationId },
            outcome,
        ),
    );
};

export const logAgentContentWrite = (args: AgentActionTarget): Promise<void> =>
    recordAgentAction({
        ...args,
        objectId: null,
        outcome: 'allowed',
        policyLayer: null,
        reasonCode: null,
    });
