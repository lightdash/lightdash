import { type AnalyticsProcessingStatus } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import AnalyticsProcessingSummary from './AnalyticsProcessingSummary';

const processing: AnalyticsProcessingStatus = {
    status: 'partial',
    startedAt: '2026-10-30T00:30:00Z',
    finishedAt: '2026-10-30T00:42:00Z',
    lastSuccessfulAt: '2026-10-29T00:41:00Z',
    stats: {
        partitionsDiscovered: 5,
        partitionsCompacted: 3,
        partitionsFailed: 1,
        rawObjectsDeleted: 10,
        dimensionsFailed: 0,
        userPartitionsFailed: 0,
        userPartitionsDeferred: 1,
        limitReached: false,
    },
};

describe('AnalyticsProcessingSummary', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('retains the previous successful refresh while showing partial output', async () => {
        renderWithProviders(
            <AnalyticsProcessingSummary processing={processing} />,
        );
        expect(
            screen.getByText('Last success: 29 Oct 2026, 00:41 UTC'),
        ).toBeVisible();
        await userEvent.hover(screen.getByText('Latest run: Partial'));
        const tooltip = await screen.findByRole('tooltip');
        expect(tooltip).toHaveTextContent(
            'Some data was processed, but the refresh is incomplete.',
        );
        expect(tooltip).toHaveTextContent('Failed compaction partitions: 1.');
        expect(tooltip).toHaveTextContent('Pending compaction partitions: 1.');
        expect(tooltip).toHaveTextContent('Deferred People partitions: 1.');
    });

    it('does not present an interrupted run as still running', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(
            new Date('2026-10-30T05:00:00Z').getTime(),
        );
        renderWithProviders(
            <AnalyticsProcessingSummary
                processing={{
                    ...processing,
                    status: 'running',
                    finishedAt: null,
                }}
            />,
        );
        await userEvent.hover(
            screen.getByText('Latest run: Status unavailable'),
        );
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'No completion was recorded within four hours',
        );
        expect(
            screen.getByText('Last success: 29 Oct 2026, 00:41 UTC'),
        ).toBeVisible();
    });

    it('keeps a missing processing record neutral', () => {
        renderWithProviders(<AnalyticsProcessingSummary processing={null} />);
        expect(screen.getByText('No processing run recorded')).toBeVisible();
        expect(screen.queryByText(/Completed/)).not.toBeInTheDocument();
    });
});
