import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHomepageAiState } from './useHomepageAiState';

const state = vi.hoisted(() => ({
    isAiVisible: true,
    isCopilotEnabled: true,
    agents: [{ uuid: 'agent-1' }] as { uuid: string }[],
}));

vi.mock('../../aiCopilot/hooks/useAiAgentsButtonVisibility', () => ({
    useAiAgentButtonVisibility: () => state.isAiVisible,
}));

vi.mock('../../aiCopilot/hooks/useIsCopilotEnabled', () => ({
    useIsCopilotEnabled: () => ({
        isCopilotEnabled: state.isCopilotEnabled,
        isLoading: false,
    }),
}));

vi.mock('../../aiCopilot/hooks/useProjectAiAgents', () => ({
    useProjectAiAgents: () => ({
        data: state.agents,
        isInitialLoading: false,
    }),
}));

describe('useHomepageAiState', () => {
    beforeEach(() => {
        state.isAiVisible = true;
        state.isCopilotEnabled = true;
        state.agents = [{ uuid: 'agent-1' }];
    });

    it('leads with Ask AI when the project has an agent', () => {
        const { result } = renderHook(() => useHomepageAiState('project-1'));

        expect(result.current.canAskAi).toBe(true);
    });

    // Admins of an agent-less project keep AI *visible* so they can go create
    // one — that must not put an unanswerable composer on the homepage.
    it('drops the AI hero when no agent is configured, even while AI stays visible', () => {
        state.agents = [];
        const { result } = renderHook(() => useHomepageAiState('project-1'));

        expect(result.current.canAskAi).toBe(false);
    });

    it('drops the AI hero when the organization has no copilot at all', () => {
        state.agents = [];
        state.isCopilotEnabled = false;
        state.isAiVisible = false;
        const { result } = renderHook(() => useHomepageAiState('project-1'));

        expect(result.current.canAskAi).toBe(false);
    });
});
