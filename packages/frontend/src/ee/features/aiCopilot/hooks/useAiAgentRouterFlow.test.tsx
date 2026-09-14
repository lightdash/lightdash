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
        candidates: [],
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

    it('uses the submitted thread operation for the routed agent', async () => {
        routePrompt.mockResolvedValue(routeResult('create_thread'));
        const defaultCreateThread = vi.fn();
        const submittedCreateThread = vi
            .fn()
            .mockResolvedValue({ uuid: 'thread-1' });
        const { result } = renderHook(() =>
            useAiAgentRouterFlow({
                agents: [],
                createThreadForAgent: defaultCreateThread,
                projectUuid: 'project-1',
            }),
        );

        await act(() =>
            result.current.handleSubmit({
                createThreadForAgent: submittedCreateThread,
                message: 'Investigate revenue',
                toolHints: [],
            }),
        );

        expect(submittedCreateThread).toHaveBeenCalledWith({
            agentUuid: 'agent-1',
            context: undefined,
            message: 'Investigate revenue',
            optimisticContext: undefined,
            toolHints: [],
        });
        expect(defaultCreateThread).not.toHaveBeenCalled();
    });

    it('retains the submitted operation while the user picks an agent', async () => {
        routePrompt.mockResolvedValue(routeResult('show_picker'));
        const submittedCreateThread = vi
            .fn()
            .mockResolvedValue({ uuid: 'thread-2' });
        const { result } = renderHook(() =>
            useAiAgentRouterFlow({
                agents: [],
                createThreadForAgent: vi.fn(),
                projectUuid: 'project-1',
            }),
        );

        await act(() =>
            result.current.handleSubmit({
                createThreadForAgent: submittedCreateThread,
                message: 'Investigate churn',
                toolHints: [],
            }),
        );
        act(() => result.current.confirmPick('agent-2'));

        await waitFor(() =>
            expect(submittedCreateThread).toHaveBeenCalledWith({
                agentUuid: 'agent-2',
                context: undefined,
                message: 'Investigate churn',
                optimisticContext: undefined,
                toolHints: [],
            }),
        );
    });
});
