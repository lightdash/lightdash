import { type AiRouterRouteResponseResult } from '@lightdash/common';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiAgentRouterFlow } from './useAiAgentRouterFlow';

const { commitDecision, routePrompt } = vi.hoisted(() => ({
    commitDecision: vi.fn(),
    routePrompt: vi.fn(),
}));

vi.mock('./useAiRouter', () => ({
    useAiRouterCommit: () => ({ mutate: commitDecision }),
    useAiRouterRoute: () => ({ mutateAsync: routePrompt }),
}));

const routeResult = (
    nextAction: AiRouterRouteResponseResult['nextAction'],
): AiRouterRouteResponseResult => ({
    decision: {
        candidates: [
            {
                agentUuid: 'agent-1',
                description: 'First agent',
                name: 'Agent one',
            },
            {
                agentUuid: 'agent-2',
                description: 'Second agent',
                name: 'Agent two',
            },
        ],
        confidence: nextAction === 'create_thread' ? 'high' : 'low',
        decisionUuid: 'decision-1',
        reasoning: 'Best match',
        suggestedAgentUuid: 'agent-1',
    },
    nextAction,
});

describe('useAiAgentRouterFlow', () => {
    beforeEach(() => {
        commitDecision.mockReset();
        routePrompt.mockReset();
    });

    it('passes the submission payload to an automatically selected agent', async () => {
        routePrompt.mockResolvedValue(routeResult('create_thread'));
        const createThreadForAgent = vi
            .fn()
            .mockResolvedValue({ uuid: 'thread-1' });
        const { result } = renderHook(() =>
            useAiAgentRouterFlow<{ kind: 'deep_research' }>({
                agents: [],
                createThreadForAgent,
                projectUuid: 'project-1',
            }),
        );

        await act(() =>
            result.current.handleSubmit({
                message: 'Investigate revenue',
                payload: { kind: 'deep_research' },
                toolHints: [],
            }),
        );

        expect(createThreadForAgent).toHaveBeenCalledWith({
            agentUuid: 'agent-1',
            context: undefined,
            message: 'Investigate revenue',
            optimisticContext: undefined,
            payload: { kind: 'deep_research' },
            toolHints: [],
        });
        expect(commitDecision).toHaveBeenCalledWith({
            chosenAgentUuid: 'agent-1',
            decisionUuid: 'decision-1',
            threadUuid: 'thread-1',
        });
    });

    it('retains the submission payload while the user picks an agent', async () => {
        routePrompt.mockResolvedValue(routeResult('show_picker'));
        const createThreadForAgent = vi
            .fn()
            .mockResolvedValue({ uuid: 'thread-2' });
        const { result } = renderHook(() =>
            useAiAgentRouterFlow<{ kind: 'deep_research' }>({
                agents: [],
                createThreadForAgent,
                projectUuid: 'project-1',
            }),
        );

        await act(() =>
            result.current.handleSubmit({
                message: 'Investigate churn',
                payload: { kind: 'deep_research' },
                toolHints: [],
            }),
        );
        expect(result.current.isPickingAgent).toBe(true);

        act(() => result.current.confirmPick('agent-2'));

        await waitFor(() =>
            expect(createThreadForAgent).toHaveBeenCalledWith({
                agentUuid: 'agent-2',
                context: undefined,
                message: 'Investigate churn',
                optimisticContext: undefined,
                payload: { kind: 'deep_research' },
                toolHints: [],
            }),
        );
        expect(commitDecision).toHaveBeenCalledWith({
            chosenAgentUuid: 'agent-2',
            decisionUuid: 'decision-1',
            threadUuid: 'thread-2',
        });
    });

    it('passes the submission payload to route error recovery', async () => {
        routePrompt.mockRejectedValue(new Error('Routing failed'));
        const onRouteError = vi.fn();
        const { result } = renderHook(() =>
            useAiAgentRouterFlow<{ kind: 'deep_research' }>({
                agents: [],
                createThreadForAgent: vi.fn(),
                onRouteError,
                projectUuid: 'project-1',
            }),
        );

        await act(() =>
            result.current.handleSubmit({
                message: 'Investigate revenue',
                payload: { kind: 'deep_research' },
                toolHints: [],
            }),
        );

        expect(onRouteError).toHaveBeenCalledWith({
            context: undefined,
            fallbackAgent: undefined,
            message: 'Investigate revenue',
            optimisticContext: undefined,
            payload: { kind: 'deep_research' },
            toolHints: [],
        });
    });

    it('does not use route recovery when the selected operation fails', async () => {
        routePrompt.mockResolvedValue(routeResult('create_thread'));
        const operationError = new Error('Research failed to start');
        const onRouteError = vi.fn();
        const { result } = renderHook(() =>
            useAiAgentRouterFlow<{ kind: 'deep_research' }>({
                agents: [],
                createThreadForAgent: vi.fn().mockRejectedValue(operationError),
                onRouteError,
                projectUuid: 'project-1',
            }),
        );

        await expect(
            act(() =>
                result.current.handleSubmit({
                    message: 'Investigate revenue',
                    payload: { kind: 'deep_research' },
                    toolHints: [],
                }),
            ),
        ).rejects.toThrow(operationError);

        expect(onRouteError).not.toHaveBeenCalled();
        expect(result.current.isLocked).toBe(false);
    });

    it('awaits route error recovery failures', async () => {
        routePrompt.mockRejectedValue(new Error('Routing failed'));
        const recoveryError = new Error('Fallback failed');
        const { result } = renderHook(() =>
            useAiAgentRouterFlow<{ kind: 'deep_research' }>({
                agents: [],
                createThreadForAgent: vi.fn(),
                onRouteError: vi.fn().mockRejectedValue(recoveryError),
                projectUuid: 'project-1',
            }),
        );

        await expect(
            act(() =>
                result.current.handleSubmit({
                    message: 'Investigate revenue',
                    payload: { kind: 'deep_research' },
                    toolHints: [],
                }),
            ),
        ).rejects.toThrow(recoveryError);
    });

    it('returns to the picker when the selected operation fails', async () => {
        routePrompt.mockResolvedValue(routeResult('show_picker'));
        const createThreadForAgent = vi
            .fn()
            .mockRejectedValue(new Error('Research failed to start'));
        const { result } = renderHook(() =>
            useAiAgentRouterFlow<{ kind: 'deep_research' }>({
                agents: [],
                createThreadForAgent,
                projectUuid: 'project-1',
            }),
        );

        await act(() =>
            result.current.handleSubmit({
                message: 'Investigate churn',
                payload: { kind: 'deep_research' },
                toolHints: [],
            }),
        );
        act(() => result.current.confirmPick('agent-2'));

        await waitFor(() => expect(result.current.isPickingAgent).toBe(true));
        expect(createThreadForAgent).toHaveBeenCalledTimes(1);
    });
});
