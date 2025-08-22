import { AgentToolCallArgsSchema, ToolNameSchema } from '@lightdash/common';
import { captureException } from '@sentry/react';
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
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    onFinish?: () => void;
    onError?: (error: string) => void;
}

const streamAgentThreadResponse = async (
    projectUuid: string,
    agentUuid: string,
    threadUuid: string,
    { signal }: { signal: AbortSignal },
) =>
    lightdashApiStream({
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/threads/${threadUuid}/stream`,
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
            projectUuid,
            agentUuid,
            threadUuid,
            messageUuid,
            onFinish,
            onError,
        }: AiAgentThreadStreamOptions) => {
            const abortController = new AbortController();
            setAbortController(threadUuid, abortController);

            try {
                dispatch(startStreaming({ threadUuid, messageUuid }));

                const response = await streamAgentThreadResponse(
                    projectUuid,
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
                        try {
                            const toolName = ToolNameSchema.parse(
                                toolCall.toolName,
                            );
                            const toolArgs = AgentToolCallArgsSchema.parse(
                                toolCall.args,
                            );

                            dispatch(
                                addToolCall({
                                    threadUuid,
                                    toolCallId: toolCall.toolCallId,
                                    toolName,
                                    toolArgs: toolArgs,
                                }),
                            );
                        } catch (error) {
                            console.error('Error parsing tool call:', error);
                            captureException(error);
                        }
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
