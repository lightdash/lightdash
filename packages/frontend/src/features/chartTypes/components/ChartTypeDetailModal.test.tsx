import {
    type DataAppViz,
    type OrganizationDataAppViz,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import type * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../../../testing/testUtils';
import { useAppVersionHistory } from '../../apps/hooks/useAppVersionHistory';
import { useCanCreateDataApp } from '../../apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../../apps/hooks/useCanEditDataApp';
import { useCanManageOrganizationChartTypes } from '../hooks/useOrganizationLibraryAccess';
import ChartTypeDetailModal from './ChartTypeDetailModal';

vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useNavigate: () => vi.fn(),
}));
vi.mock('../../apps/hooks/useCanEditDataApp', () => ({
    useCanEditDataApp: vi.fn(),
}));
vi.mock('../../apps/hooks/useCanCreateDataApp', () => ({
    useCanCreateDataApp: vi.fn(),
}));
vi.mock('../../apps/hooks/useAppVersionHistory', () => ({
    useAppVersionHistory: vi.fn(),
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

const organizationViz: OrganizationDataAppViz = {
    ...viz,
    organizationUuid: 'org-1',
    projectUuid: null,
    spaceUuid: null,
    registrySlug: null,
};

const renderModal = (dataAppViz: DataAppViz | OrganizationDataAppViz = viz) =>
    renderWithProviders(
        <MemoryRouter>
            <ChartTypeDetailModal
                opened
                projectUuid="project-1"
                dataAppViz={dataAppViz}
                isActive
                registryEntry={null}
                onClose={vi.fn()}
                onPreview={dataAppViz.projectUuid === null ? null : vi.fn()}
                onDelete={vi.fn()}
            />
        </MemoryRouter>,
    );

describe('ChartTypeDetailModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useCanCreateDataApp).mockReturnValue(true);
        vi.mocked(useCanManageOrganizationChartTypes).mockReturnValue(false);
        vi.mocked(useAppVersionHistory).mockReturnValue({
            latestReadyVersion: null,
            oldest: null,
            latest: null,
            hasOrigin: false,
        } as unknown as ReturnType<typeof useAppVersionHistory>);
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { enabled: true },
        } as ReturnType<typeof useServerFeatureFlag>);
    });

    it('offers Edit when the user can manage the chart type', async () => {
        vi.mocked(useCanEditDataApp).mockReturnValue(true);
        renderModal();

        expect(
            await screen.findByRole('link', { name: 'Edit' }),
        ).toBeInTheDocument();
    });

    it('hides Edit when the user cannot manage the chart type', async () => {
        vi.mocked(useCanEditDataApp).mockReturnValue(false);
        renderModal();

        expect(
            await screen.findByRole('button', { name: 'Preview in explorer' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Edit' }),
        ).not.toBeInTheDocument();
    });

    describe('organization chart types', () => {
        beforeEach(() => {
            vi.mocked(useCanEditDataApp).mockReturnValue(true);
        });

        it('is read-only for users who cannot manage them', () => {
            renderModal(organizationViz);

            expect(screen.getByText('Radial gauge')).toBeInTheDocument();
            for (const name of ['Delete', 'Preview in explorer']) {
                expect(
                    screen.queryByRole('button', { name }),
                ).not.toBeInTheDocument();
            }
            expect(
                screen.queryByRole('link', { name: 'Edit' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Fork to customize' }),
            ).not.toBeInTheDocument();
            expect(useAppVersionHistory).toHaveBeenCalledWith(
                'project-1',
                'viz-1',
                'organization',
            );
        });

        it('offers Edit in the organization builder and Delete to managers', () => {
            vi.mocked(useCanManageOrganizationChartTypes).mockReturnValue(true);
            renderModal(organizationViz);

            expect(
                screen.getByRole('button', { name: 'Delete' }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Preview in explorer' }),
            ).not.toBeInTheDocument();
            expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
                'href',
                '/projects/project-1/chart-studio/organization/radial-gauge',
            );
        });
    });
});
