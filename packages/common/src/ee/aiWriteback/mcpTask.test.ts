import {
    aiWritebackRunStatusToMcpTaskStatus,
    getAiWritebackTaskStatusMessage,
} from './mcpTask';
import { AI_WRITEBACK_STAGES } from './types';

describe('aiWritebackRunStatusToMcpTaskStatus', () => {
    it('maps pending and every pipeline stage to working', () => {
        expect(aiWritebackRunStatusToMcpTaskStatus('pending')).toBe('working');
        AI_WRITEBACK_STAGES.forEach((stage) => {
            expect(aiWritebackRunStatusToMcpTaskStatus(stage)).toBe('working');
        });
    });

    it('maps terminal run statuses to terminal task statuses', () => {
        expect(aiWritebackRunStatusToMcpTaskStatus('ready')).toBe('completed');
        // A run error is a tool-level failure: completed with isError, never
        // the protocol-fault 'failed' status
        expect(aiWritebackRunStatusToMcpTaskStatus('error')).toBe('completed');
        expect(aiWritebackRunStatusToMcpTaskStatus('cancelled')).toBe(
            'cancelled',
        );
    });
});

describe('getAiWritebackTaskStatusMessage', () => {
    it('has a distinct message for every run status', () => {
        const statuses = [
            'pending',
            ...AI_WRITEBACK_STAGES,
            'ready',
            'error',
            'cancelled',
        ] as const;
        const messages = statuses.map(getAiWritebackTaskStatusMessage);
        expect(new Set(messages).size).toBe(statuses.length);
        messages.forEach((message) => {
            expect(message.length).toBeGreaterThan(0);
        });
    });
});
