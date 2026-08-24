import { OrganizationMemberRole } from '@lightdash/common';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { emptyRollup } from '../../model';
import { entry } from '../testFixtures';
import { LearnBoardPanel } from './LearnBoardPanel';

const navigate = vi.fn();
vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof ReactRouter>('react-router');
    return {
        ...actual,
        useNavigate: () => navigate,
        useParams: () => ({ projectUuid: 'project-1' }),
    };
});

const catalogue = [
    entry({
        id: 'foundation',
        title: 'Getting around',
        scope: 'view:Project',
        lessonCount: 2,
    }),
    entry({
        id: 'dashboards',
        title: 'Building dashboards',
        scope: 'manage:Dashboard',
        lessonCount: 2,
    }),
];

vi.mock('../../hooks', () => ({
    useLearnCatalogue: () => ({
        data: { generatedAt: '2026-08-01T00:00:00.000Z', courses: catalogue },
        isLoading: false,
        isError: false,
    }),
    useLearnRollups: () => ({
        rollups: new Map([
            [
                'foundation',
                {
                    ...emptyRollup(),
                    started: true,
                    lessonsCompleted: new Set(['l1']),
                },
            ],
        ]),
        isLoading: false,
        serverSynced: false,
    }),
    useLearnCourse: () => ({
        data: {
            id: 'dashboards',
            lessons: [
                { id: 'l1', title: 'Anatomy of a dashboard', html: '' },
                { id: 'l2', title: 'Filter a dashboard', html: '' },
            ],
        },
        isError: false,
    }),
}));

describe('LearnBoardPanel', () => {
    beforeEach(() => navigate.mockClear());

    it('defaults to the org role and lights only the held modules', async () => {
        renderWithProviders(<LearnBoardPanel />, {
            user: { role: OrganizationMemberRole.VIEWER },
        });
        await waitFor(() =>
            expect(screen.getByRole('tab', { name: 'viewer' })).toHaveAttribute(
                'aria-selected',
                'true',
            ),
        );
        expect(
            screen.getByText(/Everything your viewer role unlocks/),
        ).toBeInTheDocument();
        // Locked nodes leave the accessibility tree, so query the DOM directly.
        const locked = screen
            .getByTestId('learn-board')
            .querySelector('[aria-label^="Building dashboards"]');
        expect(locked).toHaveAttribute('tabindex', '-1');
        expect(locked).toHaveAttribute('aria-hidden', 'true');
        expect(locked).toBeDisabled();
    });

    it('reads the org role once the user query resolves, even when it differs from the pre-resolution fallback', async () => {
        renderWithProviders(<LearnBoardPanel />, {
            user: { role: OrganizationMemberRole.ADMIN },
        });
        // Renders on the VIEWER fallback first, since `user` is still
        // resolving; only settles on the admin tab once that query lands.
        await waitFor(() =>
            expect(screen.getByRole('tab', { name: 'admin' })).toHaveAttribute(
                'aria-selected',
                'true',
            ),
        );
        expect(
            screen.getByText(/Everything your admin role unlocks/),
        ).toBeInTheDocument();
    });

    it('switching role unlocks more modules and selecting one opens the pane', async () => {
        renderWithProviders(<LearnBoardPanel />, {
            user: { role: OrganizationMemberRole.VIEWER },
        });
        expect(await screen.findAllByRole('tab')).toHaveLength(5);
        fireEvent.click(await screen.findByRole('tab', { name: 'editor' }));
        const node = within(screen.getByTestId('learn-board')).getByRole(
            'button',
            { name: /Building dashboards/ },
        );
        await waitFor(() => expect(node).toHaveAttribute('tabindex', '0'));
        fireEvent.click(node);
        expect(screen.getByText('manage:Dashboard')).toBeInTheDocument();
        expect(screen.getByText(/Anatomy of a dashboard/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Start module' }));
        expect(navigate).toHaveBeenCalledWith(
            '/projects/project-1/learn/courses/dashboards',
        );
    });

    it('switching role clears the open module pane', async () => {
        renderWithProviders(<LearnBoardPanel />, {
            user: { role: OrganizationMemberRole.VIEWER },
        });
        fireEvent.click(await screen.findByRole('tab', { name: 'editor' }));
        const node = within(screen.getByTestId('learn-board')).getByRole(
            'button',
            { name: /Building dashboards/ },
        );
        await waitFor(() => expect(node).toHaveAttribute('tabindex', '0'));
        fireEvent.click(node);
        expect(
            screen.getByRole('button', { name: 'Close' }),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'admin' }));
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'Close' }),
            ).not.toBeInTheDocument(),
        );
        expect(
            screen.getByText('Pick up where you left off'),
        ).toBeInTheDocument();
    });
});
