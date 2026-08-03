import { MantineProvider } from '@mantine-8/core';
import { render, screen } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminHomepageControls } from './AdminHomepageControls';

vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock('../../../providers/Ability', () => ({
    Can: ({ children }: PropsWithChildren) => children,
}));

const { settings } = vi.hoisted(() => ({
    settings: {
        current: { enabled: false, opening: null } as {
            enabled: boolean;
            opening: 'ask-first' | 'content-first' | null;
        },
    },
}));

vi.mock('./hooks/useOrgHomepageSettings', () => ({
    useOrgHomepageSettings: () => ({ data: settings.current }),
    useUpdateOrgHomepageSettings: () => ({
        mutate: vi.fn(),
        isLoading: false,
    }),
}));

const renderControls = () =>
    render(
        <MantineProvider>
            <AdminHomepageControls
                projectUuid="project-1"
                organizationUuid="organization-1"
            />
        </MantineProvider>,
    );

describe('AdminHomepageControls', () => {
    beforeEach(() => {
        settings.current = { enabled: false, opening: null };
    });

    it('only renders homepage curation controls', () => {
        const { container } = renderControls();

        const customizeButton = screen.getByRole('button', {
            name: 'Customize homepage',
        });

        expect(customizeButton).toBeInTheDocument();
        expect(container).not.toHaveTextContent('Deep research');
        expect(
            container.querySelector('[data-deep-research-control-target]'),
        ).not.toBeInTheDocument();
    });

    it('hides the switch-back control for flag-enabled orgs (no opt-in row)', () => {
        renderControls();

        expect(
            screen.queryByRole('button', {
                name: 'Switch back to classic homepage',
            }),
        ).toBeNull();
    });

    it('offers switch-back when the org opted in via settings', () => {
        settings.current = { enabled: true, opening: 'content-first' };
        renderControls();

        expect(
            screen.getByRole('button', {
                name: 'Switch back to classic homepage',
            }),
        ).toBeInTheDocument();
    });
});
