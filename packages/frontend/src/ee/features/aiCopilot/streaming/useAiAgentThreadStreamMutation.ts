import {
    AiResultType,
    toolImproveContextArgsSchema,
    ToolNameSchema,
} from '@lightdash/common';
import { captureException } from '@sentry/react';
import { DefaultChatTransport, readUIMessageStream, type UIMessage } from 'ai';
import { useCallback } from 'react';
import { lightdashApiStream } from '../../../../api';
import {
    addReasoning,
    addToolCall,
    setError,
    setImproveContextNotification,
    setMessage,
    startStreaming,
    stopStreaming,
} from '../store/aiAgentThreadStreamSlice';
import { useAiAgentStoreDispatch } from '../store/hooks';
import { useAiAgentThreadStreamAbortController } from './AiAgentThreadStreamAbortControllerContext';

export interface AiAgentThreadStreamOptions {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    onFinish?: () => void;
    onError?: (error: string) => void;
}

const getAgentThreadReadableStream = async (
    projectUuid: string,
    agentUuid: string,
    threadUuid: string,
    { signal }: { signal: AbortSignal },
) => {
    const res = await lightdashApiStream({
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/threads/${threadUuid}/stream`,
        method: 'POST',
        body: JSON.stringify({ threadUuid }),
        signal,
    });

    const body = res.body;
    if (!body) throw new Error('No body found');

    return body;
};

class ChatStreamParser extends DefaultChatTransport<UIMessage> {
    public parseStream(stream: ReadableStream<Uint8Array>) {
        return this.processResponseStream(stream);
    }
}

export function useAiAgentThreadStreamMutation() {
    const dispatch = useAiAgentStoreDispatch();
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

                const response = await getAgentThreadReadableStream(
                    projectUuid,
                    agentUuid,
                    threadUuid,
                    {
                        signal: abortController.signal,
                    },
                );

                const parser = new ChatStreamParser();
                const chunkStream = parser.parseStream(response);
                const stream = readUIMessageStream({
                    stream: chunkStream,
                });
                try {
                    for await (const uiMessage of stream) {
                        if (abortController.signal.aborted) return;

                        // Extract and combine all text content from the complete message
                        const fullTextContent = uiMessage.parts
                            .filter((part) => part.type === 'text')
                            .map((part) => part.text)
                            .join('\n');

                        // Update message content with complete text
                        if (fullTextContent) {
                            dispatch(
                                setMessage({
                                    threadUuid,
                                    content: fullTextContent,
                                }),
                            );
                        }

                        // Process tool calls from the complete message
                        for (const part of uiMessage.parts) {
                            if (abortController.signal.aborted) return;
                            switch (part.type) {
                                // TODO: this is a temporary solution
                                // there should be a way of leveraging ToolUIPart based on the tools available
                                case 'tool-generateBarVizConfig':
                                case 'tool-generateTableVizConfig':
                                case 'tool-generateTimeSeriesVizConfig':
                                case 'tool-findExplores':
                                case 'tool-findFields':
                                case 'tool-findDashboards':
                                case 'tool-findCharts':
                                case 'tool-improveContext':
                                case 'tool-searchFieldValues':
                                case 'tool-runQuery':
                                case 'tool-generateDashboard':
                                    if (part.state !== 'input-available') break;

                                    const toolNameUnsafe =
                                        part.type.split('-')[1];

                                    try {
                                        const toolName =
                                            ToolNameSchema.parse(
                                                toolNameUnsafe,
                                            );

                                        // Store raw tool args (will be validated in rendering components)
                                        dispatch(
                                            addToolCall({
                                                threadUuid,
                                                toolCallId: part.toolCallId,
                                                toolName,
                                                toolArgs: part.input,
                                            }),
                                        );

                                        // Special handling for improveContext - validate to access suggestedInstruction
                                        if (toolName === 'improveContext') {
                                            const improveContextArgs =
                                                toolImproveContextArgsSchema.safeParse(
                                                    part.input,
                                                );

                                            if (
                                                improveContextArgs.success &&
                                                improveContextArgs.data.type ===
                                                    AiResultType.IMPROVE_CONTEXT
                                            ) {
                                                dispatch(
                                                    setImproveContextNotification(
                                                        {
                                                            threadUuid,
                                                            toolCallId:
                                                                part.toolCallId,
                                                            suggestedInstruction:
                                                                improveContextArgs
                                                                    .data
                                                                    .suggestedInstruction,
                                                        },
                                                    ),
                                                );
                                            }
                                        }
                                    } catch (error) {
                                        console.error(
                                            'Error parsing tool call:',
                                            error,
                                        );
                                        captureException(error);
                                    }
                                    break;
                                case 'reasoning':
                                    const reasoningId =
                                        part.providerMetadata?.openai?.itemId;
                                    const text = part.text;

                                    if (typeof reasoningId === 'string') {
                                        dispatch(
                                            addReasoning({
                                                threadUuid,
                                                reasoningId,
                                                text,
                                            }),
                                        );
                                    }
                                    break;
                                case 'text':
                                case 'dynamic-tool':
                                case 'file':
                                case 'source-document':
                                case 'source-url':
                                case 'step-start':
                                default:
                                    // text content is handled above, other parts not implemented
                                    break;
                            }
                        }
                    }

                    onFinish?.();
                    dispatch(stopStreaming({ threadUuid }));
                } catch (error) {
                    console.error('Error processing stream:', error);
                    captureException(error);
                }
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    dispatch(stopStreaming({ threadUuid }));
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
