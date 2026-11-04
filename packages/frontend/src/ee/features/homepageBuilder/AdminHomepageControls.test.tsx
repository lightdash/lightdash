import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminHomepageControls } from './AdminHomepageControls';

vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock('../../../providers/Ability', () => ({
    Can: ({ children }: PropsWithChildren) => children,
}));

const { authoringEnabled, settings, mutate } = vi.hoisted(() => ({
    authoringEnabled: { current: true },
    mutate: vi.fn(),
    settings: {
        current: { enabled: false, opening: null } as {
            enabled: boolean;
            opening: 'ask-first' | 'content-first' | null;
        },
    },
}));

vi.mock('../../../hooks/useContentAuthoringEnabled', () => ({
    useContentAuthoringEnabled: () => authoringEnabled.current,
}));

vi.mock('./hooks/useOrgHomepageSettings', () => ({
    useOrgHomepageSettings: () => ({ data: settings.current }),
    useHomepageOpening: () => ({
        opening: 'content-first',
        canAskAi: false,
        isLoading: false,
    }),
    useUpdateOrgHomepageSettings: () => ({
        mutate,
        isLoading: false,
    }),
}));

const renderControls = ({ withPageRoot = false } = {}) =>
    render(
        <MantineProvider env="test">
            {withPageRoot ? (
                <div id="page-root" data-testid="page-root">
                    <AdminHomepageControls
                        projectUuid="project-1"
                        organizationUuid="organization-1"
                    />
                </div>
            ) : (
                <AdminHomepageControls
                    projectUuid="project-1"
                    organizationUuid="organization-1"
                />
            )}
        </MantineProvider>,
    );

describe('AdminHomepageControls', () => {
    beforeEach(() => {
        authoringEnabled.current = true;
        settings.current = { enabled: false, opening: null };
        mutate.mockReset();
        localStorage.clear();
    });

    it('shows the default-on notice once to admins whose org never chose an opening', () => {
        settings.current = { enabled: true, opening: null };
        const { unmount } = renderControls();

        expect(
            screen.getByText('Your homepage has a new look'),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
        expect(
            screen.queryByText('Your homepage has a new look'),
        ).not.toBeInTheDocument();

        unmount();
        renderControls();
        expect(
            screen.queryByText('Your homepage has a new look'),
        ).not.toBeInTheDocument();
    });

    it('offers auto as a third choice and clears the explicit opening', () => {
        settings.current = { enabled: true, opening: 'content-first' };
        renderControls();

        fireEvent.click(
            screen.getByRole('button', { name: 'Homepage opening' }),
        );
        fireEvent.click(screen.getByRole('button', { name: /^Auto/ }));

        expect(mutate).toHaveBeenCalledWith({ enabled: true, opening: null });
    });

    it('does not show the notice when the org already chose an opening', () => {
        settings.current = { enabled: true, opening: 'ask-first' };
        renderControls();

        expect(
            screen.queryByText('Your homepage has a new look'),
        ).not.toBeInTheDocument();
    });

    it('lets org admins change the opening without touching enablement', () => {
        settings.current = { enabled: true, opening: 'ask-first' };
        renderControls();

        fireEvent.click(
            screen.getByRole('button', { name: 'Homepage opening' }),
        );
        fireEvent.click(screen.getByRole('button', { name: /Content first/ }));

        expect(mutate).toHaveBeenCalledWith({
            enabled: true,
            opening: 'content-first',
        });
    });

    it('only renders homepage curation controls', () => {
        const { container } = renderControls();

        const customizeButton = screen.getByRole('button', {
            name: 'Customize homepage',
        });

        expect(customizeButton).toBeInTheDocument();
        expect(container).not.toHaveTextContent('Deep research');
    });

    it('hides the switch-back control while the homepage is off', () => {
        renderControls();

        expect(
            screen.queryByRole('button', {
                name: 'Switch back to classic homepage',
            }),
        ).toBeNull();
    });

    it('offers switch-back while the homepage is on', () => {
        settings.current = { enabled: true, opening: 'content-first' };
        renderControls();

        expect(
            screen.getByRole('button', {
                name: 'Switch back to classic homepage',
            }),
        ).toBeInTheDocument();
    });

    it('hides homepage controls when authoring is unavailable on phones', () => {
        authoringEnabled.current = false;
        renderControls();

        expect(
            screen.queryByRole('button', { name: 'Customize homepage' }),
        ).toBeNull();
    });

    it('marks controls as hidden after the page scrolls', () => {
        renderControls({ withPageRoot: true });
        const pageRoot = screen.getByTestId('page-root');
        const controls = screen
            .getByRole('button', { name: 'Customize homepage' })
            .closest('[data-page-scrolled]');

        expect(controls).toHaveAttribute('data-page-scrolled', 'false');

        act(() => {
            Object.defineProperty(pageRoot, 'scrollTop', {
                configurable: true,
                value: 24,
            });
            fireEvent.scroll(pageRoot);
        });

        expect(controls).toHaveAttribute('data-page-scrolled', 'true');
    });
});
