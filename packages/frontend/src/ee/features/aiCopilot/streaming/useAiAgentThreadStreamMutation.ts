import {
    isAiAgentToolName,
    toolImproveContextArgsSchema,
    toolRunQueryOutputSchema,
} from '@lightdash/common';
import { captureException } from '@sentry/react';
import {
    DefaultChatTransport,
    readUIMessageStream,
    type UIMessageChunk,
    type ReasoningUIPart,
    type UIMessage,
} from 'ai';
import { useCallback } from 'react';
import { lightdashApiStream } from '../../../../api';
import {
    addReasoning,
    addMcpUnavailableNotice,
    addToolCall,
    markToolCallDecided,
    setError,
    setImproveContextNotification,
    setMessage,
    setParts,
    startStreaming,
    stopStreaming,
    type StreamPart,
} from '../store/aiAgentThreadStreamSlice';
import { useAiAgentStoreDispatch } from '../store/hooks';
import { useAiAgentThreadStreamAbortController } from './AiAgentThreadStreamAbortControllerContext';

export interface AiAgentThreadStreamOptions {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    enableSqlMode?: boolean;
    toolHints?: string[];
    onFinish?: () => void;
    onError?: (error: string) => void;
    refetchThread?: () => void;
}

type McpUnavailableNoticeChunk = UIMessageChunk & {
    type: 'data-mcp-unavailable';
    data: {
        serverUuid: string;
        serverName: string;
        message: string;
        status: 'not_connected' | 'connecting' | 'connected' | 'error';
    };
    transient?: boolean;
};

const getAgentThreadReadableStream = async (
    projectUuid: string,
    agentUuid: string,
    threadUuid: string,
    enableSqlMode: boolean,
    toolHints: string[],
    { signal }: { signal: AbortSignal },
) => {
    const res = await lightdashApiStream({
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/threads/${threadUuid}/stream`,
        method: 'POST',
        body: JSON.stringify({ enableSqlMode, toolHints }),
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

const getReasoningFromPart = (part: ReasoningUIPart) => {
    switch (true) {
        case part.providerMetadata?.openai !== undefined:
            return {
                reasoningId: part.providerMetadata.openai.itemId,
                text: part.text,
            };
        case part.providerMetadata?.anthropic !== undefined:
            return {
                reasoningId: part.providerMetadata.anthropic.signature,
                text: part.text,
            };
        case part.providerMetadata?.bedrock !== undefined:
            return {
                reasoningId: part.providerMetadata.bedrock.signature,
                text: part.text,
            };
        default:
            return null;
    }
};

export const getMcpUnavailableNoticeFromChunk = (
    chunk: UIMessageChunk,
): McpUnavailableNoticeChunk['data'] | null => {
    if (
        chunk.type === 'data-mcp-unavailable' &&
        'data' in chunk &&
        chunk.data &&
        typeof chunk.data === 'object'
    ) {
        const data = chunk.data as McpUnavailableNoticeChunk['data'];
        if (
            typeof data.serverUuid === 'string' &&
            typeof data.serverName === 'string' &&
            typeof data.message === 'string' &&
            typeof data.status === 'string'
        ) {
            return data;
        }
    }

    return null;
};

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
            enableSqlMode = false,
            toolHints = [],
            onFinish,
            onError,
            refetchThread,
        }: AiAgentThreadStreamOptions) => {
            const abortController = new AbortController();
            setAbortController(threadUuid, abortController);

            try {
                dispatch(startStreaming({ threadUuid, messageUuid }));

                const response = await getAgentThreadReadableStream(
                    projectUuid,
                    agentUuid,
                    threadUuid,
                    enableSqlMode,
                    toolHints,
                    {
                        signal: abortController.signal,
                    },
                );

                const parser = new ChatStreamParser();
                const chunkStream = parser.parseStream(response);
                const [rawChunkStream, uiMessageChunkStream] =
                    chunkStream.tee();
                const stream = readUIMessageStream({
                    stream: uiMessageChunkStream,
                });
                const rawChunkReader = rawChunkStream.getReader();

                const handledToolInputIds = new Set<string>();
                const handledToolDecisionIds = new Set<string>();
                const handledToolOutputIds = new Set<string>();

                const consumeRawChunks = (async () => {
                    while (true) {
                        const { done, value } = await rawChunkReader.read();
                        if (done) {
                            break;
                        }

                        const notice = getMcpUnavailableNoticeFromChunk(value);
                        if (notice) {
                            dispatch(
                                addMcpUnavailableNotice({
                                    threadUuid,
                                    notice,
                                }),
                            );
                            continue;
                        }
                    }
                })();

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

                    // Build the ordered parts array preserving text↔tool interleaving
                    const orderedParts: StreamPart[] = [];
                    for (const part of uiMessage.parts) {
                        if (part.type === 'text' && part.text) {
                            orderedParts.push({
                                type: 'text',
                                text: part.text,
                            });
                        } else if (
                            part.type.startsWith('tool-') ||
                            part.type === 'dynamic-tool'
                        ) {
                            const toolPart = part as {
                                type: string;
                                toolName?: string;
                                toolCallId: string;
                                input?: unknown;
                                output?: unknown;
                                preliminary?: boolean;
                                state: string;
                            };
                            if (
                                toolPart.state === 'input-available' ||
                                toolPart.state === 'output-available' ||
                                toolPart.state === 'output-error'
                            ) {
                                const toolName =
                                    toolPart.type === 'dynamic-tool'
                                        ? toolPart.toolName
                                        : toolPart.type.slice(5);

                                if (toolName && isAiAgentToolName(toolName)) {
                                    const hasOutput =
                                        toolPart.state === 'output-available';
                                    orderedParts.push({
                                        type: 'toolCall',
                                        toolCallId: toolPart.toolCallId,
                                        toolName,
                                        toolArgs: toolPart.input,
                                        toolOutput: hasOutput
                                            ? toolPart.output
                                            : undefined,
                                        isPreliminary: hasOutput
                                            ? (toolPart.preliminary ?? false)
                                            : undefined,
                                    });
                                }
                            }
                        }
                    }
                    dispatch(setParts({ threadUuid, parts: orderedParts }));

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
                            case 'tool-findContent':
                            case 'tool-findCharts':
                            case 'tool-improveContext':
                            case 'tool-searchFieldValues':
                            case 'tool-runQuery':
                            case 'tool-runSql':
                            case 'tool-listWarehouseTables':
                            case 'tool-describeWarehouseTable':
                            case 'tool-generateDashboard':
                                if (part.state !== 'input-available') {
                                    // Whenever a runSql tool result lands
                                    // (success, rejection, or timeout) — close
                                    // any open approval card. Idempotent.
                                    if (
                                        part.type === 'tool-runSql' &&
                                        part.state === 'output-available' &&
                                        !handledToolDecisionIds.has(
                                            part.toolCallId,
                                        )
                                    ) {
                                        handledToolDecisionIds.add(
                                            part.toolCallId,
                                        );
                                        dispatch(
                                            markToolCallDecided({
                                                threadUuid,
                                                toolCallId: part.toolCallId,
                                            }),
                                        );
                                    }
                                    if (
                                        !(
                                            part.type === 'tool-runQuery' &&
                                            part.state === 'output-available'
                                        )
                                    ) {
                                        break;
                                    }

                                    if (
                                        handledToolOutputIds.has(
                                            part.toolCallId,
                                        )
                                    ) {
                                        break;
                                    }

                                    const output =
                                        toolRunQueryOutputSchema.safeParse(
                                            part.output,
                                        );

                                    if (
                                        output.success &&
                                        output.data.metadata.status ===
                                            'success'
                                    ) {
                                        handledToolOutputIds.add(
                                            part.toolCallId,
                                        );

                                        void refetchThread?.();
                                    }

                                    break;
                                }

                                if (
                                    handledToolInputIds.has(part.toolCallId)
                                ) {
                                    break;
                                }

                                const toolName = part.type.split('-')[1];

                                try {
                                    if (!isAiAgentToolName(toolName)) {
                                        break;
                                    }

                                    handledToolInputIds.add(part.toolCallId);

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

                                        if (improveContextArgs.success) {
                                            dispatch(
                                                setImproveContextNotification({
                                                    threadUuid,
                                                    toolCallId: part.toolCallId,
                                                    suggestedInstruction:
                                                        improveContextArgs.data
                                                            .suggestedInstruction,
                                                }),
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
                                const reasoning = getReasoningFromPart(part);

                                if (
                                    reasoning &&
                                    typeof reasoning.reasoningId === 'string'
                                ) {
                                    dispatch(
                                        addReasoning({
                                            threadUuid,
                                            reasoningId: reasoning.reasoningId,
                                            text: reasoning.text,
                                        }),
                                    );
                                }
                                break;
                            case 'text':
                            case 'dynamic-tool':
                                if (
                                    part.state === 'input-available' ||
                                    part.state === 'output-available' ||
                                    part.state === 'output-error'
                                ) {
                                    if (
                                        handledToolInputIds.has(part.toolCallId)
                                    ) {
                                        break;
                                    }

                                    if (!isAiAgentToolName(part.toolName)) {
                                        break;
                                    }

                                    handledToolInputIds.add(part.toolCallId);

                                    dispatch(
                                        addToolCall({
                                            threadUuid,
                                            toolCallId: part.toolCallId,
                                            toolName: part.toolName,
                                            toolArgs: part.input,
                                        }),
                                    );
                                }
                                break;
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

                await consumeRawChunks;
                onFinish?.();
                dispatch(stopStreaming({ threadUuid }));
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    dispatch(stopStreaming({ threadUuid }));
                    return;
                }
                console.error('Error processing stream:', error);
                captureException(error, {
                    tags: {
                        errorType: 'AiAgentStreamError',
                    },
                });
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
