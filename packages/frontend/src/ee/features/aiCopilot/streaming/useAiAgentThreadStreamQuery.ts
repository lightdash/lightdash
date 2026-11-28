import { shallowEqual } from 'react-redux';
import {
    isAiAgentThreadStreamActive,
    isAiAgentThreadStreamRecoveryActive,
    type StreamPart,
} from '../store/aiAgentThreadStreamSlice';
import { useAiAgentStoreSelector } from '../store/hooks';
import { isAgentThreadQuiet } from './quietAgentThreads';

export const useAiAgentThreadStreamQuery = (threadUuid: string) => {
    const threadStream = useAiAgentStoreSelector((state) =>
        threadUuid in state.aiAgentThreadStream
            ? state.aiAgentThreadStream[threadUuid]
            : null,
    );

    return threadStream;
};

export const useAiAgentMessageStream = (
    threadUuid: string,
    messageUuid: string,
) =>
    useAiAgentStoreSelector((state) => {
        const threadStream = state.aiAgentThreadStream[threadUuid];
        return threadStream?.messageUuid === messageUuid ? threadStream : null;
    });

export const useAiAgentThreadStreaming = (threadUuid: string) =>
    useAiAgentStoreSelector((state) => {
        const threadStream = state.aiAgentThreadStream[threadUuid];
        return threadStream?.connection.status === 'streaming';
    });

export const useAiAgentThreadActiveMessageUuid = (threadUuid: string) =>
    useAiAgentStoreSelector((state) => {
        const threadStream = state.aiAgentThreadStream[threadUuid];
        return threadStream &&
            isAiAgentThreadStreamActive(threadStream.connection)
            ? threadStream.messageUuid
            : null;
    });

export const useAiAgentThreadRecoveryActive = (threadUuid: string) =>
    useAiAgentStoreSelector((state) => {
        const threadStream = state.aiAgentThreadStream[threadUuid];
        return (
            threadStream !== undefined &&
            isAiAgentThreadStreamRecoveryActive(threadStream.connection)
        );
    });

// Keep completed parts available so batched terminal tool results are not lost.
export const useAiAgentProjectStreamParts = (
    projectUuid: string | undefined,
): StreamPart[] =>
    useAiAgentStoreSelector(
        (state) =>
            Object.values(state.aiAgentThreadStream).flatMap((threadStream) =>
                threadStream.projectUuid === projectUuid
                    ? threadStream.parts
                    : [],
            ),
        shallowEqual,
    );

type AgentEditToolCall = Extract<
    StreamPart,
    { type: 'toolCall'; toolName: 'editContent' }
> & {
    isPreliminary: false;
    toolResult: { metadata: { status: 'success'; uuid: string; slug: string } };
};

const isSameToolCalls = (a: AgentEditToolCall[], b: AgentEditToolCall[]) =>
    a.length === b.length &&
    a.every((part, index) => part.toolCallId === b[index].toolCallId);

/** Finished, successful agent edits of one piece of content; unchanged while other parts stream. */
export const useAiAgentContentEdits = ({
    projectUuid,
    contentType,
    contentUuid,
}: {
    projectUuid: string | undefined;
    contentType: AgentEditToolCall['toolArgs']['type'];
    contentUuid: string | undefined;
}): AgentEditToolCall[] =>
    useAiAgentStoreSelector(
        (state) =>
            Object.values(state.aiAgentThreadStream).flatMap((threadStream) =>
                threadStream.projectUuid === projectUuid && contentUuid
                    ? threadStream.parts.filter(
                          (part): part is AgentEditToolCall =>
                              part.type === 'toolCall' &&
                              part.toolName === 'editContent' &&
                              part.toolArgs.type === contentType &&
                              part.isPreliminary === false &&
                              part.toolResult?.metadata.status === 'success' &&
                              part.toolResult.metadata.uuid === contentUuid,
                      )
                    : [],
            ),
        // A finished edit's result is final, so its id identifies it
        isSameToolCalls,
    );

/** Tool calls made in threads that must not move the page. */
export const useAiAgentQuietToolCallIds = (
    projectUuid: string | undefined,
): string[] =>
    useAiAgentStoreSelector(
        (state) =>
            Object.entries(state.aiAgentThreadStream).flatMap(
                ([threadUuid, threadStream]) =>
                    threadStream.projectUuid === projectUuid &&
                    isAgentThreadQuiet(threadUuid)
                        ? threadStream.parts.flatMap((part) =>
                              part.type === 'toolCall' ? [part.toolCallId] : [],
                          )
                        : [],
            ),
        shallowEqual,
    );

export const useAiAgentStreamParts = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
): StreamPart[] =>
    useAiAgentStoreSelector(
        (state) =>
            Object.values(state.aiAgentThreadStream).flatMap((threadStream) =>
                threadStream.projectUuid === projectUuid &&
                threadStream.agentUuid === agentUuid
                    ? threadStream.parts
                    : [],
            ),
        shallowEqual,
    );

export const useAiAgentThreadMessageStreaming = (
    threadUuid: string,
    messageUuid: string,
) =>
    useAiAgentStoreSelector((state) => {
        const threadStream = state.aiAgentThreadStream[threadUuid];
        return (
            threadStream?.connection.status === 'streaming' &&
            threadStream.messageUuid === messageUuid
        );
    });
