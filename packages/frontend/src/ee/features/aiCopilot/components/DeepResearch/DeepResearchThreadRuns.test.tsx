import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { deepResearchRunFixture } from '../../deepResearch/fixtures';
import { type DeepResearchRunRegistration } from '../../deepResearch/types';
import { DeepResearchThreadRuns } from './DeepResearchThreadRuns';

const {
    continueDeepResearchMock,
    localRegistrationsMock,
    useDeepResearchRunMock,
} = vi.hoisted(() => ({
    continueDeepResearchMock: vi.fn(),
    localRegistrationsMock: vi.fn(),
    useDeepResearchRunMock: vi.fn(),
}));

vi.mock('../../../../../hooks/user/useUser', () => ({
    default: () => ({ data: { userUuid: 'user-1' } }),
}));

vi.mock('../../deepResearch/deepResearchRegistry', () => ({
    useDeepResearchRunsForThread: localRegistrationsMock,
}));

vi.mock('../../hooks/useDeepResearch', () => ({
    useContinueDeepResearchMutation: () => ({
        mutate: continueDeepResearchMock,
        isLoading: false,
    }),
    useDeepResearchRun: useDeepResearchRunMock,
    useDeepResearchThreadRuns: () => ({ data: [] }),
}));

vi.mock('./DeepResearchRunCard', () => ({
    DeepResearchRunCard: () => <div>Saved deep research result</div>,
}));

describe('DeepResearchThreadRuns', () => {
    const registration: DeepResearchRunRegistration = {
        runUuid: 'run-1',
        projectUuid: 'project-1',
        agentUuid: 'agent-1',
        threadUuid: 'thread-1',
        promptUuid: 'prompt-1',
        mcpServerUuids: ['mcp-1'],
        userUuid: 'user-1',
        question: 'Why did enterprise retention fall in Q2?',
        depth: 'standard',
        createdAt: '2026-07-15T09:00:00.000Z',
        state: 'started',
    };

    beforeEach(() => {
        localRegistrationsMock.mockReturnValue([registration]);
        continueDeepResearchMock.mockReset();
        useDeepResearchRunMock.mockReset();
    });

    const renderThreadRuns = (canRetry = false) =>
        renderWithProviders(
            <DeepResearchThreadRuns
                projectUuid="project-1"
                threadUuid="thread-1"
                canRetry={canRetry}
            />,
        );

    const setRunQuery = ({
        data,
        isError = false,
        isEventsError = false,
    }: {
        data: typeof deepResearchRunFixture | undefined;
        isError?: boolean;
        isEventsError?: boolean;
    }) => {
        useDeepResearchRunMock.mockReturnValue({
            data,
            isLoading: false,
            isError,
            refetch: vi.fn(),
            eventsQuery: {
                data: { events: [], nextCursor: null },
                isError: isEventsError,
                refetch: vi.fn(),
            },
        });
    };

    it.each([
        ['run', { data: deepResearchRunFixture, isError: true }],
        ['events', { data: deepResearchRunFixture, isEventsError: true }],
    ])(
        'keeps the saved run visible when a background %s refresh fails',
        (_query, state) => {
            setRunQuery(state);
            renderThreadRuns();

            expect(
                screen.getByText('Saved deep research result'),
            ).toBeInTheDocument();
            expect(
                screen.queryByText('Could not refresh this run'),
            ).not.toBeInTheDocument();
        },
    );

    it('shows the refresh error when the run fails without saved data', () => {
        setRunQuery({ data: undefined, isError: true });
        renderThreadRuns();

        expect(
            screen.getByText('Could not refresh this run'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Saved deep research result'),
        ).not.toBeInTheDocument();
    });

    it('does not retry a failed start while the thread is busy', async () => {
        const user = userEvent.setup();
        localRegistrationsMock.mockReturnValue([
            { ...registration, state: 'start_failed' },
        ]);

        renderThreadRuns(false);

        const retryButton = screen.getByRole('button', { name: 'Try again' });
        expect(retryButton).toBeDisabled();
        await user.click(retryButton);
        expect(continueDeepResearchMock).not.toHaveBeenCalled();
    });

    it('retries a failed start with its original prompt while idle', async () => {
        const user = userEvent.setup();
        localRegistrationsMock.mockReturnValue([
            { ...registration, state: 'start_failed' },
        ]);

        renderThreadRuns(true);
        await user.click(screen.getByRole('button', { name: 'Try again' }));

        expect(continueDeepResearchMock).toHaveBeenCalledWith({
            question: registration.question,
            depth: registration.depth,
            promptUuid: registration.promptUuid,
            mcpServerUuids: registration.mcpServerUuids,
        });
    });
});
