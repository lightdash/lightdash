import { type AgentOnboardingRun } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import {
    useCancelAgentOnboardingRun,
    useStartAgentOnboardingRun,
} from './useAgentOnboarding';

const run: AgentOnboardingRun = {
    agentOnboardingRunUuid: 'run-uuid',
    projectUuid: 'project-uuid',
    status: 'queued',
    stage: null,
    events: [],
    handoff: null,
    usage: null,
    files: [],
    errorMessage: null,
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
};

const lightdashApi = vi.hoisted(() => vi.fn());

vi.mock('../../../../api', () => ({ lightdashApi }));

vi.mock('../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastApiError: vi.fn() }),
}));

const activeRunKey = ['agent-onboarding-active-run', 'project-uuid'];

const renderWithClient = <T,>(hook: () => T) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );

    return { queryClient, ...renderHook(hook, { wrapper }) };
};

describe('agent onboarding run mutations', () => {
    beforeEach(() => {
        lightdashApi.mockReset();
    });

    it('caches the started run as the active run so the step card resumes it', async () => {
        lightdashApi.mockResolvedValue(run);
        const { queryClient, result } = renderWithClient(
            useStartAgentOnboardingRun,
        );

        await result.current.mutateAsync('project-uuid');

        await waitFor(() =>
            expect(queryClient.getQueryData(activeRunKey)).toEqual(run),
        );
    });

    it('clears the active run when a run is cancelled', async () => {
        lightdashApi.mockResolvedValue({ ...run, status: 'cancelled' });
        const { queryClient, result } = renderWithClient(
            useCancelAgentOnboardingRun,
        );
        queryClient.setQueryData(activeRunKey, run);

        await result.current.mutateAsync({
            projectUuid: 'project-uuid',
            runUuid: 'run-uuid',
        });

        await waitFor(() =>
            expect(queryClient.getQueryData(activeRunKey)).toBeNull(),
        );
    });
});
