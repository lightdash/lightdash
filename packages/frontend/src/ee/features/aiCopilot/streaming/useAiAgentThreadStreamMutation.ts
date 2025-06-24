import { processDataStream } from 'ai';
import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { lightdashApiStream } from '../../../../api';
import { useAiAgentThreadStreamAbortController } from './AiAgentThreadStreamAbortControllerContext';
import {
    addToolCall,
    type AiAgentThreadStreamDispatch,
    appendToMessage,
    setError,
    startStreaming,
    stopStreaming,
} from './AiAgentThreadStreamStore';

export interface AiAgentThreadStreamOptions {
    agentUuid: string;
    threadUuid: string;
    onFinish?: () => void;
    onError?: (error: string) => void;
}

const streamAgentThreadResponse = async (
    agentUuid: string,
    threadUuid: string,
    { signal }: { signal: AbortSignal },
) =>
    lightdashApiStream({
        url: `/aiAgents/${agentUuid}/threads/${threadUuid}/stream`,
        method: 'POST',
        body: JSON.stringify({ threadUuid }),
        signal,
    });

export function useAiAgentThreadStreamMutation() {
    const dispatch = useDispatch<AiAgentThreadStreamDispatch>();
    const { setAbortController, abort } =
        useAiAgentThreadStreamAbortController();

    const streamMessage = useCallback(
        async ({
            agentUuid,
            threadUuid,
            onFinish,
            onError,
        }: AiAgentThreadStreamOptions) => {
            const abortController = new AbortController();
            setAbortController(threadUuid, abortController);

            try {
                dispatch(startStreaming({ threadUuid }));

                const response = await streamAgentThreadResponse(
                    agentUuid,
                    threadUuid,
                    {
                        signal: abortController.signal,
                    },
                );

                await processDataStream({
                    stream: response.body!,
                    onTextPart: (text) => {
                        if (abortController.signal.aborted) return;
                        dispatch(
                            appendToMessage({
                                threadUuid,
                                content: text,
                            }),
                        );
                    },
                    onFinishMessagePart: async (_finishMessage) => {
                        if (abortController.signal.aborted) return;

                        await onFinish?.();

                        dispatch(stopStreaming({ threadUuid }));
                    },
                    onToolCallPart: (toolCall) => {
                        if (abortController.signal.aborted) return;
                        dispatch(
                            addToolCall({
                                threadUuid,
                                toolCallId: toolCall.toolCallId,
                                toolName: toolCall.toolName,
                                args: toolCall.args,
                            }),
                        );
                    },
                    onErrorPart: (error) => {
                        if (abortController.signal.aborted) return;
                        console.error('Stream processing error:', error);
                        throw new Error(error);
                    },
                });
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    dispatch(stopStreaming({ threadUuid }));
                    return;
                }
                const errorMessage =
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred';
                dispatch(setError({ threadUuid, error: errorMessage }));
                onError?.(errorMessage);
            }
        },
        [dispatch, setAbortController],
    );

    const cancelMessageStream = useCallback(
        (threadUuid: string) => {
            abort(threadUuid);
        },
        [abort],
    );

    return {
        streamMessage,
        cancelMessageStream,
    };
}
