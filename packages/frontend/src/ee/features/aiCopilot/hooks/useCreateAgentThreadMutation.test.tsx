import {
    QueryClient,
    QueryClientProvider,
    useQuery,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import type * as ReactRouter from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { useCreateAgentThreadMutation } from './useProjectAiAgents';

const { streamMessage, navigate, lightdashApi } = vi.hoisted(() => ({
    streamMessage: vi.fn(),
    navigate: vi.fn(),
    lightdashApi: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useNavigate: () => navigate,
}));
vi.mock('../../../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => lightdashApi,
}));
vi.mock('../../../../providers/App/useApp', () => ({
    default: () => ({ user: { data: { userUuid: 'user-1' } } }),
}));
vi.mock('../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastApiError: vi.fn() }),
}));
// Embed mode skips title generation and the notification permission prompt
vi.mock('../../../providers/Embed/useIsEmbedded', () => ({
    default: () => true,
}));
vi.mock('../streaming/useAiAgentThreadStreamMutation', () => ({
    useAiAgentThreadStreamMutation: () => ({ streamMessage }),
}));

describe('useCreateAgentThreadMutation', () => {
    it('starts the stream and navigates while the sidebar list is still refetching', async () => {
        lightdashApi.mockResolvedValue({
            uuid: 'thread-1',
            agentUuid: 'agent-1',
            firstMessage: { uuid: 'message-1', message: 'Hi' },
        });
        const queryClient = new QueryClient();
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
        let sidebarFetches = 0;
        const { result } = renderHook(
            () => {
                // Sidebar list: first load resolves, any refetch never does
                const sidebar = useQuery({
                    queryKey: ['aiAgents', 'project-1', 'project-threads', {}],
                    queryFn: () =>
                        sidebarFetches++ === 0
                            ? Promise.resolve([])
                            : new Promise<never>(() => {}),
                });
                return {
                    sidebar,
                    mutation: useCreateAgentThreadMutation('project-1'),
                };
            },
            { wrapper },
        );
        await waitFor(() =>
            expect(result.current.sidebar.isSuccess).toBe(true),
        );

        act(() => {
            result.current.mutation.mutate({
                agentUuid: 'agent-1',
                prompt: 'Hi',
            });
        });

        await waitFor(() => expect(streamMessage).toHaveBeenCalledTimes(1));
        expect(navigate).toHaveBeenCalledWith(
            expect.stringContaining('/agent-1/threads/thread-1'),
            expect.anything(),
        );
        expect(sidebarFetches).toBe(2);
    });
});
