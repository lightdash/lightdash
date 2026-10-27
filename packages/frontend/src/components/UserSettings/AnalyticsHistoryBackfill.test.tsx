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
    completed: true,
};
const available: AnalyticsHistoryBackfillStatus = {
    running: false,
    completed: false,
};

const renderBackfill = () => renderWithProviders(<AnalyticsHistoryBackfill />);

describe('AnalyticsHistoryBackfill', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedLightdashApi.mockResolvedValue(available);
    });

    it('hides the action after a completed marker', async () => {
        mockedLightdashApi.mockResolvedValue({ ...available, completed: true });
        renderBackfill();
        await waitFor(() =>
            expect(
                screen.queryByText('Checking backfill status…'),
            ).not.toBeInTheDocument(),
        );
        expect(
            screen.queryByRole('button', {
                name: 'Backfill available history',
            }),
        ).not.toBeInTheDocument();
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
            return complete ? covered : available;
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
