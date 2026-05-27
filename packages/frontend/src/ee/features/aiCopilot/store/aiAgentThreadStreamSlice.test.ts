import { SHOULD_AUTOBATCH } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import {
    addReasoning,
    addMcpUnavailableNotice,
    addToolCall,
    aiAgentThreadStreamSlice,
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
    });
});
