import { describe, expect, it } from 'vitest';
import {
    addMcpUnavailableNotice,
    aiAgentThreadStreamSlice,
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
});
