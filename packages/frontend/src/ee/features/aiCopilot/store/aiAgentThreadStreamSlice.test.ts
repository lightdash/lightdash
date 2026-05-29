import { SHOULD_AUTOBATCH } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import {
    addReasoning,
    addMcpUnavailableNotice,
    addToolCall,
    aiAgentThreadStreamSlice,
    appendStepProgress,
    setMessage,
    setParts,
    startStreaming,
} from './aiAgentThreadStreamSlice';

describe('aiAgentThreadStreamSlice', () => {
    it('stores MCP unavailable notices once per server for the active stream', () => {
        const startedState = aiAgentThreadStreamSlice.reducer(
            undefined,
            startStreaming({
                threadUuid: 'thread-1',
                messageUuid: 'message-1',
            }),
        );

        const stateWithNotice = aiAgentThreadStreamSlice.reducer(
            startedState,
            addMcpUnavailableNotice({
                threadUuid: 'thread-1',
                notice: {
                    serverUuid: 'server-1',
                    serverName: 'Docs MCP',
                    message: 'Connection refused',
                    status: 'error',
                },
            }),
        );

        const dedupedState = aiAgentThreadStreamSlice.reducer(
            stateWithNotice,
            addMcpUnavailableNotice({
                threadUuid: 'thread-1',
                notice: {
                    serverUuid: 'server-1',
                    serverName: 'Docs MCP',
                    message: 'Connection refused',
                    status: 'error',
                },
            }),
        );

        expect(dedupedState['thread-1']?.mcpUnavailableNotices ?? []).toEqual([
            {
                serverUuid: 'server-1',
                serverName: 'Docs MCP',
                message: 'Connection refused',
                status: 'error',
            },
        ]);
    });

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
                toolArgs: {},
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
            addMcpUnavailableNotice({
                threadUuid: 'thread-1',
                notice: {
                    serverUuid: 'server-1',
                    serverName: 'Docs MCP',
                    message: 'Connection refused',
                    status: 'error',
                },
            }).meta,
        ).toEqual(expectedMeta);
        expect(
            appendStepProgress({
                threadUuid: 'thread-1',
                message: 'Running your query...',
            }).meta,
        ).toEqual(expectedMeta);
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
            }),
        );
        const afterSecond = aiAgentThreadStreamSlice.reducer(
            afterFirst,
            appendStepProgress({
                threadUuid: 'thread-1',
                message: 'Cloning project...',
            }),
        );
        expect(afterSecond['thread-1']?.stepProgressMessages).toEqual([
            'Starting sandbox...',
            'Cloning project...',
        ]);
    });

    it('drops adjacent duplicate progress messages', () => {
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
            }),
        );
        const afterDuplicate = aiAgentThreadStreamSlice.reducer(
            seeded,
            appendStepProgress({
                threadUuid: 'thread-1',
                message: 'Running your query...',
            }),
        );
        expect(afterDuplicate['thread-1']?.stepProgressMessages).toEqual([
            'Running your query...',
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
                appendStepProgress({ threadUuid: 'thread-1', message }),
            );
        }
        expect(state['thread-1']?.stepProgressMessages).toEqual([
            'Running your query...',
            'Editing models',
            'Running your query...',
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
            'Committing changes',
        ]);
    });
});
