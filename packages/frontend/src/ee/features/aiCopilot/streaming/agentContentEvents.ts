import { assertUnreachable } from '@lightdash/common';
import {
    LightdashEventType,
    type ChartSavedPayload,
    type DashboardSavedPayload,
} from '../../embed/events/types';
import { type StreamPart } from '../store/aiAgentThreadStreamSlice';

export type AgentContentEvent =
    | { type: LightdashEventType.ChartSaved; payload: ChartSavedPayload }
    | {
          type: LightdashEventType.DashboardSaved;
          payload: DashboardSavedPayload;
      };

const getContentEvent = (part: StreamPart): AgentContentEvent | null => {
    if (
        part.type !== 'toolCall' ||
        (part.toolName !== 'createContent' &&
            part.toolName !== 'editContent') ||
        part.isPreliminary !== false ||
        part.toolResult?.metadata.status !== 'success'
    ) {
        return null;
    }

    const { uuid } = part.toolResult.metadata;
    const action = part.toolName === 'createContent' ? 'created' : 'updated';
    switch (part.toolArgs.type) {
        case 'chart':
            return {
                type: LightdashEventType.ChartSaved,
                payload: { chartUuid: uuid, action },
            };
        case 'dashboard':
            return {
                type: LightdashEventType.DashboardSaved,
                payload: { dashboardUuid: uuid, action },
            };
        case 'sql_chart':
        case 'document':
            return null;
        default:
            return assertUnreachable(
                part.toolArgs.type,
                `Unknown content type: ${part.toolArgs.type}`,
            );
    }
};

export const planAgentContentEvents = ({
    parts,
    handledToolCallIds,
}: {
    parts: StreamPart[];
    handledToolCallIds: Set<string>;
}): { handledToolCallIds: string[]; events: AgentContentEvent[] } => {
    const nextHandledToolCallIds: string[] = [];
    const events: AgentContentEvent[] = [];

    for (const part of parts) {
        if (part.type !== 'toolCall') continue;
        if (handledToolCallIds.has(part.toolCallId)) continue;

        const event = getContentEvent(part);
        if (!event) continue;

        nextHandledToolCallIds.push(part.toolCallId);
        events.push(event);
    }

    return { handledToolCallIds: nextHandledToolCallIds, events };
};
