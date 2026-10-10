import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    type AgentConnectionExecution,
    type TraceTaskBase,
} from '@lightdash/common';
import { z } from 'zod';

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
