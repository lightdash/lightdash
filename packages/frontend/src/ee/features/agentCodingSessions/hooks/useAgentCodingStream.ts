import type { AgentCodingStreamEvent } from '@lightdash/common';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BASE_API_URL } from '../../../../api';

interface ToolCall {
    toolName: string;
    toolUseId: string;
    input: string;
    isComplete: boolean;
}

export type StreamSegment =
    | { type: 'text'; content: string }
    | { type: 'tool'; tool: ToolCall };

export type { ToolCall };

interface UseAgentCodingStreamOptions {
    projectUuid: string;
    sessionUuid: string;
    enabled?: boolean; // Auto-connect when true
    onComplete?: () => void;
    onError?: (error: string) => void;
    onStreamEnd?: () => void;
    onToolStart?: (toolName: string, toolUseId: string) => void;
    onToolInputDelta?: (partialJson: string) => void;
    onToolEnd?: () => void;
}

interface UseAgentCodingStreamReturn {
    streamSegments: StreamSegment[];
    isStreaming: boolean;
    error: string | null;
    /** @deprecated Use streamSegments instead */
    streamedContent: string;
    /** @deprecated Use streamSegments instead */
    currentTool: ToolCall | null;
    toolHistory: ToolCall[];
}

// Reconnection settings
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

export const useAgentCodingStream = ({
    projectUuid,
    sessionUuid,
    enabled = false,
    onComplete,
    onError,
    onStreamEnd,
    onToolStart,
    onToolInputDelta,
    onToolEnd,
}: UseAgentCodingStreamOptions): UseAgentCodingStreamReturn => {
    const [streamSegments, setStreamSegments] = useState<StreamSegment[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [toolHistory, setToolHistory] = useState<ToolCall[]>();

    // Derived state for backwards compatibility
    const streamedContent = streamSegments
        .filter((s): s is { type: 'text'; content: string } => s.type === 'text')
        .map((s) => s.content)
        .join('');

    const lastSegment = streamSegments[streamSegments.length - 1];
    const currentTool =
        lastSegment?.type === 'tool' && !lastSegment.tool.isComplete
            ? lastSegment.tool
            : null;

    // Refs for reconnection support
    const lastEventIdRef = useRef<number>(0);
    const abortControllerRef = useRef<AbortController | null>(null);
    const reconnectAttemptRef = useRef<number>(0);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );

    // Use refs for callbacks to avoid dependency instability
    const callbacksRef = useRef({
        onComplete,
        onError,
        onStreamEnd,
        onToolStart,
        onToolInputDelta,
        onToolEnd,
    });

    // Update callback refs when they change
    useEffect(() => {
        callbacksRef.current = {
            onComplete,
            onError,
            onStreamEnd,
            onToolStart,
            onToolInputDelta,
            onToolEnd,
        };
    }, [
        onComplete,
        onError,
        onStreamEnd,
        onToolStart,
        onToolInputDelta,
        onToolEnd,
    ]);

    // Track session and enabled changes to reset state
    const prevSessionUuidRef = useRef<string>(sessionUuid);
    const prevEnabledRef = useRef<boolean>(enabled);

    // Reset state when sessionUuid changes or when enabled transitions false -> true
    // (i.e., starting to stream a new message)
    useEffect(() => {
        const sessionChanged = prevSessionUuidRef.current !== sessionUuid;
        const startingNewStream = !prevEnabledRef.current && enabled;

        if (sessionChanged || startingNewStream) {
            prevSessionUuidRef.current = sessionUuid;
            setStreamSegments([]);
            setError(null);
            setToolHistory([]);
            lastEventIdRef.current = 0;
            reconnectAttemptRef.current = 0;
        }

        prevEnabledRef.current = enabled;
    }, [sessionUuid, enabled]);

    const connect = useCallback(async () => {
        // Clean up any existing connection
        abortControllerRef.current?.abort();

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        setIsStreaming(true);
        setError(null);

        // eslint-disable-next-line no-console
        console.log('[AgentCodingStream] Connecting...', {
            projectUuid,
            sessionUuid,
            lastEventId: lastEventIdRef.current,
        });

        try {
            // Include lastEventId for reconnection support
            let url = `${BASE_API_URL}api/v1/projects/${projectUuid}/agent-coding-sessions/${sessionUuid}/stream`;
            if (lastEventIdRef.current > 0) {
                url += `?lastEventId=${lastEventIdRef.current}`;
            }

            const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                signal: abortController.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No reader available');
            }

            // Reset reconnect counter on successful connection
            reconnectAttemptRef.current = 0;

            // eslint-disable-next-line no-console
            console.log('[AgentCodingStream] Connected successfully');

            const decoder = new TextDecoder();
            let buffer = '';
            let eventCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    // Parse SSE id field for event ID tracking
                    if (line.startsWith('id: ')) {
                        const eventId = parseInt(line.slice(4), 10);
                        if (!isNaN(eventId)) {
                            lastEventIdRef.current = eventId;
                        }
                        continue;
                    }

                    if (line.startsWith('data: ')) {
                        const jsonStr = line.slice(6);
                        // Skip empty data (heartbeats send "data: {}")
                        if (jsonStr === '{}') {
                            continue;
                        }

                        try {
                            const eventData = JSON.parse(
                                jsonStr,
                            ) as AgentCodingStreamEvent;

                            eventCount += 1;
                            if (eventCount <= 5 || eventCount % 50 === 0) {
                                // eslint-disable-next-line no-console
                                console.log(
                                    `[AgentCodingStream] Event #${eventCount}:`,
                                    eventData.type,
                                    eventData.type === 'token'
                                        ? eventData.text?.slice(0, 50)
                                        : '',
                                );
                            }

                            switch (eventData.type) {
                                case 'token':
                                    setStreamSegments((prev) => {
                                        const last = prev[prev.length - 1];
                                        // If last segment is text, append to it
                                        if (last?.type === 'text') {
                                            const needsSpace =
                                                last.content.length > 0 &&
                                                /[.!?:]$/.test(last.content) &&
                                                /^[A-Z]/.test(eventData.text);
                                            const newContent = needsSpace
                                                ? `${last.content} ${eventData.text}`
                                                : last.content + eventData.text;
                                            const result = [
                                                ...prev.slice(0, -1),
                                                {
                                                    type: 'text' as const,
                                                    content: newContent,
                                                },
                                            ];
                                            // Debug: log segment updates
                                            if (prev.length === 0) {
                                                // eslint-disable-next-line no-console
                                                console.log(
                                                    '[AgentCodingStream] First segment created',
                                                    result.length,
                                                );
                                            }
                                            return result;
                                        }
                                        // Otherwise create new text segment
                                        const result = [
                                            ...prev,
                                            {
                                                type: 'text' as const,
                                                content: eventData.text,
                                            },
                                        ];
                                        // Debug: log new segment creation
                                        // eslint-disable-next-line no-console
                                        console.log(
                                            '[AgentCodingStream] New text segment, total:',
                                            result.length,
                                        );
                                        return result;
                                    });
                                    break;

                                case 'tool_start': {
                                    const newTool = {
                                        type: 'tool' as const,
                                        tool: {
                                            toolName: eventData.toolName,
                                            toolUseId: eventData.toolUseId,
                                            input: '',
                                            isComplete: false,
                                        },
                                    };
                                    setStreamSegments((prev) => {
                                        const last = prev[prev.length - 1];
                                        // If last segment is a completed tool, replace it
                                        // This collapses consecutive tool calls
                                        if (
                                            last?.type === 'tool' &&
                                            last.tool.isComplete
                                        ) {
                                            return [...prev.slice(0, -1), newTool];
                                        }
                                        return [...prev, newTool];
                                    });
                                    callbacksRef.current.onToolStart?.(
                                        eventData.toolName,
                                        eventData.toolUseId,
                                    );
                                    break;
                                }

                                case 'tool_input_delta':
                                    setStreamSegments((prev) => {
                                        const last = prev[prev.length - 1];
                                        if (last?.type === 'tool') {
                                            return [
                                                ...prev.slice(0, -1),
                                                {
                                                    type: 'tool',
                                                    tool: {
                                                        ...last.tool,
                                                        input:
                                                            last.tool.input +
                                                            eventData.partialJson,
                                                    },
                                                },
                                            ];
                                        }
                                        return prev;
                                    });
                                    callbacksRef.current.onToolInputDelta?.(
                                        eventData.partialJson,
                                    );
                                    break;

                                case 'tool_end':
                                    setStreamSegments((prev) => {
                                        const last = prev[prev.length - 1];
                                        if (last?.type === 'tool') {
                                            const completedTool = {
                                                ...last.tool,
                                                isComplete: true,
                                            };
                                            setToolHistory((history) => [
                                                ...(history ?? []),
                                                completedTool,
                                            ]);
                                            return [
                                                ...prev.slice(0, -1),
                                                { type: 'tool', tool: completedTool },
                                            ];
                                        }
                                        return prev;
                                    });
                                    callbacksRef.current.onToolEnd?.();
                                    break;

                                case 'error':
                                    setError(eventData.error);
                                    callbacksRef.current.onError?.(
                                        eventData.error,
                                    );
                                    break;

                                case 'complete':
                                    callbacksRef.current.onComplete?.();
                                    break;

                                case 'status':
                                    // Status updates are informational
                                    break;

                                default:
                                    // Unknown event type - log for debugging
                                    // eslint-disable-next-line no-console
                                    console.warn(
                                        '[AgentCodingStream] Unknown event type:',
                                        eventData,
                                    );
                            }
                        } catch (parseError) {
                            // Log parse errors for debugging (but don't break the stream)
                            // eslint-disable-next-line no-console
                            console.warn(
                                '[AgentCodingStream] Failed to parse event:',
                                jsonStr,
                                parseError,
                            );
                        }
                    }
                }
            }

            // Stream ended normally (session complete or no more events)
            // eslint-disable-next-line no-console
            console.log('[AgentCodingStream] Stream ended normally', {
                totalEvents: eventCount,
            });
            // Only update state if this is still the active connection
            if (abortControllerRef.current === abortController) {
                setIsStreaming(false);
                callbacksRef.current.onStreamEnd?.();
            }
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                // Check if this connection was replaced by a new one
                // If so, don't set isStreaming to false (the new connection handles that)
                if (abortControllerRef.current !== abortController) {
                    // This connection was replaced, don't touch state
                    return;
                }
                // User cancelled - not an error, don't trigger reconnect
                setIsStreaming(false);
                return;
            }

            // Only update state if this is still the active connection
            if (abortControllerRef.current !== abortController) {
                return;
            }

            const errorMessage =
                err instanceof Error ? err.message : 'Stream error';
            setError(errorMessage);
            callbacksRef.current.onError?.(errorMessage);
            setIsStreaming(false);

            // Attempt reconnection with exponential backoff
            if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.min(
                    BASE_RECONNECT_DELAY_MS *
                        Math.pow(2, reconnectAttemptRef.current),
                    MAX_RECONNECT_DELAY_MS,
                );
                reconnectAttemptRef.current += 1;

                reconnectTimeoutRef.current = setTimeout(() => {
                    void connect();
                }, delay);
            }
        }
    }, [projectUuid, sessionUuid]);

    const disconnect = useCallback(() => {
        // Clear any pending reconnect
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        reconnectAttemptRef.current = MAX_RECONNECT_ATTEMPTS; // Prevent auto-reconnect

        // Abort current connection
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
    }, []);

    // Auto-connect/disconnect based on `enabled` prop
    useEffect(() => {
        // eslint-disable-next-line no-console
        console.log('[AgentCodingStream] Auto-connect effect', {
            enabled,
            sessionUuid,
        });
        if (enabled) {
            void connect();
        } else {
            disconnect();
        }

        return () => {
            disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    return {
        streamSegments,
        streamedContent,
        isStreaming,
        error,
        currentTool,
        toolHistory: toolHistory ?? [],
    };
};
