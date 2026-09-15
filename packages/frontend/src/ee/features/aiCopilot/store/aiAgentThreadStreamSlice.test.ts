import { SHOULD_AUTOBATCH } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import {
    addReasoning,
    addToolCall,
    aiAgentThreadStreamSlice,
    appendStepProgress,
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
        expect(
            appendStepProgress({
                threadUuid: 'thread-1',
                message: 'Running your query...',
                toolName: null,
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

    it('appends each progress message to the timeline in order', () => {
        const startedState = aiAgentThreadStreamSlice.reducer(
            undefined,
            startStreaming({
                threadUuid: 'thread-1',
                messageUuid: 'message-1',
            }),
        );
        expect(startedState['thread-1']?.stepProgressMessages).toEqual([]);

        const afterFirst = aiAgentThreadStreamSlice.reducer(
            startedState,
            appendStepProgress({
                threadUuid: 'thread-1',
                message: 'Starting sandbox...',
                toolName: 'editDbtProject',
            }),
        );
        const afterSecond = aiAgentThreadStreamSlice.reducer(
            afterFirst,
            appendStepProgress({
                threadUuid: 'thread-1',
                message: 'Cloning project...',
                toolName: 'editDbtProject',
            }),
        );
        expect(afterSecond['thread-1']?.stepProgressMessages).toEqual([
            {
                message: 'Starting sandbox...',
                toolName: 'editDbtProject',
                progressId: null,
                progressStatus: null,
            },
            {
                message: 'Cloning project...',
                toolName: 'editDbtProject',
                progressId: null,
                progressStatus: null,
            },
        ]);
    });

    it('drops adjacent duplicate progress messages from the same tool', () => {
        const seeded = aiAgentThreadStreamSlice.reducer(
            aiAgentThreadStreamSlice.reducer(
                undefined,
                startStreaming({
                    threadUuid: 'thread-1',
                    messageUuid: 'message-1',
                }),
            ),
            appendStepProgress({
                threadUuid: 'thread-1',
                message: 'Running your query...',
                toolName: 'runQuery',
            }),
        );
        const afterDuplicate = aiAgentThreadStreamSlice.reducer(
            seeded,
            appendStepProgress({
                threadUuid: 'thread-1',
                message: 'Running your query...',
                toolName: 'runQuery',
            }),
        );
        expect(afterDuplicate['thread-1']?.stepProgressMessages).toEqual([
            {
                message: 'Running your query...',
                toolName: 'runQuery',
                progressId: null,
                progressStatus: null,
            },
        ]);
    });

    it('keeps an adjacent same-message event from a different tool', () => {
        // The same string emitted by two different tools is not a true
        // duplicate — scoping the inline row by toolName depends on both
        // entries surviving.
        let state = aiAgentThreadStreamSlice.reducer(
            undefined,
            startStreaming({
                threadUuid: 'thread-1',
                messageUuid: 'message-1',
            }),
        );
        for (const event of [
            { message: 'Discovering models', toolName: 'editDbtProject' },
            { message: 'Discovering models', toolName: 'findExplores' },
        ]) {
            state = aiAgentThreadStreamSlice.reducer(
                state,
                appendStepProgress({ threadUuid: 'thread-1', ...event }),
            );
        }
        expect(state['thread-1']?.stepProgressMessages).toEqual([
            {
                message: 'Discovering models',
                toolName: 'editDbtProject',
                progressId: null,
                progressStatus: null,
            },
            {
                message: 'Discovering models',
                toolName: 'findExplores',
                progressId: null,
                progressStatus: null,
            },
        ]);
    });

    it('keeps non-adjacent duplicate progress messages', () => {
        let state = aiAgentThreadStreamSlice.reducer(
            undefined,
            startStreaming({
                threadUuid: 'thread-1',
                messageUuid: 'message-1',
            }),
        );
        for (const message of [
            'Running your query...',
            'Editing models',
            'Running your query...',
        ]) {
            state = aiAgentThreadStreamSlice.reducer(
                state,
                appendStepProgress({
                    threadUuid: 'thread-1',
                    message,
                    toolName: 'runQuery',
                }),
            );
        }
        expect(state['thread-1']?.stepProgressMessages).toEqual([
            {
                message: 'Running your query...',
                toolName: 'runQuery',
                progressId: null,
                progressStatus: null,
            },
            {
                message: 'Editing models',
                toolName: 'runQuery',
                progressId: null,
                progressStatus: null,
            },
            {
                message: 'Running your query...',
                toolName: 'runQuery',
                progressId: null,
                progressStatus: null,
            },
        ]);
    });

    it('keeps per-node composer status transitions with the same progressId', () => {
        // A node's running → complete transition reuses the progressId; the
        // status change makes it a distinct event, so both entries survive
        // and the UI can take the latest per node.
        let state = aiAgentThreadStreamSlice.reducer(
            undefined,
            startStreaming({
                threadUuid: 'thread-1',
                messageUuid: 'message-1',
            }),
        );
        for (const event of [
            {
                message: 'Running query "orders"...',
                progressStatus: 'in_progress' as const,
            },
            {
                message: 'Query "orders" complete',
                progressStatus: 'complete' as const,
            },
        ]) {
            state = aiAgentThreadStreamSlice.reducer(
                state,
                appendStepProgress({
                    threadUuid: 'thread-1',
                    toolName: 'runComposerQueries',
                    progressId: 'call-1:orders',
                    ...event,
                }),
            );
        }
        expect(state['thread-1']?.stepProgressMessages).toEqual([
            {
                message: 'Running query "orders"...',
                toolName: 'runComposerQueries',
                progressId: 'call-1:orders',
                progressStatus: 'in_progress',
            },
            {
                message: 'Query "orders" complete',
                toolName: 'runComposerQueries',
                progressId: 'call-1:orders',
                progressStatus: 'complete',
            },
        ]);
    });

    it('does not clear progress history when answer text lands', () => {
        // History persists across the rest of the stream so the timeline
        // stays visible even after the model starts narrating the answer.
        const seeded = aiAgentThreadStreamSlice.reducer(
            aiAgentThreadStreamSlice.reducer(
                undefined,
                startStreaming({
                    threadUuid: 'thread-1',
                    messageUuid: 'message-1',
                }),
            ),
            appendStepProgress({
                threadUuid: 'thread-1',
                message: 'Committing changes',
                toolName: 'editDbtProject',
            }),
        );
        const afterText = aiAgentThreadStreamSlice.reducer(
            seeded,
            setMessage({
                threadUuid: 'thread-1',
                content: 'Pull request is open',
            }),
        );
        expect(afterText['thread-1']?.stepProgressMessages).toEqual([
            {
                message: 'Committing changes',
                toolName: 'editDbtProject',
                progressId: null,
                progressStatus: null,
            },
        ]);
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
