import { type AnalyticsHistoryBackfillStatus } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../../api';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../testing/testUtils';
import AnalyticsHistoryBackfill from './AnalyticsHistoryBackfill';

vi.mock('../../api');
vi.mock('../../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({ data: { organizationUuid: 'org' } }),
}));

const covered: AnalyticsHistoryBackfillStatus = {
    running: false,
    missingQueries: 0,
    existingQueries: 0,
    pendingQueries: 0,
    from: null,
    to: null,
};

const available: AnalyticsHistoryBackfillStatus = {
    ...covered,
    missingQueries: 24,
    existingQueries: 8,
    pendingQueries: 3,
    from: '2026-09-01',
    to: '2026-09-30',
};

const renderBackfill = () => renderWithProviders(<AnalyticsHistoryBackfill />);

describe('AnalyticsHistoryBackfill', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedLightdashApi.mockResolvedValue(available);
    });

    it.each([
        ['no retained history', covered],
        [
            'all retained queries already available',
            { ...covered, existingQueries: 24 },
        ],
        [
            'all retained queries captured but awaiting processing',
            { ...covered, pendingQueries: 24 },
        ],
    ])('hides the action when there is %s', async (_name, status) => {
        mockedLightdashApi.mockResolvedValue(status);
        renderBackfill();
        await waitFor(() =>
            expect(
                screen.queryByText('Checking available query history…'),
            ).not.toBeInTheDocument(),
        );
        expect(
            screen.queryByRole('button', {
                name: 'Backfill available history',
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('Historical query activity'),
        ).not.toBeInTheDocument();
        expect(sharedLightdashApi).toHaveBeenCalledWith({
            url: '/org/analytics-project/backfill',
            method: 'GET',
        });
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('shows the missing dates and overlap counts without starting automatically', async () => {
        renderBackfill();
        expect(
            await screen.findByRole('button', {
                name: 'Backfill available history',
            }),
        ).toBeEnabled();
        expect(
            screen.getByText('24 missing queries · 2026-09-01 to 2026-09-30'),
        ).toBeVisible();
        expect(
            screen.getByText('8 queries already available will be skipped.'),
        ).toBeVisible();
        expect(
            screen.getByText(
                '3 captured queries are awaiting processing and will be skipped.',
            ),
        ).toBeVisible();
        expect(
            screen.getByText(
                /historical People activity summaries are not rebuilt/,
            ),
        ).toBeVisible();
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('allows existing Analytics customers to import missing retained history regardless of age', async () => {
        mockedLightdashApi.mockResolvedValue({
            ...available,
            missingQueries: 2,
            existingQueries: 23,
            pendingQueries: 0,
            from: '2017-01-01',
            to: '2026-10-26',
        });
        renderBackfill();
        expect(
            await screen.findByRole('button', {
                name: 'Backfill available history',
            }),
        ).toBeEnabled();
        expect(
            screen.getByText('2 missing queries · 2017-01-01 to 2026-10-26'),
        ).toBeVisible();
        expect(
            screen.getByText('23 queries already available will be skipped.'),
        ).toBeVisible();
        expect(
            screen.getByText(/Import all retained completed query history\./),
        ).toBeVisible();
        expect(
            screen.queryByText(/completed UTC days/),
        ).not.toBeInTheDocument();
    });

    it('separates singular counts from their labels', async () => {
        mockedLightdashApi.mockResolvedValue({
            ...available,
            missingQueries: 1,
            existingQueries: 1,
            pendingQueries: 1,
        });
        renderBackfill();
        expect(
            await screen.findByText(
                '1 missing query · 2026-09-01 to 2026-09-30',
            ),
        ).toBeVisible();
        expect(
            screen.getByText('1 query already available will be skipped.'),
        ).toBeVisible();
        expect(
            screen.getByText(
                '1 captured query is awaiting processing and will be skipped.',
            ),
        ).toBeVisible();
    });

    it('shows an existing background run as disabled after loading settings', async () => {
        mockedLightdashApi.mockResolvedValue({ ...covered, running: true });
        const rendered = renderBackfill();
        const button = await screen.findByRole('button', {
            name: 'Backfill available history',
        });
        expect(button).toBeDisabled();
        expect(
            screen.getByText(/Backfill is running in the background/),
        ).toBeVisible();
        await userEvent.click(button);
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST' }),
        );
        rendered.unmount();
    });

    it('rechecks persisted coverage after POST and removes the action when complete', async () => {
        let complete = false;
        mockedLightdashApi.mockImplementation(async ({ method }) => {
            if (method === 'POST') {
                complete = true;
                return undefined;
            }
            return complete ? { ...covered, existingQueries: 32 } : available;
        });
        renderBackfill();
        await userEvent.click(
            await screen.findByRole('button', {
                name: 'Backfill available history',
            }),
        );
        await waitFor(() =>
            expect(
                screen.queryByRole('button', {
                    name: 'Backfill available history',
                }),
            ).not.toBeInTheDocument(),
        );
        expect(sharedLightdashApi).toHaveBeenCalledWith({
            url: '/org/analytics-project/backfill',
            method: 'POST',
            body: undefined,
        });
        expect(
            mockedLightdashApi.mock.calls.filter(
                ([request]) => request.method === 'GET',
            ),
        ).toHaveLength(2);
    });

    it('keeps the action after partial completion and removes it only when no records are missing', async () => {
        let runs = 0;
        mockedLightdashApi.mockImplementation(async ({ method }) => {
            if (method === 'POST') {
                runs += 1;
                return undefined;
            }
            return runs === 0
                ? available
                : runs === 1
                  ? { ...available, missingQueries: 4 }
                  : covered;
        });
        renderBackfill();
        await userEvent.click(
            await screen.findByRole('button', {
                name: 'Backfill available history',
            }),
        );
        expect(
            await screen.findByText(
                '4 missing queries · 2026-09-01 to 2026-09-30',
            ),
        ).toBeVisible();
        await userEvent.click(
            screen.getByRole('button', { name: 'Backfill available history' }),
        );
        await waitFor(() =>
            expect(
                screen.queryByRole('button', {
                    name: 'Backfill available history',
                }),
            ).not.toBeInTheDocument(),
        );
        expect(runs).toBe(2);
    });

    it('allows retry after a failed POST without hiding missing history', async () => {
        let attempts = 0;
        mockedLightdashApi.mockImplementation(async ({ method }) => {
            if (method === 'POST') {
                attempts += 1;
                if (attempts === 1)
                    throw {
                        error: {
                            message: 'Storage is temporarily unavailable',
                        },
                    };
                return undefined;
            }
            return attempts < 2 ? available : covered;
        });
        renderBackfill();
        await userEvent.click(
            await screen.findByRole('button', {
                name: 'Backfill available history',
            }),
        );
        expect(
            await screen.findByText('Storage is temporarily unavailable'),
        ).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'Backfill available history' }),
        ).toBeEnabled();
        await userEvent.click(
            screen.getByRole('button', { name: 'Backfill available history' }),
        );
        await waitFor(() =>
            expect(
                screen.queryByRole('button', {
                    name: 'Backfill available history',
                }),
            ).not.toBeInTheDocument(),
        );
        expect(attempts).toBe(2);
    });

    it('shows a failed background job and leaves missing history retryable', async () => {
        mockedLightdashApi.mockResolvedValue({
            ...available,
            error: 'The previous backfill failed. You can retry safely.',
        });
        renderBackfill();
        expect(
            await screen.findByText(
                'The previous backfill failed. You can retry safely.',
            ),
        ).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'Backfill available history' }),
        ).toBeEnabled();
    });

    it('retries an unsuccessful availability check before enabling backfill', async () => {
        mockedLightdashApi.mockRejectedValue({
            error: { message: 'Unable to inspect storage' },
        });
        renderBackfill();
        expect(
            await screen.findByText('Unable to inspect storage'),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', {
                name: 'Backfill available history',
            }),
        ).not.toBeInTheDocument();
        mockedLightdashApi.mockResolvedValue(available);
        await userEvent.click(
            screen.getByRole('button', { name: 'Retry check' }),
        );
        expect(
            await screen.findByRole('button', {
                name: 'Backfill available history',
            }),
        ).toBeEnabled();
    });
});
