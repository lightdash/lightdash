import {
    type AiAgentMessageAssistant,
    type AiAgentMessageUser,
    type AiAgentThread,
    type ApiGetAppResponse,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../../../api';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { store } from '../../store';
import { clearPreview } from '../../store/aiArtifactSlice';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../../streaming/AiAgentThreadStreamAbortControllerContextProvider';
import { AgentChatDisplay } from './AgentChatDisplay';

vi.mock('../../../../../api', () => ({ lightdashApi: vi.fn() }));
const mockedLightdashApi = vi.mocked(lightdashApi);

vi.mock('../../hooks/useProjectAiMcpServers', () => ({
    useAgentAiMcpServers: () => ({ data: [] }),
}));

vi.mock('../../hooks/useDeepResearch', () => ({
    useDeepResearchThreadRunRegistrations: () => [],
}));

const app: ApiGetAppResponse['results'] = {
    appUuid: 'app-1',
    name: 'Revenue app',
    description: '',
    createdByUserUuid: 'user-1',
    spaceUuid: null,
    spaceName: null,
    registrySlug: null,
    template: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    slug: 'revenue-app',
    views: 0,
    versions: [],
    hasMore: false,
    latestReadyVersion: 3,
};

const userMessage = (
    overrides: Partial<AiAgentMessageUser>,
): AiAgentMessageUser => ({
    role: 'user',
    uuid: 'prompt-1',
    threadUuid: 'thread-1',
    message: 'Build me a revenue app',
    createdAt: '2026-07-29T09:00:00.000Z',
    user: { uuid: 'user-1', name: 'Demo User' },
    context: [],
    steers: [],
    hidden: false,
    ...overrides,
});

const assistantMessage = (
    overrides: Partial<AiAgentMessageAssistant>,
): AiAgentMessageAssistant => ({
    role: 'assistant',
    status: 'idle',
    uuid: 'prompt-1',
    threadUuid: 'thread-1',
    message: 'Here is your app.',
    errorMessage: null,
    interrupted: false,
    createdAt: '2026-07-29T09:00:01.000Z',
    humanScore: null,
    humanFeedback: null,
    toolCalls: [],
    toolResults: [],
    reasoning: [],
    savedQueryUuid: null,
    artifacts: null,
    referencedArtifacts: null,
    modelConfig: null,
    tokenUsage: null,
    responseTiming: null,
    ...overrides,
});

const thread: AiAgentThread = {
    uuid: 'thread-1',
    agentUuid: 'agent-1',
    createdAt: '2026-07-29T09:00:00.000Z',
    createdFrom: 'web_app',
    title: 'Revenue app',
    titleGeneratedAt: null,
    liveStatus: null,
    firstMessage: { uuid: 'prompt-1', message: 'Build me a revenue app' },
    user: { uuid: 'user-1', name: 'Demo User' },
    compactions: [],
    messages: [
        userMessage({}),
        assistantMessage({}),
        userMessage({
            uuid: 'restore-prompt',
            message: 'Restore version 1 of Revenue app',
            createdAt: '2026-07-29T09:02:00.000Z',
            hidden: true,
            context: [
                {
                    type: 'data_app_restore',
                    appUuid: 'app-1',
                    version: 3,
                    restoredFromVersion: 1,
                    appSlug: 'revenue-app',
                    displayName: 'Revenue app',
                },
            ],
        }),
        assistantMessage({
            uuid: 'restore-prompt',
            message: 'Restored version 1 as version 3.',
            createdAt: '2026-07-29T09:02:01.000Z',
        }),
    ],
};

describe('AgentChatDisplay with a restore turn', () => {
    beforeEach(() => {
        store.dispatch(clearPreview());
        mockedLightdashApi.mockReset();
        mockedLightdashApi.mockResolvedValue(app);
    });

    it('renders one restore card in place of the hidden turn, and View opens the restored version', async () => {
        renderWithProviders(
            <Provider store={store}>
                <MemoryRouter>
                    <AiAgentThreadStreamAbortControllerContextProvider>
                        <AgentChatDisplay
                            thread={thread}
                            projectUuid="project-1"
                            agentUuid="agent-1"
                        />
                    </AiAgentThreadStreamAbortControllerContextProvider>
                </MemoryRouter>
            </Provider>,
        );

        expect(screen.getByText('Build me a revenue app')).toBeVisible();
        expect(screen.getByText('Here is your app.')).toBeVisible();
        expect(
            screen.queryByText('Restore version 1 of Revenue app'),
        ).not.toBeInTheDocument();
        expect(screen.getByText('v3 · restored from v1')).toBeVisible();
        expect(
            screen.getAllByText('Restored version 1 as version 3.'),
        ).toHaveLength(1);

        fireEvent.click(screen.getByRole('button', { name: 'View' }));
        expect(store.getState().aiArtifact.preview).toMatchObject({
            type: 'dataApp',
            appUuid: 'app-1',
            messageUuid: 'restore-prompt',
            version: 3,
        });
    });
});
