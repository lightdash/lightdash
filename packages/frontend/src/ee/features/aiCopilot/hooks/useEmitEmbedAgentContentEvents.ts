import { useEffect } from 'react';
import useEmbed from '../../../providers/Embed/useEmbed';
import { planAgentContentEvents } from '../streaming/agentContentEvents';
import { getHandledAgentToolCallIds } from '../streaming/handledAgentToolCalls';
import { useAiAgentStreamParts } from '../streaming/useAiAgentThreadStreamQuery';

// Tells the embed host when the agent saves a chart or dashboard, so sibling embeds can refresh.
export const useEmitEmbedAgentContentEvents = ({
    projectUuid,
    agentUuid,
}: {
    projectUuid: string | undefined;
    agentUuid: string | undefined;
}) => {
    const { dispatchEmbedEvent, isEmbedEventReady } = useEmbed();
    const parts = useAiAgentStreamParts(projectUuid, agentUuid);

    useEffect(() => {
        if (!isEmbedEventReady || !projectUuid || !agentUuid) return;

        const handledToolCallIds = getHandledAgentToolCallIds(
            `embedEvents:${projectUuid}:${agentUuid}`,
        );
        const plan = planAgentContentEvents({ parts, handledToolCallIds });

        for (const toolCallId of plan.handledToolCallIds) {
            handledToolCallIds.add(toolCallId);
        }
        for (const event of plan.events) {
            dispatchEmbedEvent(event.type, event.payload);
        }
    }, [parts, projectUuid, agentUuid, isEmbedEventReady, dispatchEmbedEvent]);
};
