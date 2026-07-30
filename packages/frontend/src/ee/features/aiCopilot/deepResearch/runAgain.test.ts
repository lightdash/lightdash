import { describe, expect, it, vi } from 'vitest';
import { runDeepResearchAgain } from './runAgain';
import { type DeepResearchRunRegistration } from './types';

const registration: DeepResearchRunRegistration = {
    runUuid: 'run-1',
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    threadUuid: 'thread-1',
    promptUuid: 'prompt-1',
    mcpServerUuids: ['mcp-1', 'mcp-2'],
    userUuid: 'user-1',
    question: 'Why did retention change?',
    depth: 'deep',
    createdAt: '2026-07-01T00:00:00.000Z',
    state: 'started',
};

describe('runDeepResearchAgain', () => {
    it('creates a fresh prompt before starting a separate run with the original configuration', async () => {
        const createPrompt = vi.fn().mockResolvedValue({ uuid: 'prompt-2' });
        const startRun = vi.fn().mockResolvedValue(undefined);

        await runDeepResearchAgain({
            registration,
            createPrompt,
            startRun,
        });

        expect(createPrompt).toHaveBeenCalledWith(registration.question);
        expect(startRun).toHaveBeenCalledWith({
            question: registration.question,
            depth: registration.depth,
            mcpServerUuids: registration.mcpServerUuids,
            promptUuid: 'prompt-2',
        });
        expect(createPrompt.mock.invocationCallOrder[0]).toBeLessThan(
            startRun.mock.invocationCallOrder[0],
        );
    });

    it('does not start a run when fresh prompt creation fails', async () => {
        const createPrompt = vi
            .fn()
            .mockRejectedValue(new Error('prompt failed'));
        const startRun = vi.fn();

        await expect(
            runDeepResearchAgain({
                registration,
                createPrompt,
                startRun,
            }),
        ).rejects.toThrow('prompt failed');
        expect(startRun).not.toHaveBeenCalled();
    });
});
