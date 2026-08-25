import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type ContentAsCodeSyncStatus } from '../types';
import ContentAsCodeSyncStatusPanel from './ContentAsCodeSyncStatusPanel';

const useContentAsCodeSyncStatus = vi.hoisted(() => vi.fn());

vi.mock('../hooks/useContentAsCodeSyncStatus', () => ({
    useContentAsCodeSyncStatus,
}));

const populatedStatus: ContentAsCodeSyncStatus = {
    lastAppliedAt: new Date('2026-08-25T09:00:00.000Z'),
    revisionCount: 2,
    revisions: [
        {
            contentType: 'chart',
            slug: 'orders-over-time',
            contentHash: 'abc123def4567890',
            appliedAt: new Date('2026-08-25T09:00:00.000Z'),
            appliedByUserUuid: null,
        },
        {
            contentType: 'dashboard',
            slug: 'revenue',
            contentHash: 'fff0001112223334',
            appliedAt: new Date('2026-08-24T15:30:00.000Z'),
            appliedByUserUuid: 'user-1',
        },
    ],
};

describe('ContentAsCodeSyncStatusPanel', () => {
    it('shows the empty state when there is no sync history', () => {
        useContentAsCodeSyncStatus.mockReturnValue({
            data: {
                lastAppliedAt: null,
                revisionCount: 0,
                revisions: [],
            },
            isInitialLoading: false,
            isError: false,
            refetch: vi.fn(),
        });

        renderWithProviders(
            <ContentAsCodeSyncStatusPanel projectUuid="project-uuid" />,
        );

        expect(
            screen.getByRole('heading', { name: 'No sync history yet' }),
        ).toBeVisible();
        expect(screen.queryByText('Last applied')).not.toBeInTheDocument();
    });

    it('shows last applied, revision count, and revisions without raw hashes as the primary UI', () => {
        useContentAsCodeSyncStatus.mockReturnValue({
            data: populatedStatus,
            isInitialLoading: false,
            isError: false,
            refetch: vi.fn(),
        });

        renderWithProviders(
            <ContentAsCodeSyncStatusPanel projectUuid="project-uuid" />,
        );

        expect(screen.getByText('Last applied')).toBeVisible();
        expect(screen.getByText('Revisions')).toBeVisible();
        expect(screen.getByText('2')).toBeVisible();
        expect(screen.getByText('Chart')).toBeVisible();
        expect(screen.getByText('orders-over-time')).toBeVisible();
        expect(screen.getByText('Dashboard')).toBeVisible();
        expect(screen.getByText('revenue')).toBeVisible();
        expect(screen.queryByText('abc123def4567890')).not.toBeInTheDocument();
        expect(screen.getByText('abc123de')).toBeVisible();
    });

    it('shows a quiet error state when the request fails unexpectedly', () => {
        useContentAsCodeSyncStatus.mockReturnValue({
            data: undefined,
            isInitialLoading: false,
            isError: true,
            refetch: vi.fn(),
        });

        renderWithProviders(
            <ContentAsCodeSyncStatusPanel projectUuid="project-uuid" />,
        );

        expect(
            screen.getByText('Could not load content as code sync status.'),
        ).toBeVisible();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
    });
});
