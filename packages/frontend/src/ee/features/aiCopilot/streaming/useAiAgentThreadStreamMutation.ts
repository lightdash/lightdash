import { isAiAgentToolName, toolRunQueryOutputSchema } from '@lightdash/common';
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
import { getAiAgentApiBase } from '../hooks/aiAgentRouting';
import {
    addReasoning,
    addToolCall,
    appendStepProgress,
    markFirstToken,
    markStreamRecovering,
    markToolCallDecided,
    setError,
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
    parseStreamRawPartialToolCall,
    parseStreamRawToolCall,
    parseStreamRawToolResult,
} from './parseStreamRawToolResult';
import { createStreamInactivityMonitor } from './streamInactivityMonitor';

export interface AiAgentThreadStreamOptions {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    enableSqlMode?: boolean;
    autoApproveSql?: boolean;
    toolHints?: string[];
    onFinish?: () => void;
    onError?: (error: string) => void;
    onToolCall?: (toolCall: AiAgentToolCall) => void;
    onToolResult?: (toolResult: AiAgentToolResult) => void;
    refetchThread: () => void;
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

type StepProgressChunk = UIMessageChunk & {
    type: 'data-step-progress';
    data: {
        message: string;
        // The tool the event belongs to, or null/absent when unattributed.
        toolName?: string | null;
        // Correlates repeated events about the same unit of work (e.g. a
        // composer pipeline node, keyed `${toolCallId}:${nodeId}`).
        progressId?: string | null;
        progressStatus?: 'in_progress' | 'complete' | 'error' | null;
    };
    transient?: boolean;
};

const getAgentThreadReadableStream = async (
    projectUuid: string,
    agentUuid: string,
    threadUuid: string,
    enableSqlMode: boolean | undefined,
    autoApproveSql: boolean,
    toolHints: string[],
    { signal }: { signal: AbortSignal },
) => {
    const res = await lightdashApiStream({
        url: `${getAiAgentApiBase(
            projectUuid,
        )}/${agentUuid}/threads/${threadUuid}/stream`,
        method: 'POST',
        body: JSON.stringify({ enableSqlMode, autoApproveSql, toolHints }),
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

export const getReasoningFromPart = (part: ReasoningUIPart) => {
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
        case part.providerMetadata?.google !== undefined:
            return {
                reasoningId:
                    part.providerMetadata.google.signature ??
                    crypto.randomUUID(),
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

export const getStreamToolCallPart = (
    part: UIMessage['parts'][number],
): StreamToolCallPart | null => {
    const toolPart = getStreamToolPart(part);
    if (
        !toolPart ||
        !toolPart.toolName ||
        !isAiAgentToolName(toolPart.toolName)
    ) {
        return null;
    }

    // While the model is still writing the call's input, tools with a lenient
    // partial parser (runComposerQueries) render progressively instead of
    // waiting for input-available.
    if (toolPart.state === 'input-streaming') {
        const partialToolCall = parseStreamRawPartialToolCall({
            toolName: toolPart.toolName,
            toolArgs: toolPart.input,
        });
        if (!partialToolCall) return null;
        return {
            type: 'toolCall',
            toolCallId: toolPart.toolCallId,
            ...partialToolCall,
            toolResult: null,
        } as StreamToolCallPart;
    }

    if (
        toolPart.state !== 'input-available' &&
        toolPart.state !== 'output-available' &&
        toolPart.state !== 'output-error'
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
            // Explicit false so merge-by-toolCallId in the stream slice
            // clears the flag once the full input has arrived.
            isArgsPartial: false,
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
        isArgsPartial: false,
    } as StreamToolCallPart;
};

type StreamReadResult<T> =
    | { status: 'success'; value: T }
    | { status: 'error'; error: unknown };

export const readStreamResult = async <T>(
    read: () => Promise<T>,
): Promise<StreamReadResult<T>> => {
    try {
        return { status: 'success', value: await read() };
    } catch (error) {
        return { status: 'error', error };
    }
};

const isStepProgressStatus = (
    value: unknown,
): value is 'in_progress' | 'complete' | 'error' =>
    value === 'in_progress' || value === 'complete' || value === 'error';

export const getStepProgressFromChunk = (
    chunk: UIMessageChunk,
): {
    message: string;
    toolName: string | null;
    progressId: string | null;
    progressStatus: 'in_progress' | 'complete' | 'error' | null;
} | null => {
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
                progressId:
                    typeof data.progressId === 'string'
                        ? data.progressId
                        : null,
                progressStatus: isStepProgressStatus(data.progressStatus)
                    ? data.progressStatus
                    : null,
            };
        }
    }

    return null;
};

const FIRST_TOKEN_CHUNK_TYPES = new Set<UIMessageChunk['type']>([
    'text-start',
    'text-delta',
    'reasoning-start',
    'reasoning-delta',
    'tool-input-start',
    'tool-input-available',
]);

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
            enableSqlMode,
            autoApproveSql = false,
            toolHints = [],
            onFinish,
            onError,
            onToolCall,
            onToolResult,
            refetchThread,
        }: AiAgentThreadStreamOptions) => {
            const abortController = new AbortController();
            setAbortController(threadUuid, abortController);
            let isRecovering = false;
            const beginRecovery = () => {
                if (isRecovering || abortController.signal.aborted) return;

                isRecovering = true;
                dispatch(markStreamRecovering({ threadUuid }));
                refetchThread();
                abortController.abort();
            };
            let inactivityMonitor: ReturnType<
                typeof createStreamInactivityMonitor
            > | null = null;

            try {
                dispatch(startStreaming({ threadUuid, messageUuid }));

                const response = await getAgentThreadReadableStream(
                    projectUuid,
                    agentUuid,
                    threadUuid,
                    enableSqlMode,
                    autoApproveSql,
                    toolHints,
                    {
                        signal: abortController.signal,
                    },
                );

                inactivityMonitor = createStreamInactivityMonitor({
                    onInactive: beginRecovery,
                });

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
                let receivedTerminalChunk = false;
                let receivedFirstToken = false;
                const handleStreamReadError = () => {
                    if (
                        !receivedTerminalChunk &&
                        !abortController.signal.aborted
                    ) {
                        beginRecovery();
                    }
                };

                const consumeRawChunks = (async () => {
                    while (true) {
                        const rawChunkResult = await readStreamResult(() =>
                            rawChunkReader.read(),
                        );
                        if (rawChunkResult.status === 'error') {
                            handleStreamReadError();
                            break;
                        }

                        const { done, value } = rawChunkResult.value;
                        if (done) {
                            break;
                        }

                        inactivityMonitor.reset();
                        if (value.type === 'finish') {
                            receivedTerminalChunk = true;
                        }
                        if (
                            !receivedFirstToken &&
                            FIRST_TOKEN_CHUNK_TYPES.has(value.type)
                        ) {
                            receivedFirstToken = true;
                            dispatch(markFirstToken({ threadUuid }));
                        }

                        const stepProgress = getStepProgressFromChunk(value);
                        if (stepProgress) {
                            dispatch(
                                appendStepProgress({
                                    threadUuid,
                                    message: stepProgress.message,
                                    toolName: stepProgress.toolName,
                                    progressId: stepProgress.progressId,
                                    progressStatus: stepProgress.progressStatus,
                                }),
                            );
                            continue;
                        }
                    }
                })();

                const uiMessageIterator = stream[Symbol.asyncIterator]();
                while (true) {
                    const uiMessageResult = await readStreamResult(() =>
                        uiMessageIterator.next(),
                    );
                    if (uiMessageResult.status === 'error') {
                        handleStreamReadError();
                        break;
                    }

                    const { done, value: uiMessage } = uiMessageResult.value;
                    if (done || abortController.signal.aborted) break;

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
                        if (abortController.signal.aborted) break;

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
                            case 'tool-findExplores':
                            case 'tool-findCustomChartTypes':
                            case 'tool-findFields':
                            case 'tool-grepFields':
                            case 'tool-getMetadata':
                            case 'tool-findDashboards':
                            case 'tool-findContent':
                            case 'tool-findCharts':
                            case 'tool-searchFieldValues':
                            case 'tool-generateVisualization':
                            case 'tool-runContentQuery':
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

                                        refetchThread();
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

                    if (abortController.signal.aborted) break;
                }

                await consumeRawChunks;
                if (abortController.signal.aborted) {
                    if (!isRecovering) {
                        dispatch(stopStreaming({ threadUuid }));
                    }
                    return;
                }

                if (!receivedTerminalChunk) {
                    beginRecovery();
                    return;
                }

                onFinish?.();
                dispatch(stopStreaming({ threadUuid }));
            } catch (error) {
                if (isRecovering) return;

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
            } finally {
                inactivityMonitor?.stop();
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
