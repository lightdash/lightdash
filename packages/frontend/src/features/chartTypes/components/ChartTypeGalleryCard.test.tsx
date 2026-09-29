import {
    type DataAppViz,
    type OrganizationDataAppViz,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../../../testing/testUtils';
import { useCanEditDataApp } from '../../apps/hooks/useCanEditDataApp';
import { useCanManageOrganizationChartTypes } from '../hooks/useOrganizationLibraryAccess';
import ChartTypeGalleryCard from './ChartTypeGalleryCard';

vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useNavigate: () => vi.fn(),
}));
vi.mock('../../apps/hooks/useCanEditDataApp', () => ({
    useCanEditDataApp: vi.fn(),
}));
vi.mock('../hooks/useOrganizationLibraryAccess', () => ({
    useCanManageOrganizationChartTypes: vi.fn(),
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));
vi.mock('./ChartTypeSamplePreview', () => ({
    default: () => <div />,
}));

const viz: DataAppViz = {
    dataAppVizUuid: 'viz-1',
    slug: 'radial-gauge',
    name: 'Radial gauge',
    description: '',
    projectUuid: 'project-1',
    spaceUuid: null,
    schema: null,
    icon: null,
    createdAt: new Date(),
    createdByUserUuid: 'user-1',
    registrySlug: null,
};

const renderCard = (registrySlug: string | null) =>
    renderWithProviders(
        <ChartTypeGalleryCard
            dataAppViz={{ ...viz, registrySlug }}
            projectUuid="project-1"
            hasRegistryUpdate={false}
            onClick={vi.fn()}
            onPreview={vi.fn()}
            onDelete={vi.fn()}
        />,
    );

const organizationViz: OrganizationDataAppViz = {
    ...viz,
    organizationUuid: 'org-1',
    projectUuid: null,
    spaceUuid: null,
    registrySlug: null,
};

const renderOrganizationCard = () =>
    renderWithProviders(
        <ChartTypeGalleryCard
            dataAppViz={organizationViz}
            projectUuid="project-1"
            hasRegistryUpdate={false}
            onClick={vi.fn()}
            onPreview={null}
            onDelete={vi.fn()}
        />,
    );

describe('ChartTypeGalleryCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useCanEditDataApp).mockReturnValue(true);
        vi.mocked(useCanManageOrganizationChartTypes).mockReturnValue(false);
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { enabled: false },
        } as ReturnType<typeof useServerFeatureFlag>);
    });

    it('offers Uninstall for an official chart type', async () => {
        renderCard('radial-gauge');

        await userEvent.click(
            screen.getByRole('button', { name: 'Actions for Radial gauge' }),
        );

        expect(
            await screen.findByRole('menuitem', { name: 'Uninstall' }),
        ).toBeInTheDocument();
    });

    it('offers Delete for a custom chart type', async () => {
        renderCard(null);

        await userEvent.click(
            screen.getByRole('button', { name: 'Actions for Radial gauge' }),
        );

        expect(
            await screen.findByRole('menuitem', { name: 'Delete' }),
        ).toBeInTheDocument();
    });

    describe('organization chart types', () => {
        beforeEach(() => {
            // Data apps on, so any authoring action would render if allowed.
            vi.mocked(useServerFeatureFlag).mockReturnValue({
                data: { enabled: true },
            } as ReturnType<typeof useServerFeatureFlag>);
        });

        it('shows no actions to users who cannot manage them', () => {
            renderOrganizationCard();

            expect(screen.getByText('Radial gauge')).toBeInTheDocument();
            expect(
                screen.queryByRole('button', {
                    name: 'Actions for Radial gauge',
                }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('link', { name: 'Edit Radial gauge' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Fork Radial gauge' }),
            ).not.toBeInTheDocument();
        });

        it('offers only Delete to managers', async () => {
            vi.mocked(useCanManageOrganizationChartTypes).mockReturnValue(true);
            renderOrganizationCard();

            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Actions for Radial gauge',
                }),
            );

            expect(
                await screen.findByRole('menuitem', { name: 'Delete' }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('menuitem', {
                    name: 'Preview in explorer',
                }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('link', { name: 'Edit Radial gauge' }),
            ).not.toBeInTheDocument();
        });
    });
});
