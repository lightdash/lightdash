import { type ApiAiAgentThreadResponse } from '@lightdash/common';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { shallowEqual, useStore } from 'react-redux';
import useEmbed from '../../../providers/Embed/useEmbed';
import { type AiAgentStoreState } from '../store';
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
    const store = useStore<AiAgentStoreState>();
    const turn = useAiAgentStoreSelector((state) => {
        const stream = threadUuid && state.aiAgentThreadStream[threadUuid];
        if (
            !stream ||
            !stream.interruptionId ||
            stream.projectUuid !== projectUuid ||
            stream.agentUuid !== agentUuid
        ) {
            return null;
        }
        return {
            messageUuid: stream.messageUuid,
            interruptionId: stream.interruptionId,
        };
    }, shallowEqual);
    const interruptionOnEntry = useRef<string | null>(null);
    const threadsBeforeCreation = useRef<Set<string> | null>(null);
    useLayoutEffect(() => {
        const streams = store.getState().aiAgentThreadStream;
        if (!threadUuid) {
            threadsBeforeCreation.current = new Set(Object.keys(streams));
            return;
        }
        // A new thread can lose its stream before navigation from the compose page finishes.
        const justCreated =
            threadsBeforeCreation.current?.has(threadUuid) === false;
        interruptionOnEntry.current = justCreated
            ? null
            : (streams[threadUuid]?.interruptionId ?? null);
        threadsBeforeCreation.current = null;
    }, [store, projectUuid, agentUuid, threadUuid]);

    useEffect(() => {
        if (!isEmbedEventReady || !projectUuid || !agentUuid) return;
        const message =
            turn &&
            turn.interruptionId !== interruptionOnEntry.current &&
            thread?.uuid === threadUuid &&
            thread?.agentUuid === agentUuid
                ? thread.messages.find(
                      (item) =>
                          item.role === 'assistant' &&
                          item.uuid === turn.messageUuid,
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
        turn,
        isEmbedEventReady,
        dispatchEmbedEvent,
    ]);
};
