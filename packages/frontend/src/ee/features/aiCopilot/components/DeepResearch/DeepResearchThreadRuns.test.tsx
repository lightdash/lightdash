import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { deepResearchRunFixture } from '../../deepResearch/fixtures';
import { DeepResearchThreadRuns } from './DeepResearchThreadRuns';

const { useDeepResearchRunMock } = vi.hoisted(() => ({
    useDeepResearchRunMock: vi.fn(),
}));

vi.mock('../../../../../hooks/user/useUser', () => ({
    default: () => ({ data: { userUuid: 'user-1' } }),
}));

vi.mock('../../deepResearch/deepResearchRegistry', () => ({
    useDeepResearchRunsForThread: () => [
        {
            runUuid: 'run-1',
            projectUuid: 'project-1',
            threadUuid: 'thread-1',
            userUuid: 'user-1',
            question: 'Why did enterprise retention fall in Q2?',
            depth: 'standard',
            createdAt: '2026-07-15T09:00:00.000Z',
            state: 'started',
        },
    ],
}));

vi.mock('../../hooks/useDeepResearch', () => ({
    useContinueDeepResearchMutation: () => ({
        mutate: vi.fn(),
        isLoading: false,
    }),
    useDeepResearchRun: useDeepResearchRunMock,
    useDeepResearchThreadRuns: () => ({ data: [] }),
}));

vi.mock('./DeepResearchRunCard', () => ({
    DeepResearchRunCard: () => <div>Saved deep research result</div>,
}));

describe('DeepResearchThreadRuns', () => {
    const renderThreadRuns = () =>
        renderWithProviders(
            <DeepResearchThreadRuns
                projectUuid="project-1"
                threadUuid="thread-1"
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
});
