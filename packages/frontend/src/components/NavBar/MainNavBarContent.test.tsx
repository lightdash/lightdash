import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MainNavBarContent } from './MainNavBarContent';

const mocks = vi.hoisted(() => ({
    useProjectNavigation: vi.fn(),
}));

vi.mock('./useCompactNavigation', () => ({
    useCompactNavigation: () => true,
}));

vi.mock('../../hooks/useProjectNavigation', () => ({
    useProjectNavigation: mocks.useProjectNavigation,
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
vi.mock('./ProjectCredentialsSwitcher', () => ({ default: () => null }));
vi.mock('./AutopilotNavButton', () => ({
    AutopilotNavButton: () => <button type="button">Autopilot</button>,
}));
vi.mock('./MetricsLink', () => ({
    MetricsLink: () => <button type="button">Metrics</button>,
}));
vi.mock('./NotificationsMenu', () => ({
    NotificationsMenu: () => <button type="button">Notifications</button>,
}));
vi.mock('../../features/learn/LearnLink', () => ({
    LearnLink: () => <button type="button">Learn</button>,
}));

const allItems = { metrics: true, askAi: true, autopilot: true, learn: true };

const renderNavBar = () =>
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

beforeEach(() => {
    mocks.useProjectNavigation.mockReturnValue({
        data: allItems,
        isInitialLoading: false,
    });
});

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

describe('MainNavBarContent project navigation', () => {
    it('renders always-on items without waiting for navigation', () => {
        mocks.useProjectNavigation.mockReturnValue({
            data: undefined,
            isInitialLoading: true,
        });
        renderNavBar();
        fireEvent.click(
            screen.getByRole('button', { name: 'Open navigation' }),
        );

        expect(screen.getByRole('button', { name: 'Search' })).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'Notifications' }),
        ).toBeVisible();
        for (const name of ['Metrics', 'Ask AI', 'Autopilot', 'Learn']) {
            expect(screen.queryByRole('button', { name })).toBeNull();
        }
    });

    it('renders the optional items navigation allows', async () => {
        mocks.useProjectNavigation.mockReturnValue({
            data: { ...allItems, askAi: false, learn: false },
            isInitialLoading: false,
        });
        renderNavBar();
        fireEvent.click(
            screen.getByRole('button', { name: 'Open navigation' }),
        );

        expect(
            await screen.findByRole('button', { name: 'Metrics' }),
        ).toBeVisible();
        expect(screen.getByRole('button', { name: 'Autopilot' })).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'Notifications' }),
        ).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Ask AI' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Learn' })).toBeNull();
    });

    it('still renders the always-on items when navigation fails', async () => {
        mocks.useProjectNavigation.mockReturnValue({
            data: undefined,
            isInitialLoading: false,
        });
        renderNavBar();
        fireEvent.click(
            screen.getByRole('button', { name: 'Open navigation' }),
        );

        expect(
            await screen.findByRole('button', { name: 'Notifications' }),
        ).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Metrics' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Ask AI' })).toBeNull();
    });
});
