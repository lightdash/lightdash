import { type AiAgentSummary } from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { useAiAgentLauncherRouter } from './useAiAgentLauncherRouter';

vi.mock('../../hooks/useAiAgentRouterFlow', () => ({
    useAiAgentRouterFlow: () => ({
        confirmPick: vi.fn(),
        handleSubmit: vi.fn(),
        isLocked: false,
        isPickingAgent: false,
        isRouting: false,
        sortedCandidates: [],
    }),
}));

const agent: AiAgentSummary = {
    uuid: 'agent-1',
    name: 'Data agent',
    description: null,
    integrations: [],
    tags: null,
    projectUuid: 'project-1',
    organizationUuid: 'org-1',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    instruction: null,
    imageUrl: null,
    imageUrlSource: null,
    groupAccess: [],
    userAccess: [],
    userAccessDetails: [],
    spaceAccess: [],
    enableDataAccess: true,
    enableSelfImprovement: false,
    enableContentTools: true,
    enableUserContext: false,
    enableSqlMode: false,
    enableSqlAutoApproval: false,
    enableComposerQueries: false,
    adminOnly: false,
    modelConfig: null,
    providerCredentialUuid: null,
    version: 1,
    threadRetentionHours: null,
};
const setup = () => {
    const createThreadForAgent =
        vi.fn<
            Parameters<
                typeof useAiAgentLauncherRouter
            >[0]['createThreadForAgent']
        >();
    const { result } = renderHook(() =>
        useAiAgentLauncherRouter({
            agent,
            agents: [agent],
            contextInput: [],
            createThreadForAgent,
            isCreatingThread: false,
            isPinnedContextReady: true,
            previewItems: [],
            projectUuid: 'project-1',
        }),
    );
    return { result, createThreadForAgent };
};

test('concrete-agent launcher submission waits for creation and returns its result', async () => {
    const { result, createThreadForAgent } = setup();
    createThreadForAgent.mockResolvedValue({ uuid: 'created-thread' });
    await expect(
        result.current.handleSubmit({
            message: 'Recreate this chart',
            toolHints: [],
            context: [{ type: 'thread_image', fileUuid: 'image-1' }],
        }),
    ).resolves.toEqual({ uuid: 'created-thread' });
    expect(createThreadForAgent).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
            agentUuid: 'agent-1',
            context: [{ type: 'thread_image', fileUuid: 'image-1' }],
        }),
    );
});

test('concrete-agent launcher creation rejection reaches the composer', async () => {
    const { result, createThreadForAgent } = setup();
    createThreadForAgent.mockRejectedValue(new Error('Creation failed'));
    await expect(
        result.current.handleSubmit({
            message: 'Keep this draft',
            toolHints: [],
            context: [{ type: 'thread_image', fileUuid: 'image-1' }],
        }),
    ).rejects.toThrow('Creation failed');
});
