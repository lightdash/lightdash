import {
    type AiAgentSummary,
    type AiPromptContext,
    type AiPromptContextInput,
} from '@lightdash/common';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LAUNCHER_AUTO_AGENT } from './launcherAgentSelection';
import { useAiAgentLauncherRouter } from './useAiAgentLauncherRouter';

type LauncherRouterPayload = { kind: 'chat' } | { kind: 'deep_research' };

type RoutedArgs = {
    agentUuid: string;
    context?: AiPromptContextInput;
    message: string;
    optimisticContext?: AiPromptContext;
    payload: LauncherRouterPayload;
    toolHints: string[];
};

type RouteErrorArgs = Omit<RoutedArgs, 'agentUuid'> & {
    fallbackAgent?: AiAgentSummary;
};

const routerMocks = vi.hoisted(() => ({
    confirmPick: vi.fn(),
    handleRouterSubmit: vi.fn(),
}));

let createRoutedThread:
    | ((args: RoutedArgs) => Promise<{ uuid: string }>)
    | null;
let handleRouteError: ((args: RouteErrorArgs) => void | Promise<void>) | null;

vi.mock('../../hooks/useAiAgentRouterFlow', () => ({
    useAiAgentRouterFlow: ({
        createThreadForAgent,
        onRouteError,
    }: {
        createThreadForAgent: (args: RoutedArgs) => Promise<{ uuid: string }>;
        onRouteError: (args: RouteErrorArgs) => void | Promise<void>;
    }) => {
        createRoutedThread = createThreadForAgent;
        handleRouteError = onRouteError;
        return {
            confirmPick: routerMocks.confirmPick,
            handleSubmit: routerMocks.handleRouterSubmit,
            isLocked: false,
            isPickingAgent: false,
            isRouting: false,
            sortedCandidates: [],
        };
    },
}));

const agent = {
    adminOnly: false,
    createdAt: new Date('2026-08-25T10:00:00.000Z'),
    description: 'Revenue specialist',
    enableContentTools: true,
    enableDataAccess: true,
    enableSelfImprovement: true,
    enableSqlMode: true,
    enableUserContext: true,
    groupAccess: [],
    imageUrl: null,
    imageUrlSource: null,
    instruction: null,
    integrations: [],
    modelConfig: null,
    name: 'Revenue agent',
    organizationUuid: 'organization-1',
    projectUuid: 'project-1',
    spaceAccess: [],
    tags: null,
    threadRetentionHours: null,
    updatedAt: new Date('2026-08-25T10:00:00.000Z'),
    userAccess: [],
    uuid: 'agent-1',
    version: 1,
} satisfies AiAgentSummary;

const renderLauncherRouter = (
    selectedAgent: AiAgentSummary | typeof LAUNCHER_AUTO_AGENT,
) => {
    const createDeepResearchForAgent = vi
        .fn()
        .mockResolvedValue({ uuid: 'research-thread' });
    const createThreadForAgent = vi
        .fn()
        .mockResolvedValue({ uuid: 'chat-thread' });
    const hook = renderHook(() =>
        useAiAgentLauncherRouter({
            agent: selectedAgent,
            agents: [agent],
            contextInput: [{ type: 'chart', chartUuid: 'chart-1' }],
            createDeepResearchForAgent,
            createThreadForAgent,
            isCreatingThread: false,
            isPinnedContextReady: true,
            previewItems: [],
            projectUuid: 'project-1',
        }),
    );

    return { createDeepResearchForAgent, createThreadForAgent, ...hook };
};

describe('useAiAgentLauncherRouter', () => {
    beforeEach(() => {
        createRoutedThread = null;
        handleRouteError = null;
        routerMocks.confirmPick.mockReset();
        routerMocks.handleRouterSubmit.mockReset();
    });

    it('routes Deep Research when Auto is selected', async () => {
        const { result } = renderLauncherRouter(LAUNCHER_AUTO_AGENT);

        await act(() =>
            result.current.handleStartDeepResearch({
                question: 'Investigate revenue',
            }),
        );

        expect(routerMocks.handleRouterSubmit).toHaveBeenCalledWith({
            context: [{ type: 'chart', chartUuid: 'chart-1' }],
            message: 'Investigate revenue',
            optimisticContext: [],
            payload: { kind: 'deep_research' },
            toolHints: [],
        });
    });

    it('starts Deep Research directly when an agent is selected', async () => {
        const { createDeepResearchForAgent, result } =
            renderLauncherRouter(agent);

        await act(() =>
            result.current.handleStartDeepResearch({
                question: 'Investigate revenue',
            }),
        );

        expect(createDeepResearchForAgent).toHaveBeenCalledWith({
            agentUuid: 'agent-1',
            context: [{ type: 'chart', chartUuid: 'chart-1' }],
            message: 'Investigate revenue',
            optimisticContext: [],
            toolHints: [],
        });
        expect(routerMocks.handleRouterSubmit).not.toHaveBeenCalled();
    });

    it('handles routed chat operation failures without rejecting', async () => {
        routerMocks.handleRouterSubmit.mockRejectedValue(
            new Error('Chat thread failed to start'),
        );
        const { result } = renderLauncherRouter(LAUNCHER_AUTO_AGENT);

        await act(() =>
            result.current.handleSubmit({
                message: 'What changed?',
                toolHints: [],
            }),
        );

        expect(routerMocks.handleRouterSubmit).toHaveBeenCalledWith({
            context: [{ type: 'chart', chartUuid: 'chart-1' }],
            message: 'What changed?',
            optimisticContext: undefined,
            payload: { kind: 'chat' },
            toolHints: [],
        });
    });

    it('runs the operation associated with the routed payload', async () => {
        const { createDeepResearchForAgent, createThreadForAgent } =
            renderLauncherRouter(LAUNCHER_AUTO_AGENT);
        expect(createRoutedThread).not.toBeNull();

        await createRoutedThread?.({
            agentUuid: 'agent-1',
            message: 'Research question',
            payload: { kind: 'deep_research' },
            toolHints: [],
        });
        await createRoutedThread?.({
            agentUuid: 'agent-1',
            message: 'Chat question',
            payload: { kind: 'chat' },
            toolHints: [],
        });

        expect(createDeepResearchForAgent).toHaveBeenCalledTimes(1);
        expect(createThreadForAgent).toHaveBeenCalledTimes(1);
    });

    it('starts Deep Research with the fallback agent after a route error', async () => {
        const { createDeepResearchForAgent } =
            renderLauncherRouter(LAUNCHER_AUTO_AGENT);
        expect(handleRouteError).not.toBeNull();

        await act(() =>
            Promise.resolve(
                handleRouteError?.({
                    fallbackAgent: agent,
                    message: 'Investigate revenue',
                    payload: { kind: 'deep_research' },
                    toolHints: [],
                }),
            ),
        );

        await waitFor(() =>
            expect(createDeepResearchForAgent).toHaveBeenCalledWith({
                agentUuid: 'agent-1',
                message: 'Investigate revenue',
                toolHints: [],
            }),
        );
    });
});
