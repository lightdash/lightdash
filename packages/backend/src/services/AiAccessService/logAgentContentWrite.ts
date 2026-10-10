import { ForbiddenError as CaslForbiddenError } from '@casl/ability';
import { ForbiddenError, type AgentIdentityClaim } from '@lightdash/common';
import { type Knex } from 'knex';
import { type AgentActionPolicyLayer } from '../../database/entities/agentActionLog';
import { createAuditLogEvent } from '../../logging/auditLog';
import Logger from '../../logging/logger';
import { logAuditEvent } from '../../logging/winston';
import { type AgentActionLogModel } from '../../models/AgentActionLogModel';
import {
    agentExecutionContext,
    getContentWriteAgentIdentity,
} from './agentExecutionContext';

type AgentActionTarget = {
    model: Pick<AgentActionLogModel, 'insert'>;
    agentIdentity: AgentIdentityClaim | null;
    projectUuid: string | null;
    objectType: string;
    objectUuid: string | null;
    versionUuid: string | null;
    action: string;
    trx?: Knex.Transaction;
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
    trx,
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
    const { organizationUuid } = scope;
    const entry = {
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
    };
    try {
        if (trx) await model.insert(entry, trx);
        else await model.insert(entry);
    } catch (error) {
        if (trx) throw error;
        Logger.error('Failed to record agent action', {
            organizationUuid,
            projectUuid,
            objectUuid,
            operationId: scope.operationId,
        });
        return;
    }
    const emitAudit = () =>
        logAuditEvent(
            createAuditLogEvent(
                scope.actor,
                action,
                {
                    type: objectType,
                    organizationUuid,
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
                        personUuid:
                            agentIdentity.subject.type === 'user'
                                ? agentIdentity.subject.uuid
                                : null,
                        subjectType: agentIdentity.subject.type,
                        policyLayer,
                        reasonCode,
                    },
                },
                { requestId: scope.operationId },
                outcome,
            ),
        );
    if (trx) {
        let committed = false;
        const onQuery = ({ sql }: { sql: string }) => {
            if (/^COMMIT\b/i.test(sql)) committed = true;
        };
        trx.on('query', onQuery);
        void trx.executionPromise.then(
            () => {
                trx.removeListener('query', onQuery);
                if (committed) emitAudit();
            },
            () => {
                trx.removeListener('query', onQuery);
            },
        );
    } else {
        emitAudit();
    }
};

export const logAgentContentWrite = (args: AgentActionTarget): Promise<void> =>
    recordAgentAction({
        ...args,
        objectId: null,
        outcome: 'allowed',
        policyLayer: null,
        reasonCode: null,
    });

const recordedRefusals = new WeakMap<object, string>();

export const recordAgentRefusal = async ({
    model,
    userUuid,
    organizationUuid,
    projectUuid,
    objectType,
    action,
    policyLayer,
    reasonCode,
    objectUuid = null,
    error,
}: {
    model: Pick<AgentActionLogModel, 'insert'>;
    userUuid: string;
    organizationUuid: string | null | undefined;
    projectUuid: string | null;
    objectType: string;
    action: string;
    policyLayer: AgentActionPolicyLayer;
    reasonCode: string;
    objectUuid?: string | null;
    error?: object;
}): Promise<void> => {
    const agentIdentity = getContentWriteAgentIdentity({
        userUuid,
        organizationUuid,
    });
    const scope = agentExecutionContext.getStore();
    if (!agentIdentity || !scope) return;
    if (error && recordedRefusals.get(error) === scope.operationId) return;
    if (error) recordedRefusals.set(error, scope.operationId);
    await recordAgentAction({
        model,
        agentIdentity,
        projectUuid,
        objectType,
        objectUuid,
        objectId: null,
        versionUuid: null,
        action,
        outcome: 'denied',
        policyLayer,
        reasonCode,
    });
};

export const isAgentActionForbiddenError = (error: unknown): error is Error =>
    error instanceof ForbiddenError || error instanceof CaslForbiddenError;
