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
    appendStepProgress,
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
import { type AiAgentToolCall, type AiAgentToolResult } from '../types';
import { useAiAgentThreadStreamAbortController } from './AiAgentThreadStreamAbortControllerContext';
import {
    parseStreamRawToolCall,
    parseStreamRawToolResult,
} from './parseStreamRawToolResult';

export interface AiAgentThreadStreamOptions {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    enableSqlMode?: boolean;
    toolHints?: string[];
    onFinish?: () => void;
    onError?: (error: string) => void;
    onToolCall?: (toolCall: AiAgentToolCall) => void;
    onToolResult?: (toolResult: AiAgentToolResult) => void;
    refetchThread?: () => void;
}

type StreamToolCallPart = Extract<StreamPart, { type: 'toolCall' }>;

type StreamToolPart = {
    type: string;
    toolName?: string;
    toolCallId: string;
    input?: unknown;
    output?: unknown;
    preliminary?: boolean;
    state: string;
};

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

type StepProgressChunk = UIMessageChunk & {
    type: 'data-step-progress';
    data: {
        message: string;
        // The tool the event belongs to, or null/absent when unattributed.
        toolName?: string | null;
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

const getStreamToolPart = (
    part: UIMessage['parts'][number],
): StreamToolPart | null => {
    if (!part.type.startsWith('tool-') && part.type !== 'dynamic-tool') {
        return null;
    }

    const toolPart = part as StreamToolPart;
    return {
        ...toolPart,
        toolName:
            toolPart.type === 'dynamic-tool'
                ? toolPart.toolName
                : toolPart.type.slice(5),
    };
};

const getStreamToolCallPart = (
    part: UIMessage['parts'][number],
): StreamToolCallPart | null => {
    const toolPart = getStreamToolPart(part);
    if (
        !toolPart ||
        !toolPart.toolName ||
        !isAiAgentToolName(toolPart.toolName) ||
        (toolPart.state !== 'input-available' &&
            toolPart.state !== 'output-available' &&
            toolPart.state !== 'output-error')
    ) {
        return null;
    }

    const hasOutput = toolPart.state === 'output-available';

    // Output chunks include both the original args and the tool result. Parse
    // once through the result schema so toolName, toolArgs, and toolResult stay
    // correlated in the returned typed stream part.
    if (hasOutput && toolPart.output !== undefined) {
        const toolResult = parseStreamRawToolResult({
            toolName: toolPart.toolName,
            toolArgs: toolPart.input,
            toolOutput: toolPart.output,
            isPreliminary: toolPart.preliminary ?? false,
        });
        if (!toolResult) return null;

        return {
            type: 'toolCall',
            toolCallId: toolPart.toolCallId,
            toolName: toolResult.toolName,
            toolArgs: toolResult.toolArgs,
            toolResult: toolResult.toolResult,
            isPreliminary: toolResult.isPreliminary,
        } as StreamToolCallPart;
    }

    // Input-only chunks are emitted before any result exists. They still need
    // typed args for live rendering, while toolResult remains null until an
    // output chunk for the same toolCallId arrives.
    const toolCall = parseStreamRawToolCall({
        toolName: toolPart.toolName,
        toolArgs: toolPart.input,
    });
    if (!toolCall) return null;

    return {
        type: 'toolCall',
        toolCallId: toolPart.toolCallId,
        ...toolCall,
        toolResult: null,
    } as StreamToolCallPart;
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

export const getStepProgressFromChunk = (
    chunk: UIMessageChunk,
): { message: string; toolName: string | null } | null => {
    if (
        chunk.type === 'data-step-progress' &&
        'data' in chunk &&
        chunk.data &&
        typeof chunk.data === 'object'
    ) {
        const data = chunk.data as StepProgressChunk['data'];
        if (typeof data.message === 'string' && data.message.length > 0) {
            return {
                message: data.message,
                toolName:
                    typeof data.toolName === 'string' ? data.toolName : null,
            };
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
            onToolCall,
            onToolResult,
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
                const notifiedToolCallIds = new Set<string>();
                const notifiedToolOutputIds = new Set<string>();

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

                        const stepProgress = getStepProgressFromChunk(value);
                        if (stepProgress) {
                            dispatch(
                                appendStepProgress({
                                    threadUuid,
                                    message: stepProgress.message,
                                    toolName: stepProgress.toolName,
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
                        } else {
                            const toolCallPart = getStreamToolCallPart(part);
                            if (toolCallPart) {
                                orderedParts.push(toolCallPart);
                            }
                        }
                    }
                    dispatch(setParts({ threadUuid, parts: orderedParts }));

                    // Process tool calls from the complete message
                    for (const part of uiMessage.parts) {
                        if (abortController.signal.aborted) return;

                        const toolPart = getStreamToolPart(part);
                        const toolCallPart = getStreamToolCallPart(part);

                        if (toolCallPart) {
                            const { type: _type, ...toolCall } = toolCallPart;
                            dispatch(addToolCall({ threadUuid, ...toolCall }));
                        }

                        if (
                            toolCallPart &&
                            toolPart?.toolName &&
                            toolPart.state === 'input-available' &&
                            !notifiedToolCallIds.has(toolPart.toolCallId)
                        ) {
                            notifiedToolCallIds.add(toolPart.toolCallId);
                            onToolCall?.(toolCallPart);
                        }

                        if (
                            toolCallPart &&
                            toolCallPart.toolResult !== null &&
                            toolCallPart.isPreliminary !== undefined
                        ) {
                            const outputKey = `${toolCallPart.toolCallId}:${String(
                                toolCallPart.isPreliminary,
                            )}`;
                            if (!notifiedToolOutputIds.has(outputKey)) {
                                notifiedToolOutputIds.add(outputKey);
                                onToolResult?.({
                                    toolName: toolCallPart.toolName,
                                    toolArgs: toolCallPart.toolArgs,
                                    toolResult: toolCallPart.toolResult,
                                    isPreliminary: toolCallPart.isPreliminary,
                                } as AiAgentToolResult);
                            }
                        }

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
                            case 'tool-generateVisualization':
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
                                            (part.type === 'tool-runQuery' ||
                                                part.type ===
                                                    'tool-generateVisualization') &&
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

                                if (handledToolInputIds.has(part.toolCallId)) {
                                    break;
                                }

                                const toolName = part.type.split('-')[1];

                                try {
                                    if (!isAiAgentToolName(toolName)) {
                                        break;
                                    }

                                    handledToolInputIds.add(part.toolCallId);

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
