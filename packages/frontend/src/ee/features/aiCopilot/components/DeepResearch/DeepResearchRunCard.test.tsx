import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { deepResearchRunFixture } from '../../deepResearch/fixtures';
import { DeepResearchRunCard } from './DeepResearchRunCard';

const cancelRun = vi.fn();
const trackReportEngagement = vi.fn();

vi.mock('../../hooks/useDeepResearch', () => ({
    useCancelDeepResearchMutation: () => ({
        mutate: cancelRun,
        isLoading: false,
    }),
    useTrackDeepResearchReportEngagement: () => trackReportEngagement,
}));

describe('DeepResearchRunCard', () => {
    beforeEach(() => {
        cancelRun.mockClear();
        trackReportEngagement.mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it.each([
        ['queued', 'Queued'],
        ['running', 'Running'],
    ] as const)(
        'renders the %s active state without fake progress',
        (status, label) => {
            renderWithProviders(
                <DeepResearchRunCard
                    run={{
                        ...deepResearchRunFixture,
                        status,
                        resultMarkdown: null,
                        findingCount: 0,
                        completedAt: null,
                    }}
                    projectUuid="project-1"
                />,
            );

            expect(screen.getByText(label)).toBeInTheDocument();
            expect(screen.getByText('Medium')).toBeInTheDocument();
            expect(screen.getByText(/leave this page/i)).toBeInTheDocument();
            expect(screen.queryByText(/%/)).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Stop research' }),
            ).toBeInTheDocument();
            expect(screen.getAllByRole('separator')).toHaveLength(2);
        },
    );

    it('updates elapsed time once per second without milliseconds', async () => {
        vi.useFakeTimers();
        renderWithProviders(
            <DeepResearchRunCard
                run={{
                    ...deepResearchRunFixture,
                    status: 'running',
                    resultMarkdown: null,
                    completedAt: null,
                    elapsedMs: 250,
                }}
                projectUuid="project-1"
            />,
        );

        expect(screen.getByText('0s')).toBeInTheDocument();
        expect(screen.queryByText(/ms$/)).not.toBeInTheDocument();

        await act(() => vi.advanceTimersByTimeAsync(1_000));

        expect(screen.getByText('1s')).toBeInTheDocument();
    });

    it('cancels an active run and exposes safe activity', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <DeepResearchRunCard
                run={{
                    ...deepResearchRunFixture,
                    status: 'running',
                    resultMarkdown: null,
                    completedAt: null,
                }}
                projectUuid="project-1"
            />,
        );

        await user.click(screen.getByRole('button', { name: 'View activity' }));
        expect(
            screen.getByText('Executed a warehouse query'),
        ).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Stop research' }));
        expect(cancelRun).toHaveBeenCalledOnce();
    });

    it.each([
        ['completed', 'Completed'],
        ['cancelled', 'Cancelled'],
        ['failed', 'Failed'],
    ] as const)(
        'renders the %s terminal state without a stop action',
        (status, label) => {
            renderWithProviders(
                <DeepResearchRunCard
                    run={{
                        ...deepResearchRunFixture,
                        status,
                        resultMarkdown:
                            status === 'cancelled'
                                ? null
                                : deepResearchRunFixture.resultMarkdown,
                        errorMessage:
                            status === 'failed'
                                ? 'The warehouse timed out.'
                                : null,
                    }}
                    projectUuid="project-1"
                />,
            );

            expect(screen.getByText(label)).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Stop research' }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByText('This run is saved in this thread.'),
            ).toBeInTheDocument();
        },
    );

    it('preserves partial findings and offers the report', () => {
        renderWithProviders(
            <DeepResearchRunCard
                run={{
                    ...deepResearchRunFixture,
                    status: 'partially_completed',
                }}
                projectUuid="project-1"
            />,
        );

        expect(screen.getByText('Partially completed')).toBeInTheDocument();
        expect(
            screen.getByText(
                /findings and completed queries have been preserved/i,
            ),
        ).toBeInTheDocument();
        expect(screen.getByText('Executive answer')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Open full report' }),
        ).toBeInTheDocument();
    });

    it('tracks explicitly opening the full report', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <DeepResearchRunCard
                run={deepResearchRunFixture}
                projectUuid="project-1"
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Open full report' }),
        );

        expect(trackReportEngagement).toHaveBeenCalledWith('opened', {
            aiDeepResearchRunUuid: deepResearchRunFixture.uuid,
            projectUuid: deepResearchRunFixture.projectUuid,
            agentUuid: deepResearchRunFixture.agentUuid,
            aiThreadUuid: deepResearchRunFixture.threadUuid,
            status: deepResearchRunFixture.status,
            completedAt: deepResearchRunFixture.completedAt,
            updatedAt: deepResearchRunFixture.updatedAt,
        });
    });

    it('renders the executive answer as Markdown', () => {
        renderWithProviders(
            <DeepResearchRunCard
                run={{
                    ...deepResearchRunFixture,
                    status: 'completed',
                    resultMarkdown: `# Executive summary

This has **important context**, a [source](https://example.com), and \`inline code\`.

- First finding
- Second finding

## Findings

The full report continues here.`,
                }}
                projectUuid="project-1"
            />,
        );

        expect(
            screen.getByRole('heading', { name: 'Executive summary' }),
        ).toBeInTheDocument();
        expect(
            screen
                .getByText('important context')
                .closest('[data-streamdown="strong"]'),
        ).not.toBeNull();
        expect(screen.getByText('source')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'source' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'source' }),
        ).not.toBeInTheDocument();
        expect(
            screen
                .getByText('inline code')
                .closest('[data-streamdown="inline-code"]'),
        ).not.toBeNull();
        expect(screen.getByRole('list')).toBeInTheDocument();
        expect(
            screen.queryByText('The full report continues here.'),
        ).not.toBeInTheDocument();
    });

    it('offers reconnection and continue-without-source recovery', async () => {
        const user = userEvent.setup();
        const onReconnect = vi.fn();
        const onContinue = vi.fn();
        renderWithProviders(
            <DeepResearchRunCard
                run={{
                    ...deepResearchRunFixture,
                    status: 'waiting_for_reconnection',
                    actionRequired: {
                        type: 'reconnect',
                        integrationName: 'GitHub',
                        message:
                            'The GitHub connection expired after repository review.',
                    },
                }}
                projectUuid="project-1"
                onReconnect={onReconnect}
                onContinueWithoutSource={onContinue}
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Reconnect GitHub' }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Continue without GitHub' }),
        );

        expect(onReconnect).toHaveBeenCalledWith('GitHub');
        expect(onContinue).toHaveBeenCalledWith('GitHub');
    });

    it('offers a permission action without discarding findings', async () => {
        const user = userEvent.setup();
        const onReviewPermissions = vi.fn();
        renderWithProviders(
            <DeepResearchRunCard
                run={{
                    ...deepResearchRunFixture,
                    status: 'waiting_for_permission',
                    actionRequired: {
                        type: 'permission',
                        message:
                            'Approval is required before the warehouse query can run.',
                    },
                }}
                projectUuid="project-1"
                onReconnect={onReviewPermissions}
            />,
        );

        expect(screen.getByText('Executive answer')).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Review permissions' }),
        );
        expect(onReviewPermissions).toHaveBeenCalledOnce();
    });
});
