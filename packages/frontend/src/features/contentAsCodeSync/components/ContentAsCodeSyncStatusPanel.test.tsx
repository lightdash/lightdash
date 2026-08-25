import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ContentAsCodeSyncStatusPanel from './ContentAsCodeSyncStatusPanel';

const useContentAsCodeSyncStatus = vi.hoisted(() => vi.fn());
const useRestampContentAsCodeRevision = vi.hoisted(() => vi.fn());

vi.mock('../hooks/useContentAsCodeSyncStatus', () => ({
    useContentAsCodeSyncStatus,
}));

vi.mock('../hooks/useRestampContentAsCodeRevision', () => ({
    useRestampContentAsCodeRevision,
}));

const restampMock = {
    mutate: vi.fn(),
    isLoading: false,
    isError: false,
    error: null,
    variables: undefined,
};

const populatedItems = {
    kind: 'ok' as const,
    status: {
        syncEnabled: true,
        lastAppliedAt: new Date('2026-08-25T09:00:00.000Z'),
        items: [
            {
                contentType: 'chart' as const,
                slug: 'orders-over-time',
                state: 'in_sync' as const,
                appliedAt: new Date('2026-08-25T09:00:00.000Z'),
                contentHash: 'abc123def4567890',
                snapshot: { name: 'orders' },
                current: { name: 'orders' },
            },
            {
                contentType: 'dashboard' as const,
                slug: 'revenue',
                state: 'ahead' as const,
                appliedAt: new Date('2026-08-24T15:30:00.000Z'),
                contentHash: 'fff0001112223334',
                snapshot: { name: 'old revenue' },
                current: { name: 'new revenue' },
            },
            {
                contentType: 'chart' as const,
                slug: 'new-chart',
                state: 'ui_only' as const,
                appliedAt: null,
                contentHash: null,
                snapshot: null,
                current: { name: 'new chart' },
            },
        ],
    },
};

const createAbility = {
    user: {
        abilityRules: [
            { action: 'create' as const, subject: 'ContentAsCode' as const },
        ],
    },
};

describe('ContentAsCodeSyncStatusPanel', () => {
    it('shows a not-available state when the API is missing', () => {
        useContentAsCodeSyncStatus.mockReturnValue({
            data: { kind: 'unavailable' },
            isInitialLoading: false,
            isError: false,
            refetch: vi.fn(),
        });
        useRestampContentAsCodeRevision.mockReturnValue(restampMock);

        renderWithProviders(
            <ContentAsCodeSyncStatusPanel projectUuid="project-uuid" />,
        );

        expect(
            screen.getByRole('heading', {
                name: 'Content as code sync is not available yet',
            }),
        ).toBeVisible();
    });

    it('shows an empty managed-content state when sync is enabled but there are no slugs', () => {
        useContentAsCodeSyncStatus.mockReturnValue({
            data: {
                kind: 'ok',
                status: {
                    syncEnabled: true,
                    lastAppliedAt: null,
                    items: [],
                },
            },
            isInitialLoading: false,
            isError: false,
            refetch: vi.fn(),
        });
        useRestampContentAsCodeRevision.mockReturnValue(restampMock);

        renderWithProviders(
            <ContentAsCodeSyncStatusPanel projectUuid="project-uuid" />,
        );

        expect(
            screen.getByRole('heading', { name: 'No managed content' }),
        ).toBeVisible();
    });

    it('renders in sync, ahead, and UI-only rows without raw hashes as the primary UI', async () => {
        useContentAsCodeSyncStatus.mockReturnValue({
            data: populatedItems,
            isInitialLoading: false,
            isError: false,
            refetch: vi.fn(),
        });
        useRestampContentAsCodeRevision.mockReturnValue(restampMock);

        renderWithProviders(
            <ContentAsCodeSyncStatusPanel projectUuid="project-uuid" />,
            createAbility,
        );

        expect(screen.getByText('In sync')).toBeVisible();
        expect(screen.getByText('Ahead')).toBeVisible();
        expect(screen.getByText('UI-only')).toBeVisible();
        expect(screen.getByText('orders-over-time')).toBeVisible();
        expect(screen.getByText('revenue')).toBeVisible();
        expect(screen.getByText('new-chart')).toBeVisible();
        expect(screen.getByRole('button', { name: 'View diff' })).toBeVisible();
        expect(screen.queryByText('abc123def4567890')).not.toBeInTheDocument();

        const restampButtons = await screen.findAllByRole('button', {
            name: 'Use git version on next deploy',
        });
        expect(restampButtons).toHaveLength(3);
        expect(restampButtons[0]).toBeDisabled();
        expect(restampButtons[1]).toBeEnabled();
        expect(restampButtons[2]).toBeEnabled();
    });

    it('hides restamp when the user cannot create content as code', async () => {
        useContentAsCodeSyncStatus.mockReturnValue({
            data: populatedItems,
            isInitialLoading: false,
            isError: false,
            refetch: vi.fn(),
        });
        useRestampContentAsCodeRevision.mockReturnValue(restampMock);

        renderWithProviders(
            <ContentAsCodeSyncStatusPanel projectUuid="project-uuid" />,
        );

        expect(
            await screen.findByRole('button', { name: 'View diff' }),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', {
                name: 'Use git version on next deploy',
            }),
        ).not.toBeInTheDocument();
    });

    it('shows the not-available state when sync is disabled on the project', () => {
        useContentAsCodeSyncStatus.mockReturnValue({
            data: {
                kind: 'ok',
                status: {
                    syncEnabled: false,
                    lastAppliedAt: null,
                    items: [],
                },
            },
            isInitialLoading: false,
            isError: false,
            refetch: vi.fn(),
        });
        useRestampContentAsCodeRevision.mockReturnValue(restampMock);

        renderWithProviders(
            <ContentAsCodeSyncStatusPanel projectUuid="project-uuid" />,
        );

        expect(
            screen.getByRole('heading', {
                name: 'Content as code sync is not available yet',
            }),
        ).toBeVisible();
    });

    it('disables restamp when the restamp API is not deployed yet', async () => {
        useContentAsCodeSyncStatus.mockReturnValue({
            data: populatedItems,
            isInitialLoading: false,
            isError: false,
            refetch: vi.fn(),
        });
        useRestampContentAsCodeRevision.mockReturnValue({
            ...restampMock,
            isError: true,
            error: {
                error: {
                    name: 'NotFoundError',
                    statusCode: 404,
                    message: 'Not found',
                    data: {},
                },
            },
        });

        renderWithProviders(
            <ContentAsCodeSyncStatusPanel projectUuid="project-uuid" />,
            createAbility,
        );

        const restampButtons = await screen.findAllByRole('button', {
            name: 'Use git version on next deploy',
        });
        expect(restampButtons).toHaveLength(3);
        expect(restampButtons[0]).toBeDisabled();
        expect(restampButtons[1]).toBeDisabled();
        expect(restampButtons[2]).toBeDisabled();
    });
});
