import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { MainNavBarContent } from './MainNavBarContent';

vi.mock('./useCompactNavigation', () => ({
    useCompactNavigation: () => true,
}));

vi.mock('../../features/metricsCatalog/hooks/useMetricsCatalog', () => ({
    useHasMetricsInCatalog: () => ({ data: false }),
}));

vi.mock('../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => ({ projectUrlIdentifier: 'jaffle-shop' }),
}));

vi.mock('../../providers/App/useApp', () => ({
    default: () => ({ health: { data: { headway: { enabled: false } } } }),
}));

vi.mock('../../features/omnibar', () => ({
    default: () => <button type="button">Search</button>,
}));

vi.mock('./AiAgentsButton', () => ({
    AiAgentsButton: () => <button type="button">Ask AI</button>,
}));

vi.mock('./ProjectSwitcher', () => ({
    default: () => <button type="button">Switch project</button>,
}));

vi.mock('./UserMenu', () => ({
    default: ({ withLabel }: { withLabel?: boolean }) => (
        <button type="button">{withLabel ? 'Account' : 'Avatar'}</button>
    ),
}));

vi.mock('./ExploreMenu', () => ({ default: () => null }));
vi.mock('./BrowseMenu', () => ({ default: () => null }));
vi.mock('./SettingsMenu', () => ({ default: () => null }));
vi.mock('./HelpMenu', () => ({ default: () => null }));
vi.mock('./HeadwayMenuItem', () => ({ default: () => null }));
vi.mock('./UserCredentialsSwitcher', () => ({ default: () => null }));
vi.mock('./AutopilotNavButton', () => ({ AutopilotNavButton: () => null }));
vi.mock('./MetricsLink', () => ({ MetricsLink: () => null }));
vi.mock('./NotificationsMenu', () => ({ NotificationsMenu: () => null }));
vi.mock('../../features/learn/LearnLink', () => ({ LearnLink: () => null }));

describe('MainNavBarContent compact navigation', () => {
    it('keeps project and account controls in the navigation drawer', async () => {
        render(
            <MantineProvider env="test">
                <MemoryRouter>
                    <div id="navbar-header">
                        <MainNavBarContent
                            activeProjectUuid="project-1"
                            activeProjectUrlIdentifier="jaffle-shop"
                            isLoadingActiveProject={false}
                        />
                    </div>
                </MemoryRouter>
            </MantineProvider>,
        );

        expect(screen.getByRole('button', { name: 'Search' })).toBeVisible();
        expect(
            await screen.findByRole('button', { name: 'Ask AI' }),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Switch project' }),
        ).toBeNull();
        expect(screen.queryByRole('button', { name: 'Avatar' })).toBeNull();

        fireEvent.click(
            screen.getByRole('button', { name: 'Open navigation' }),
        );

        expect(
            await screen.findByRole('button', { name: 'Switch project' }),
        ).toBeVisible();
        expect(screen.getByRole('button', { name: 'Account' })).toBeVisible();
    });
});
