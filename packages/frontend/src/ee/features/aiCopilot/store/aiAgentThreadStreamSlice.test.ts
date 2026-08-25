import { SHOULD_AUTOBATCH } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import {
    addReasoning,
    addToolCall,
    aiAgentThreadStreamSlice,
    markStreamPolling,
    markStreamRecovering,
    setError,
    setMessage,
    setParts,
    startStreaming,
    stopStreaming,
} from './aiAgentThreadStreamSlice';

describe('aiAgentThreadStreamSlice', () => {
    it('marks high-frequency stream updates for Redux auto-batching', () => {
        const expectedMeta = { [SHOULD_AUTOBATCH]: true };

        expect(
            setMessage({
                threadUuid: 'thread-1',
                content: 'hello',
            }).meta,
        ).toEqual(expectedMeta);
        expect(
            setParts({
                threadUuid: 'thread-1',
                parts: [{ type: 'text', text: 'hello' }],
            }).meta,
        ).toEqual(expectedMeta);
        expect(
            addToolCall({
                threadUuid: 'thread-1',
                toolCallId: 'tool-1',
                toolName: 'findExplores',
                toolArgs: { searchQuery: 'orders' },
                toolResult: null,
            }).meta,
        ).toEqual(expectedMeta);
        expect(
            addReasoning({
                threadUuid: 'thread-1',
                reasoningId: 'reasoning-1',
                text: 'thinking',
            }).meta,
        ).toEqual(expectedMeta);
    });

    it('tracks streaming connection recovery', () => {
        const streaming = aiAgentThreadStreamSlice.reducer(
            undefined,
            startStreaming({
                threadUuid: 'thread-1',
                messageUuid: 'message-1',
            }),
        );
        expect(streaming['thread-1']?.connection).toEqual({
            status: 'streaming',
        });

        const recovering = aiAgentThreadStreamSlice.reducer(
            streaming,
            markStreamRecovering({ threadUuid: 'thread-1' }),
        );
        expect(recovering['thread-1']?.connection).toEqual({
            status: 'recovering',
        });

        const polling = aiAgentThreadStreamSlice.reducer(
            recovering,
            markStreamPolling({ threadUuid: 'thread-1' }),
        );
        expect(polling['thread-1']?.connection).toEqual({
            status: 'polling',
        });

        const complete = aiAgentThreadStreamSlice.reducer(
            polling,
            stopStreaming({ threadUuid: 'thread-1' }),
        );
        expect(complete['thread-1']?.connection).toEqual({
            status: 'complete',
        });
    });

    it('keeps terminal stream errors in the connection state', () => {
        const streaming = aiAgentThreadStreamSlice.reducer(
            undefined,
            startStreaming({
                threadUuid: 'thread-1',
                messageUuid: 'message-1',
            }),
        );

        const failed = aiAgentThreadStreamSlice.reducer(
            streaming,
            setError({ threadUuid: 'thread-1', error: 'Failed to connect' }),
        );

        expect(failed['thread-1']?.connection).toEqual({
            status: 'error',
            error: 'Failed to connect',
        });
    });

    it('dedupes stream tool parts by toolCallId when setting parts', () => {
        const startedState = aiAgentThreadStreamSlice.reducer(
            undefined,
            startStreaming({
                threadUuid: 'thread-1',
                messageUuid: 'message-1',
            }),
        );

        const state = aiAgentThreadStreamSlice.reducer(
            startedState,
            setParts({
                threadUuid: 'thread-1',
                parts: [
                    { type: 'text', text: 'before' },
                    {
                        type: 'toolCall',
                        toolCallId: 'tool-1',
                        toolName: 'findExplores',
                        toolArgs: { searchQuery: 'orders' },
                        toolResult: null,
                    },
                    {
                        type: 'toolCall',
                        toolCallId: 'tool-1',
                        toolName: 'findExplores',
                        toolArgs: { searchQuery: 'orders' },
                        toolResult: {
                            result: '<searchResults />',
                            metadata: { status: 'success' },
                        },
                        isPreliminary: false,
                    },
                    { type: 'text', text: 'after' },
                ],
            }),
        );

        expect(state['thread-1']?.parts).toEqual([
            { type: 'text', text: 'before' },
            {
                type: 'toolCall',
                toolCallId: 'tool-1',
                toolName: 'findExplores',
                toolArgs: { searchQuery: 'orders' },
                toolResult: {
                    result: '<searchResults />',
                    metadata: { status: 'success' },
                },
                isPreliminary: false,
            },
            { type: 'text', text: 'after' },
        ]);
    });
});
