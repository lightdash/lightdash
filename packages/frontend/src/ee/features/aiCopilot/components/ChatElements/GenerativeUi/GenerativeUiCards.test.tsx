import {
    assertUnreachable,
    type AiAgentMessageAssistant,
    type AiAgentToolResult,
    type ApiError,
    type ToolGenerateUiMetadata,
} from '@lightdash/common';
import {
    GENERATIVE_UI_PROJECT_UUID_MOCK,
    generativeUiOperationsMock,
    moveChartsOutcomesMock,
    moveChartsSpecMock,
} from '@lightdash/common/src/ee/AiAgent/generativeUi/generativeUiSpec.mock';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { GenerativeUiCards } from './GenerativeUiCards';

const mocks = vi.hoisted(() => ({
    lightdashApi: vi.fn(),
    resume: vi.fn(),
}));

vi.mock('../../../../../../api', () => ({ lightdashApi: mocks.lightdashApi }));
vi.mock('../../../hooks/useProjectAiAgents', () => ({
    useRetryAiAgentThreadMessageMutation: () => ({ mutate: mocks.resume }),
    getAiAgentThreadQueryKey: (
        projectUuid: string,
        agentUuid: string,
        threadUuid: string,
    ) => ['aiAgents', projectUuid, agentUuid, 'threads', threadUuid],
}));

const PROJECT = GENERATIVE_UI_PROJECT_UUID_MOCK;
const UI_ACTION_URL = `/projects/${PROJECT}/aiAgents/agent-1/threads/thread-1/tool-calls/tc-ui/ui-action`;

type UiActionReply =
    | { kind: 'ok'; recorded: boolean; resume: boolean }
    | { kind: 'throw'; error: unknown };

const answerApi = (reply: UiActionReply) => {
    mocks.lightdashApi.mockImplementation(async ({ url }: { url: string }) => {
        if (url === '/ai/generative-ui/operations') {
            return generativeUiOperationsMock;
        }
        if (url === UI_ACTION_URL) {
            switch (reply.kind) {
                case 'ok':
                    return {
                        recorded: reply.recorded,
                        resume: reply.resume,
                        promptUuid: 'message-1',
                    };
                case 'throw':
                    throw reply.error;
                default:
                    return assertUnreachable(reply, 'Unknown reply');
            }
        }
        return [];
    });
};

const alreadyResolved: ApiError = {
    status: 'error',
    error: {
        statusCode: 409,
        name: 'AlreadyExistsError',
        message: 'Tool call tc-ui has already been resolved',
        data: {},
    },
};

const message = (
    overrides: Partial<AiAgentMessageAssistant> = {},
): AiAgentMessageAssistant => ({
    role: 'assistant',
    status: 'idle',
    uuid: 'message-1',
    threadUuid: 'thread-1',
    message: '',
    errorMessage: null,
    interrupted: false,
    createdAt: '2026-09-29T00:00:00Z',
    humanScore: null,
    toolCalls: [
        {
            uuid: 'call-row-1',
            promptUuid: 'message-1',
            toolCallId: 'tc-ui',
            parentToolCallId: null,
            createdAt: new Date('2026-09-29T00:00:00Z'),
            toolArgs: moveChartsSpecMock,
            toolType: 'built-in',
            toolName: 'generateUi',
        },
    ],
    toolResults: [],
    reasoning: [],
    savedQueryUuid: null,
    artifacts: null,
    referencedArtifacts: null,
    modelConfig: null,
    tokenUsage: null,
    responseTiming: null,
    jevDecision: null,
    ...overrides,
});

const resultRow = (metadata: ToolGenerateUiMetadata): AiAgentToolResult => ({
    uuid: 'result-row-1',
    promptUuid: 'message-1',
    result: 'The user skipped the card; nothing ran.',
    createdAt: new Date('2026-09-29T00:01:00Z'),
    toolCallId: 'tc-ui',
    toolType: 'built-in',
    toolName: 'generateUi',
    metadata,
});

const renderCards = ({
    assistantMessage = message(),
    isStreaming = false,
    isLastMessage = true,
}: {
    assistantMessage?: AiAgentMessageAssistant;
    isStreaming?: boolean;
    isLastMessage?: boolean;
} = {}) =>
    renderWithProviders(
        <GenerativeUiCards
            projectUuid={PROJECT}
            agentUuid="agent-1"
            message={assistantMessage}
            streamParts={[]}
            isStreaming={isStreaming}
            isLastMessage={isLastMessage}
        />,
    );

const uiActionCalls = () =>
    mocks.lightdashApi.mock.calls.filter(
        ([request]) => request.url === UI_ACTION_URL,
    );

describe('GenerativeUiCards', () => {
    afterEach(() => {
        mocks.lightdashApi.mockReset();
        mocks.resume.mockReset();
    });

    it('records the outcome, then resumes the run', async () => {
        answerApi({ kind: 'ok', recorded: true, resume: true });
        const user = userEvent.setup();
        renderCards();

        await user.click(await screen.findByRole('button', { name: 'Skip' }));

        await waitFor(() =>
            expect(mocks.resume).toHaveBeenCalledWith({
                projectUuid: PROJECT,
                agentUuid: 'agent-1',
                threadUuid: 'thread-1',
                messageUuid: 'message-1',
            }),
        );
        expect(uiActionCalls()).toEqual([
            [
                {
                    url: UI_ACTION_URL,
                    method: 'POST',
                    body: JSON.stringify({
                        outcome: {
                            status: 'dismissed',
                            state: { spaceUuid: null, chartUuids: [] },
                        },
                    }),
                },
            ],
        ]);
        expect(
            await screen.findByText('Sent to the agent.'),
        ).toBeInTheDocument();
    });

    it('does not start a second run when the outcome was already recorded', async () => {
        answerApi({ kind: 'ok', recorded: false, resume: false });
        const user = userEvent.setup();
        renderCards();

        await user.click(await screen.findByRole('button', { name: 'Skip' }));

        expect(
            await screen.findByText('Sent to the agent.'),
        ).toBeInTheDocument();
        expect(mocks.resume).not.toHaveBeenCalled();
    });

    it('resumes an outcome recorded earlier whose run never started', async () => {
        answerApi({ kind: 'ok', recorded: false, resume: true });
        const user = userEvent.setup();
        renderCards();

        await user.click(await screen.findByRole('button', { name: 'Skip' }));

        await waitFor(() => expect(mocks.resume).toHaveBeenCalledTimes(1));
        expect(
            await screen.findByText('Sent to the agent.'),
        ).toBeInTheDocument();
    });

    it('treats an already-resolved card as completed elsewhere', async () => {
        answerApi({ kind: 'throw', error: alreadyResolved });
        const user = userEvent.setup();
        renderCards();

        await user.click(await screen.findByRole('button', { name: 'Skip' }));

        expect(
            await screen.findByText(
                'This form was already completed elsewhere.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Send again' }),
        ).not.toBeInTheDocument();
        expect(mocks.resume).not.toHaveBeenCalled();
    });

    it('offers to send again when recording fails, without resuming', async () => {
        answerApi({ kind: 'throw', error: new Error('Offline') });
        const user = userEvent.setup();
        renderCards();

        await user.click(await screen.findByRole('button', { name: 'Skip' }));

        expect(
            await screen.findByRole('button', { name: 'Send again' }),
        ).toBeInTheDocument();
        expect(mocks.resume).not.toHaveBeenCalled();
    });

    it('locks the card while a run for the message is in flight', async () => {
        answerApi({ kind: 'ok', recorded: true, resume: true });
        renderCards({ assistantMessage: message({ status: 'pending' }) });

        expect(
            await screen.findByText('Waiting for the agent…'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Skip' }),
        ).not.toBeInTheDocument();
    });

    it('retires the card on an earlier message', () => {
        answerApi({ kind: 'ok', recorded: true, resume: true });
        renderCards({ isLastMessage: false });

        expect(
            screen.getByText('This form is no longer active.'),
        ).toBeInTheDocument();
        expect(mocks.lightdashApi).not.toHaveBeenCalled();
    });

    it('shows the outcome once the call has a result', () => {
        renderCards({
            assistantMessage: message({
                toolResults: [
                    resultRow({
                        status: 'dismissed',
                        state: moveChartsOutcomesMock.dismissed.state,
                    }),
                ],
            }),
        });

        expect(screen.getByText('Skipped')).toBeInTheDocument();
        expect(mocks.lightdashApi).not.toHaveBeenCalled();
    });

    it('shows nothing for a card the agent could not render', () => {
        renderCards({
            assistantMessage: message({
                toolResults: [resultRow({ status: 'error' })],
            }),
        });

        expect(screen.queryByRole('heading')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Skip' }),
        ).not.toBeInTheDocument();
    });
});
