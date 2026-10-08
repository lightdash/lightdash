import {
    AiAccessRefusalAction,
    AiAccessRefusalReason,
    type AiAccessRefusal,
    type AiAgentSummary,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { LauncherPanel } from './LauncherPanel';

const state = vi.hoisted(() => ({
    refusal: null as AiAccessRefusal | null,
    isLoading: false,
    submit: vi.fn(),
    login: vi.fn(),
}));
vi.mock('../../../../../features/aiAccess/api', () => ({
    useMyAiAccess: () => ({
        data: { refusal: state.refusal },
        isLoading: state.isLoading,
        isFetching: false,
        isAccessRequired: true,
    }),
}));
vi.mock('../../../../../hooks/useSnowflake', () => ({
    useSnowflakeAiLoginPopup: () => ({
        mutate: state.login,
        isLoading: false,
        error: null,
    }),
}));
vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: false } }),
}));
vi.mock('../../hooks/useAgentSuggestions', () => ({
    useAgentSuggestions: () => ({ data: undefined }),
}));
vi.mock('../../hooks/useDeepResearchAccess', () => ({
    useDeepResearchAccess: () => false,
}));
vi.mock('../../hooks/useAiAgentSqlModeAvailable', () => ({
    useAiAgentSqlModeAvailable: () => false,
}));
vi.mock('../../hooks/useDeepResearch', () => ({
    useHasActiveDeepResearchRun: () => false,
    useStartDeepResearchForThreadMutation: () => ({ mutateAsync: vi.fn() }),
    useStartDeepResearchMutation: () => ({ mutateAsync: vi.fn() }),
    useTrackDeepResearchFollowUp: () => vi.fn(),
}));
vi.mock('../../hooks/usePinnedContext', () => ({
    usePinnedContext: () => ({
        contextInput: [],
        previewItems: [],
        contentMentionItems: [],
        isReady: true,
    }),
}));
vi.mock('../../hooks/useDashboardPageContextCuration', () => ({
    useDashboardPageContextCuration: () => ({
        curateContext: (context: unknown) => context,
        recordSubmittedContext: vi.fn(),
    }),
}));
vi.mock('../../hooks/useRefreshDocumentOnAgentSave', () => ({
    useRefreshDocumentOnAgentSave: () => vi.fn(),
}));
vi.mock('../../hooks/usePendingThreadRefetch', () => ({
    usePendingThreadRefetch: () => ({
        isStreaming: false,
        isThreadPending: false,
    }),
}));
vi.mock('../../hooks/useProjectAiAgents', () => ({
    useProjectAiAgent: () => ({ data: undefined }),
    useCreateAiAgentThreadMessageSteerMutation: () => ({
        mutateAsync: vi.fn(),
    }),
    useInterruptAiAgentThreadMessageMutation: () => ({ mutateAsync: vi.fn() }),
    useCreateAgentThreadMutation: () => ({
        mutateAsync: state.submit,
        isLoading: false,
    }),
    useCreateAgentThreadMessageMutation: () => ({
        mutateAsync: state.submit,
        isLoading: false,
    }),
    useAiAgentThread: () => ({
        data: {
            messages: [],
            user: { uuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce' },
        },
        isLoading: false,
        refetch: vi.fn(),
    }),
}));
vi.mock('./useLauncherDock', () => ({
    useLauncherDock: () => ({ addItem: vi.fn() }),
}));
vi.mock('./useAiAgentLauncherRouter', () => ({
    useAiAgentLauncherRouter: () => ({
        handleSubmit: state.submit,
        isLocked: false,
        isPickingAgent: false,
        sortedCandidates: [],
    }),
}));
vi.mock('./LauncherPanelFrame', () => ({
    LauncherPanelFrame: ({ children }: PropsWithChildren) => children,
}));
vi.mock('./PanelHeader', () => ({ PanelHeader: () => null }));
vi.mock('../AiAgentNewThreadMcpConnections', () => ({
    AiAgentNewThreadMcpConnections: () => null,
}));
vi.mock('../ChatElements/AgentChatDisplay', () => ({
    AgentChatDisplay: ({ children }: PropsWithChildren) => children,
}));

const agent = { uuid: 'agent-1', name: 'Data agent' } as AiAgentSummary;
const panel = (activeThreadId: string | null) => (
    <Provider store={store}>
        <MemoryRouter>
            <LauncherPanel
                projectUuid="project-1"
                agent={agent}
                agents={[agent]}
                activeThreadId={activeThreadId}
            />
        </MemoryRouter>
    </Provider>
);

describe('LauncherPanel AI access', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.isLoading = false;
        state.refusal = {
            code: 'ai_access_refused',
            reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
            action: AiAccessRefusalAction.SIGN_IN,
            message: 'Sign in to run agent queries.',
            settingsUrl: null,
        };
    });

    it.each([null, 'thread-1'])(
        'shows only a placeholder while loading for %s',
        (threadId) => {
            state.isLoading = true;
            renderWithProviders(panel(threadId));
            expect(
                screen.getByTestId('ai-access-placeholder'),
            ).toBeInTheDocument();
            expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Connect agent' }),
            ).not.toBeInTheDocument();
        },
    );

    it.each([null, 'thread-1'])(
        'gates the composer with an inline sign-in callout for %s',
        (threadId) => {
            renderWithProviders(panel(threadId));
            expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Send message' }),
            ).not.toBeInTheDocument();
            const signIn = screen.getByRole('button', {
                name: 'Connect agent',
            });
            expect(signIn).toBeEnabled();
            expect(
                screen.queryByRole('heading', {
                    name: 'Connect your agent to your warehouse',
                }),
            ).not.toBeInTheDocument();
            expect(state.submit).not.toHaveBeenCalled();
            fireEvent.click(signIn);
            expect(state.login).toHaveBeenCalled();
        },
    );

    it.each([null, 'thread-1'])(
        'restores the composer when the refusal clears for %s',
        async (threadId) => {
            const { rerender } = renderWithProviders(panel(threadId));
            state.refusal = null;
            rerender(panel(threadId));
            await waitFor(() =>
                expect(screen.getByRole('textbox')).toHaveAttribute(
                    'contenteditable',
                    'true',
                ),
            );
            expect(
                screen.queryByRole('button', {
                    name: 'Connect agent',
                }),
            ).not.toBeInTheDocument();
        },
    );
});
