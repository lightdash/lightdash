import { type ApiAiAgentThreadResponse } from '@lightdash/common';
import { useEffect } from 'react';
import useEmbed from '../../../providers/Embed/useEmbed';
import { useAiAgentStoreSelector } from '../store/hooks';
import { consumeEmbedAgentContentEvents } from '../streaming/agentContentEvents';
import { useAiAgentStreamParts } from '../streaming/useAiAgentThreadStreamQuery';

// Tells the embed host when the agent saves a chart or dashboard, so sibling embeds can refresh.
export const useEmitEmbedAgentContentEvents = ({
    projectUuid,
    agentUuid,
    threadUuid,
    thread,
}: {
    projectUuid: string | undefined;
    agentUuid: string | undefined;
    threadUuid: string | undefined;
    thread: ApiAiAgentThreadResponse['results'] | undefined;
}) => {
    const { dispatchEmbedEvent, isEmbedEventReady } = useEmbed();
    const parts = useAiAgentStreamParts(projectUuid, agentUuid);
    // Only the turn whose stream dropped this session is recovered from the refetched thread.
    const interruptedMessageUuid = useAiAgentStoreSelector((state) => {
        const stream = threadUuid && state.aiAgentThreadStream[threadUuid];
        return stream &&
            stream.wasInterrupted &&
            stream.projectUuid === projectUuid &&
            stream.agentUuid === agentUuid
            ? stream.messageUuid
            : null;
    });

    useEffect(() => {
        if (!isEmbedEventReady || !projectUuid || !agentUuid) return;
        const message =
            interruptedMessageUuid && thread && thread.uuid === threadUuid
                ? thread.messages.find(
                      (item) =>
                          item.role === 'assistant' &&
                          item.uuid === interruptedMessageUuid,
                  )
                : undefined;
        const events = consumeEmbedAgentContentEvents(
            projectUuid,
            agentUuid,
            parts,
            message?.role === 'assistant' ? message : undefined,
        );
        for (const event of events) {
            dispatchEmbedEvent(event.type, event.payload);
        }
    }, [
        projectUuid,
        agentUuid,
        threadUuid,
        thread,
        parts,
        interruptedMessageUuid,
        isEmbedEventReady,
        dispatchEmbedEvent,
    ]);
};
