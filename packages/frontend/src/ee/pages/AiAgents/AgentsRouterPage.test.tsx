import {
    type AiPromptContext,
    type AiPromptContextInput,
    type AiRouterRouteResponseResult,
} from '@lightdash/common';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type AgentChatInput } from '../../features/aiCopilot/components/ChatElements/AgentChatInput';
import { PendingPromptProvider } from '../../features/aiCopilot/components/PendingPromptContext/PendingPromptContext';
import { store } from '../../features/aiCopilot/store';
import AgentsRouterPage from './AgentsRouterPage';

const { composerProps, createThread, routePrompt, commitDecision } = vi.hoisted(
    () => ({
        composerProps:
            vi.fn<(props: ComponentProps<typeof AgentChatInput>) => void>(),
        createThread: vi.fn(),
        routePrompt: vi.fn(),
        commitDecision: vi.fn(),
    }),
);

vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));
vi.mock(
    '../../features/aiCopilot/components/ChatElements/AgentChatInput',
    () => ({
        AgentChatInput: (props: ComponentProps<typeof AgentChatInput>) => {
            composerProps(props);
            return <textarea placeholder={props.placeholder} />;
        },
    }),
);
vi.mock(
    '../../features/aiCopilot/components/AiAgentPageLayout/AiAgentPageLayout',
    () => ({
        AiAgentPageLayout: ({ children }: PropsWithChildren) => children,
    }),
);
vi.mock(
    '../../features/aiCopilot/components/AiAgentPageLayout/AgentSidebar',
    () => ({ AutoModeSidebar: () => null }),
);
vi.mock(
    '../../features/aiCopilot/components/AiAgentPageLayout/NewThreadButton',
    () => ({ NewThreadButton: () => null }),
);
vi.mock('../../features/aiCopilot/components/AgentSelector', () => ({
    AgentSettingsSelector: () => null,
}));
vi.mock(
    '../../features/aiCopilot/components/MyMemories/MyMemoriesModal',
    () => ({ MyMemoriesModal: () => null }),
);
vi.mock('../../features/aiCopilot/hooks/useAiAgentModelSelection', () => ({
    useAiAgentModelSelection: () => ({
        agentDefault: undefined,
        explicitModelConfig: undefined,
        extendedThinking: false,
        handleExtendedThinkingChange: vi.fn(),
        handleSelectedModelKeyChange: vi.fn(),
        modelOptions: [],
        selectedModelKey: undefined,
        showExtendedThinking: false,
    }),
}));
vi.mock('../../features/aiCopilot/hooks/useAiAgentPermission', () => ({
    useAiAgentPermission: () => false,
}));
vi.mock('../../features/aiCopilot/hooks/useAiAgentSqlModeAvailable', () => ({
    useAiAgentSqlModeAvailable: () => false,
}));
vi.mock('../../features/aiCopilot/hooks/useAiOrganizationSettings', () => ({
    useAiAgentMemoryEnabled: () => false,
}));
vi.mock('../../features/aiCopilot/hooks/useDeepResearch', () => ({
    useStartDeepResearchForThreadMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('../../features/aiCopilot/hooks/useDeepResearchAccess', () => ({
    useDeepResearchAccess: () => false,
}));
vi.mock('../../features/aiCopilot/hooks/usePinnedContext', () => ({
    usePinnedContext: () => ({
        contextInput: [],
        previewItems: [],
        contentMentionItems: [],
        isReady: true,
    }),
}));
vi.mock('../../features/aiCopilot/hooks/useProjectAiAgents', () => ({
    useCreateAgentThreadMutation: () => ({ mutateAsync: createThread }),
    useProjectAiAgents: () => ({
        data: [
            { uuid: 'agent-1', name: 'Data agent', enableSqlMode: false },
            { uuid: 'agent-2', name: 'Finance agent', enableSqlMode: false },
        ],
    }),
}));
vi.mock('../../features/aiCopilot/hooks/useAiRouter', () => ({
    useAiRouterCommit: () => ({ mutate: commitDecision }),
    useAiRouterRoute: () => ({ mutateAsync: routePrompt }),
}));

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

const pickerResult: AiRouterRouteResponseResult = {
    decision: {
        candidates: [
            { agentUuid: 'agent-1', name: 'Data agent', description: null },
            { agentUuid: 'agent-2', name: 'Finance agent', description: null },
        ],
        confidence: 'low',
        decisionUuid: 'decision-1',
        reasoning: 'Could not decide',
        suggestedAgentUuid: 'agent-1',
    },
    nextAction: 'show_picker',
};

const renderPage = () =>
    renderWithProviders(
        <Provider store={store}>
            <PendingPromptProvider>
                <MemoryRouter
                    initialEntries={['/projects/project-1/ai-agents']}
                >
                    <AgentsRouterPage />
                </MemoryRouter>
            </PendingPromptProvider>
        </Provider>,
    );

const latestComposerProps = () => {
    const props = composerProps.mock.lastCall?.[0];
    if (!props) throw new Error('The composer did not render');
    return props;
};

/** Submits an image-bearing message the way the composer does. */
const submitImageMessage = () => {
    const outcome = { settled: 'pending' };
    act(() => {
        void Promise.resolve(
            latestComposerProps().onSubmit({
                message: 'Recreate this chart',
                toolHints: [],
                context: imageContext,
                optimisticContext: imageSnapshot,
            }),
        ).then(
            () => {
                outcome.settled = 'resolved';
            },
            () => {
                outcome.settled = 'rejected';
            },
        );
    });
    return outcome;
};

describe('AgentsRouterPage image attachments', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        createThread.mockResolvedValue({ uuid: 'thread-1' });
    });

    it('lets images be attached while the router picks the agent', () => {
        renderPage();
        expect(
            latestComposerProps().imageAttachmentsUnavailableReason,
        ).toBeUndefined();
    });

    it('sends the held images to the agent the user picks, once', async () => {
        routePrompt.mockResolvedValue(pickerResult);
        renderPage();

        const outcome = submitImageMessage();
        const pick = await screen.findByRole('button', {
            name: 'Send to Finance agent',
        });
        expect(createThread).not.toHaveBeenCalled();
        expect(outcome.settled).toBe('pending');

        await userEvent.click(pick);

        await waitFor(() => expect(outcome.settled).toBe('resolved'));
        expect(createThread).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                agentUuid: 'agent-2',
                context: imageContext,
                optimisticContext: imageSnapshot,
                prompt: 'Recreate this chart',
            }),
        );
    });

    it('sends the images to the fallback agent when routing fails', async () => {
        routePrompt.mockRejectedValue(new Error('Router unavailable'));
        renderPage();

        const outcome = submitImageMessage();

        await waitFor(() => expect(outcome.settled).toBe('resolved'));
        expect(createThread).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                agentUuid: 'agent-1',
                context: imageContext,
                optimisticContext: imageSnapshot,
            }),
        );
    });

    it('hands the images back to the composer when the fallback conversation fails', async () => {
        routePrompt.mockRejectedValue(new Error('Router unavailable'));
        createThread.mockRejectedValue(new Error('Creation failed'));
        renderPage();

        const outcome = submitImageMessage();

        await waitFor(() => expect(outcome.settled).toBe('rejected'));
        expect(createThread).toHaveBeenCalledOnce();
    });
});
