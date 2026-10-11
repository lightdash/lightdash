import {
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    assertUnreachable,
    ForbiddenError,
    type AgentConnectionExecution,
    type AgentConnectionTaskEffect,
    type TraceTaskBase,
} from '@lightdash/common';
import { z } from 'zod';
import { agentExecutionContext } from '../services/AiAccessService/agentExecutionContext';

const connectionExecutionSchema = z
    .object({
        grantUuid: z.string().min(1),
        revision: z.number().int().positive(),
        subjectUserUuid: z.string().min(1),
        organizationUuid: z.string().min(1),
        clientId: z.literal('lightdash-cli'),
        resource: z.string().min(1),
        refreshFamilyUuid: z.string().min(1),
        scopes: z.array(z.string()),
        operation: z
            .object({ kind: z.literal('rest'), key: z.string().min(1) })
            .strict(),
    })
    .strict();

export const normalizeAgentConnectionExecution = (
    stored: unknown,
): AgentConnectionExecution | null => {
    if (stored == null) return null;
    const parsed = connectionExecutionSchema.safeParse(stored);
    if (!parsed.success) {
        throw new AiAccessRefusedError(
            AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
        );
    }
    return parsed.data;
};

export const normalizeAgentConnectionTaskPayload = <
    T extends Partial<TraceTaskBase>,
>(
    payload: T,
): T => {
    const execution = normalizeAgentConnectionExecution(
        payload.agentConnectionExecution,
    );
    if (execution === null) return payload;
    if (
        execution.subjectUserUuid !== payload.userUuid ||
        execution.organizationUuid !== payload.organizationUuid
    ) {
        throw new AiAccessRefusedError(
            AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
        );
    }
    return { ...payload, agentConnectionExecution: execution };
};

export const captureAgentConnectionTask = (
    effect: AgentConnectionTaskEffect,
    owner: Pick<TraceTaskBase, 'userUuid' | 'organizationUuid'>,
): Pick<
    TraceTaskBase,
    'agentConnectionExecution' | 'agentConnectionEffect'
> => {
    const scope = agentExecutionContext.getStore();
    const ref = scope?.claim?.act.agent_connection_grant;
    const execution = normalizeAgentConnectionExecution(
        scope?.agentConnectionExecution,
    );
    if (!ref && !execution) return {};
    if (
        !execution ||
        !ref ||
        execution.grantUuid !== ref.grantUuid ||
        execution.revision !== ref.revision ||
        execution.subjectUserUuid !== owner.userUuid ||
        execution.organizationUuid !== owner.organizationUuid
    )
        throw new ForbiddenError(
            'This agent connection is no longer available for this operation.',
        );
    return {
        agentConnectionExecution: execution,
        agentConnectionEffect: effect,
    };
};

export const getAgentConnectionEffectCapabilities = (
    effect: AgentConnectionTaskEffect,
    execution: AgentConnectionExecution,
): AgentCapability[] => {
    if (
        ![
            'ProjectController.refresh',
            'ExploreController.SetExplores',
            'DeployController.deployExplores',
            'DeployController.finalizeDeploySession',
        ].includes(execution.operation.key)
    )
        throw new ForbiddenError('Invalid agent connection effect origin');
    switch (effect) {
        case 'compileProject':
        case 'validateProject':
            return [AgentCapability.DeployUpload];
        case 'replaceCustomFields':
            return [AgentCapability.DeployUpload, AgentCapability.ContentWrite];
        case 'materializePreAggregate':
            return [AgentCapability.DeployUpload, AgentCapability.Query];
        default:
            return assertUnreachable(effect, 'Unknown agent connection effect');
    }
};
