import { type HomepageQuickAction } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QuickActionCards } from './QuickActionsBlock';

const { personalSpaceState } = vi.hoisted(() => ({
    personalSpaceState: {
        current: { data: null } as {
            data: { uuid: string; name: string; slug: string } | null;
        },
    },
}));

vi.mock('../../../../hooks/useSpaces', () => ({
    usePersonalSpace: () => personalSpaceState.current,
}));
vi.mock('../../../../hooks/useProjectRoute', () => ({
    useProjectUrlIdentifier: () => 'jaffle',
}));
vi.mock('../../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));
vi.mock('../hooks/useHomepageAiState', () => ({
    useHomepageAiState: () => ({ canAskAi: false }),
}));

const actions: HomepageQuickAction[] = [
    { type: 'run-query' },
    { type: 'my-space' },
];

const renderCards = (personalPlaceholders = false) =>
    render(
        <MantineProvider env="test">
            <MemoryRouter>
                <QuickActionCards
                    actions={actions}
                    projectUuid="p1"
                    personalPlaceholders={personalPlaceholders}
                />
            </MemoryRouter>
        </MantineProvider>,
    );

describe('QuickActionCards my-space', () => {
    beforeEach(() => {
        personalSpaceState.current = { data: null };
    });

    it('links to the viewer’s personal space when they have one', () => {
        personalSpaceState.current = {
            data: { uuid: 's-me', name: 'Me', slug: 'me' },
        };
        renderCards();
        expect(screen.getByRole('link', { name: 'My space' })).toHaveAttribute(
            'href',
            '/projects/jaffle/spaces/s-me',
        );
    });

    it('hides the chip when the viewer has no personal space', () => {
        renderCards();
        expect(screen.queryByText('My space')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Run a query' })).toBeVisible();
    });

    it('renders a non-link placeholder in view-as previews', () => {
        renderCards(true);
        expect(screen.getByText('My space')).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'My space' }),
        ).not.toBeInTheDocument();
    });
});
