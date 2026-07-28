import { MantineProvider } from '@mantine-8/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DayOneHomepage } from './DayOneHomepage';

const { aiState } = vi.hoisted(() => ({
    aiState: { current: { canAskAi: true } },
}));

vi.mock('./hooks/useHomepageAiState', () => ({
    useHomepageAiState: () => ({ isLoading: false, ...aiState.current }),
}));

vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        user: { data: { firstName: 'Ada' } },
    }),
}));

vi.mock('./blocks/AskAiHeroBlock', () => ({
    AskAiHero: () => <div data-testid="ask-ai-hero" />,
}));

vi.mock('./blocks/QuickActionsBlock', () => ({
    QuickActionCards: () => <div data-testid="quick-actions" />,
}));

vi.mock('./blocks/FavoritesBlock', () => ({
    PersonalFavoritesBar: () => <div data-testid="favorites-bar" />,
}));

vi.mock('./blocks/ContentCard', () => ({
    ContentCard: () => <div data-testid="pinned-card" />,
}));

vi.mock('./hooks/useCollectionContent', () => ({
    useCollectionContent: () => ({ data: [{ uuid: 'pinned-1' }] }),
}));

vi.mock('./blocks/RecentBlock', () => ({
    RecentList: () => <div data-testid="recent-list" />,
}));

const renderHomepage = () =>
    render(
        <MantineProvider>
            <MemoryRouter>
                <DayOneHomepage
                    projectUuid="project-1"
                    pinnedItems={[]}
                />
            </MemoryRouter>
        </MantineProvider>,
    );

describe('DayOneHomepage', () => {
    beforeEach(() => {
        aiState.current = { canAskAi: true };
    });

    it('shows the Ask AI hero when AI agents are available', () => {
        renderHomepage();

        expect(screen.getByTestId('ask-ai-hero')).toBeInTheDocument();
        expect(screen.queryByText(/Good \w+, Ada/)).toBeNull();
        // Recently viewed is for everyone, agents or not
        expect(screen.getByTestId('recent-list')).toBeInTheDocument();
        expect(screen.getByTestId('favorites-bar')).toBeInTheDocument();
        expect(screen.getByTestId('pinned-card')).toBeInTheDocument();
    });

    it('shows the welcome variant with quick actions and recently viewed when AI is unavailable', () => {
        aiState.current = { canAskAi: false };
        renderHomepage();

        expect(screen.queryByTestId('ask-ai-hero')).toBeNull();
        expect(screen.getByText(/Good \w+, Ada/)).toBeInTheDocument();
        expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
        expect(screen.getByTestId('recent-list')).toBeInTheDocument();
        expect(screen.getByTestId('favorites-bar')).toBeInTheDocument();
        expect(screen.getByTestId('pinned-card')).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: /Set up an AI agent/ }),
        ).toBeNull();
    });
});
