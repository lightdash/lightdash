import {
    type AiAgentSummary,
    type AiPromptContext,
    type AiPromptContextInput,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { type useAiAgentRouterFlow } from '../../hooks/useAiAgentRouterFlow';
import {
    LAUNCHER_AUTO_AGENT,
    type LauncherSelectedAgent,
} from './launcherAgentSelection';
import { useAiAgentLauncherRouter } from './useAiAgentLauncherRouter';

type RouterFlow = ReturnType<typeof useAiAgentRouterFlow>;
type RouterFlowOptions = Parameters<typeof useAiAgentRouterFlow>[0];

const flow = vi.hoisted(() => ({
    handleSubmit: vi.fn(),
    options: undefined as RouterFlowOptions | undefined,
    phase: { kind: 'idle' } as RouterFlow['phase'],
}));

vi.mock('../../hooks/useAiAgentRouterFlow', () => ({
    useAiAgentRouterFlow: (options: RouterFlowOptions) => {
        flow.options = options;
        return {
            confirmPick: vi.fn(),
            handleSubmit: flow.handleSubmit,
            isLocked: false,
            isPickingAgent: flow.phase.kind === 'picker',
            isRouting: false,
            phase: flow.phase,
            sortedCandidates: [],
        };
    },
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
const imageContext: AiPromptContextInput = [
    { type: 'thread_image', fileUuid: 'image-1' },
];
const imageSnapshot: AiPromptContext = [
    {
        type: 'thread_image',
        fileUuid: 'image-1',
        fileName: 'chart.png',
        sizeBytes: 1024,
        mediaType: 'image/png',
        width: 800,
        height: 600,
    },
];

const setup = (selectedAgent: NonNullable<LauncherSelectedAgent> = agent) => {
    const createThreadForAgent =
        vi.fn<
            Parameters<
                typeof useAiAgentLauncherRouter
            >[0]['createThreadForAgent']
        >();
    const { result } = renderHook(() =>
        useAiAgentLauncherRouter({
            agent: selectedAgent,
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

beforeEach(() => {
    flow.handleSubmit.mockReset();
    flow.options = undefined;
    flow.phase = { kind: 'idle' };
});

test('concrete-agent launcher submission waits for creation and returns its result', async () => {
    const { result, createThreadForAgent } = setup();
    createThreadForAgent.mockResolvedValue({ uuid: 'created-thread' });
    await expect(
        result.current.handleSubmit({
            message: 'Recreate this chart',
            toolHints: [],
            context: imageContext,
        }),
    ).resolves.toEqual({ uuid: 'created-thread' });
    expect(createThreadForAgent).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
            agentUuid: 'agent-1',
            context: imageContext,
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
            context: imageContext,
        }),
    ).rejects.toThrow('Creation failed');
});

test('auto submission hands the images to the router flow and returns its outcome', async () => {
    const { result, createThreadForAgent } = setup(LAUNCHER_AUTO_AGENT);
    flow.handleSubmit.mockRejectedValue(new Error('Creation failed'));

    await expect(
        result.current.handleSubmit({
            message: 'Recreate this chart',
            toolHints: [],
            context: imageContext,
            optimisticContext: imageSnapshot,
        }),
    ).rejects.toThrow('Creation failed');

    expect(flow.handleSubmit).toHaveBeenCalledExactlyOnceWith({
        message: 'Recreate this chart',
        context: imageContext,
        optimisticContext: imageSnapshot,
        toolHints: [],
    });
    expect(createThreadForAgent).not.toHaveBeenCalled();
});

test('a routing failure sends the images to the fallback agent once and reports a failed creation', async () => {
    const { createThreadForAgent } = setup(LAUNCHER_AUTO_AGENT);
    createThreadForAgent.mockRejectedValue(new Error('Creation failed'));

    await expect(
        flow.options?.onRouteError?.({
            fallbackAgent: agent,
            message: 'Recreate this chart',
            context: imageContext,
            optimisticContext: imageSnapshot,
            toolHints: [],
        }),
    ).rejects.toThrow('Creation failed');

    expect(createThreadForAgent).toHaveBeenCalledExactlyOnceWith({
        agentUuid: 'agent-1',
        message: 'Recreate this chart',
        context: imageContext,
        optimisticContext: imageSnapshot,
        toolHints: [],
    });
});

test('the message waiting for a pick exposes its held images', () => {
    flow.phase = {
        kind: 'picker',
        context: imageContext,
        decision: {
            decision: {
                candidates: [],
                confidence: 'low',
                decisionUuid: 'decision-1',
                reasoning: 'Could not decide',
                suggestedAgentUuid: 'agent-1',
            },
            nextAction: 'show_picker',
        },
        optimisticContext: [
            {
                type: 'dashboard',
                dashboardUuid: 'dash-1',
                dashboardSlug: null,
                pinnedVersionUuid: null,
                displayName: 'Sales',
                runtimeOverrides: null,
            },
            ...imageSnapshot,
        ],
        prompt: 'Recreate this chart',
        toolHints: [],
    };
    const { result } = setup(LAUNCHER_AUTO_AGENT);

    expect(result.current.waitingPrompt).toBe('Recreate this chart');
    expect(result.current.waitingImages).toEqual(imageSnapshot);
});
