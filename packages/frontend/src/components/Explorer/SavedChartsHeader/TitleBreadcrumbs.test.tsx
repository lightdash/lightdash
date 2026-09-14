import { type SpaceSummary } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import { renderWithProviders } from '../../../testing/testUtils';
import { TitleBreadCrumbs } from './TitleBreadcrumbs';

vi.mock('../../../hooks/useSpaces', () => ({ useSpaceSummaries: vi.fn() }));
vi.mock('../../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => ({ projectUrlIdentifier: 'project-slug' }),
}));

const setSpaces = (spaces: SpaceSummary[], isError = false) => {
    vi.mocked(useSpaceSummaries).mockReturnValue({
        data: spaces,
        isError,
    } as ReturnType<typeof useSpaceSummaries>);
};

const renderBreadcrumb = (dashboard = false) =>
    renderWithProviders(
        <MemoryRouter>
            <TitleBreadCrumbs
                projectUuid="project-uuid"
                spaceUuid="private-space"
                spaceName="Private space"
                {...(dashboard
                    ? {
                          dashboardUuid: 'dashboard-uuid',
                          dashboardSlug: 'dashboard-slug',
                          dashboardName: 'Dashboard',
                      }
                    : {})}
            />
        </MemoryRouter>,
    );

describe('TitleBreadCrumbs', () => {
    beforeEach(() => {
        setSpaces([]);
    });

    it('keeps an inaccessible parent name visible without a link', () => {
        renderBreadcrumb();
        expect(screen.getByText('Private space')).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Private space' }),
        ).not.toBeInTheDocument();
    });

    it('links to an accessible parent using the project route identifier', () => {
        setSpaces([{ uuid: 'private-space' } as SpaceSummary]);
        renderBreadcrumb();
        expect(
            screen.getByRole('link', { name: 'Private space' }),
        ).toHaveAttribute(
            'href',
            '/projects/project-slug/spaces/private-space',
        );
    });

    it('does not trust cached spaces when the access query fails', () => {
        setSpaces([{ uuid: 'private-space' } as SpaceSummary], true);
        renderBreadcrumb();
        expect(
            screen.queryByRole('link', { name: 'Private space' }),
        ).not.toBeInTheDocument();
    });

    it('preserves the owning dashboard link without linking the inaccessible space', () => {
        renderBreadcrumb(true);
        expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
            'href',
            '/projects/project-slug/dashboards/dashboard-slug',
        );
        expect(
            screen.queryByRole('link', { name: 'Private space' }),
        ).not.toBeInTheDocument();
    });
});
