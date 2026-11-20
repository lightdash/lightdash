import {
    type AiAgentMessageAssistant,
    type AiAgentToolCall,
} from '@lightdash/common';
import { z } from 'zod';
import {
    LightdashEventType,
    type ChartSavedPayload,
    type DashboardSavedPayload,
} from '../../embed/events/types';
import { type StreamPart } from '../store/aiAgentThreadStreamSlice';
import { getHandledAgentToolCallIds } from './handledAgentToolCalls';

export type AgentContentEvent =
    | { type: LightdashEventType.ChartSaved; payload: ChartSavedPayload }
    | {
          type: LightdashEventType.DashboardSaved;
          payload: DashboardSavedPayload;
      };

const savedContentSchema = z.object({
    args: z.object({ type: z.enum(['chart', 'dashboard']) }),
    result: z.object({
        metadata: z.object({
            status: z.literal('success'),
            uuid: z.string().min(1),
        }),
    }),
});

export const planAgentContentEvents = ({
    parts,
    recoveredMessage,
    handledToolCallIds,
}: {
    parts: StreamPart[];
    recoveredMessage?: AiAgentMessageAssistant;
    handledToolCallIds: Set<string>;
}): { handledToolCallIds: string[]; events: AgentContentEvent[] } => {
    const events = new Map<string, AgentContentEvent>();

    const addSave = (
        {
            toolCallId,
            toolName,
            toolArgs,
        }: Pick<AiAgentToolCall, 'toolCallId' | 'toolName' | 'toolArgs'>,
        result: unknown,
    ) => {
        if (
            (toolName !== 'createContent' && toolName !== 'editContent') ||
            handledToolCallIds.has(toolCallId) ||
            events.has(toolCallId)
        )
            return;

        const saved = savedContentSchema.safeParse({ args: toolArgs, result });
        if (!saved.success) return;

        const { uuid } = saved.data.result.metadata;
        const action = toolName === 'createContent' ? 'created' : 'updated';
        if (saved.data.args.type === 'chart') {
            events.set(toolCallId, {
                type: LightdashEventType.ChartSaved,
                payload: { chartUuid: uuid, action },
            });
        } else {
            events.set(toolCallId, {
                type: LightdashEventType.DashboardSaved,
                payload: { dashboardUuid: uuid, action },
            });
        }
    };

    for (const part of parts) {
        if (part.type === 'toolCall' && part.isPreliminary === false) {
            addSave(part, part.toolResult);
        }
    }

    if (recoveredMessage) {
        const results = new Map(
            recoveredMessage.toolResults.map((result) => [
                result.toolCallId,
                result,
            ]),
        );
        for (const call of recoveredMessage.toolCalls) {
            const result = results.get(call.toolCallId);
            if (
                call.toolType === 'built-in' &&
                call.promptUuid === recoveredMessage.uuid &&
                result?.toolType === 'built-in' &&
                result.toolName === call.toolName &&
                result.promptUuid === recoveredMessage.uuid
            ) {
                addSave(call, result);
            }
        }
    }

    return {
        handledToolCallIds: [...events.keys()],
        events: [...events.values()],
    };
};

export const consumeEmbedAgentContentEvents = (
    projectUuid: string,
    agentUuid: string,
    parts: StreamPart[],
    recoveredMessage?: AiAgentMessageAssistant,
) => {
    const handledToolCallIds = getHandledAgentToolCallIds(
        `embedEvents:${projectUuid}:${agentUuid}`,
    );
    const plan = planAgentContentEvents({
        parts,
        recoveredMessage,
        handledToolCallIds,
    });
    for (const toolCallId of plan.handledToolCallIds) {
        handledToolCallIds.add(toolCallId);
    }
    return plan.events;
};
