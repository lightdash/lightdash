import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import ContentAsCodeSyncProposeActions from './ContentAsCodeSyncProposeActions';

const useContentAsCodeWriteBackStatus = vi.hoisted(() => vi.fn());

vi.mock('../hooks/useContentAsCodeWriteBackStatus', () => ({
    useContentAsCodeWriteBackStatus,
}));

const aheadItem = {
    contentType: 'dashboard' as const,
    slug: 'revenue',
    state: 'ahead' as const,
    appliedAt: new Date('2026-08-24T15:30:00.000Z'),
    contentHash: 'fff0001112223334',
    snapshot: { name: 'old revenue' },
    current: { name: 'new revenue' },
};

describe('ContentAsCodeSyncProposeActions', () => {
    it('shows propose when there is no open write-back PR', () => {
        useContentAsCodeWriteBackStatus.mockReturnValue({
            data: {
                kind: 'ok',
                status: {
                    contentType: 'dashboard',
                    slug: 'revenue',
                    syncEnabled: true,
                    writeBackEnabled: true,
                    state: 'ahead',
                    writeBack: {
                        prState: 'none',
                        prUrl: null,
                        prTitle: null,
                    },
                },
            },
            isInitialLoading: false,
        });

        renderWithProviders(
            <ContentAsCodeSyncProposeActions
                projectUuid="project-uuid"
                item={aheadItem}
                isProposeAvailable
                isProposing={false}
                onPropose={vi.fn()}
            />,
        );

        expect(
            screen.getByRole('button', { name: 'Propose to git' }),
        ).toBeVisible();
    });

    it('shows a merged write-back PR instead of propose', () => {
        useContentAsCodeWriteBackStatus.mockReturnValue({
            data: {
                kind: 'ok',
                status: {
                    contentType: 'dashboard',
                    slug: 'revenue',
                    syncEnabled: true,
                    writeBackEnabled: true,
                    state: 'ahead',
                    writeBack: {
                        prState: 'merged',
                        prUrl: 'https://example.com/pull/9',
                        prTitle: 'Update dashboard `revenue`',
                    },
                },
            },
            isInitialLoading: false,
        });

        renderWithProviders(
            <ContentAsCodeSyncProposeActions
                projectUuid="project-uuid"
                item={aheadItem}
                isProposeAvailable
                isProposing={false}
                onPropose={vi.fn()}
            />,
        );

        expect(
            screen.getByRole('button', {
                name: 'Merged, applies on the next deploy',
            }),
        ).toBeDisabled();
        expect(
            screen.queryByRole('button', { name: 'Propose to git' }),
        ).not.toBeInTheDocument();
    });

    it('links to an open write-back PR', () => {
        useContentAsCodeWriteBackStatus.mockReturnValue({
            data: {
                kind: 'ok',
                status: {
                    contentType: 'dashboard',
                    slug: 'revenue',
                    syncEnabled: true,
                    writeBackEnabled: true,
                    state: 'ahead',
                    writeBack: {
                        prState: 'open',
                        prUrl: 'https://example.com/pull/4',
                        prTitle: 'Update dashboard `revenue`',
                    },
                },
            },
            isInitialLoading: false,
        });

        renderWithProviders(
            <ContentAsCodeSyncProposeActions
                projectUuid="project-uuid"
                item={aheadItem}
                isProposeAvailable
                isProposing={false}
                onPropose={vi.fn()}
            />,
        );

        expect(
            screen.getByRole('link', { name: 'Open pull request' }),
        ).toHaveAttribute('href', 'https://example.com/pull/4');
        expect(
            screen.getByRole('button', { name: 'Propose to git' }),
        ).toBeVisible();
    });
});
