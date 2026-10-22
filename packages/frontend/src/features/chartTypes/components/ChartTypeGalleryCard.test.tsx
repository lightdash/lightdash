import { type DataAppViz } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { useCanEditDataApp } from '../../apps/hooks/useCanEditDataApp';
import { useChartStudioAvailable } from '../hooks/useChartStudioAvailable';
import ChartTypeGalleryCard from './ChartTypeGalleryCard';

vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useNavigate: () => vi.fn(),
}));
vi.mock('../../apps/hooks/useCanEditDataApp', () => ({
    useCanEditDataApp: vi.fn(),
}));
vi.mock('../hooks/useChartStudioAvailable');
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
        <MemoryRouter>
            <ChartTypeGalleryCard
                dataAppViz={{ ...viz, registrySlug }}
                hasRegistryUpdate={false}
                onClick={vi.fn()}
                onPreview={vi.fn()}
                onDelete={vi.fn()}
            />
        </MemoryRouter>,
    );

describe('ChartTypeGalleryCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useCanEditDataApp).mockReturnValue(true);
        vi.mocked(useChartStudioAvailable).mockReturnValue(false);
    });

    it('offers Edit for a custom chart type when Chart Studio is available', () => {
        vi.mocked(useChartStudioAvailable).mockReturnValue(true);
        renderCard(null);

        expect(
            screen.getByRole('link', { name: 'Edit Radial gauge' }),
        ).toHaveAttribute(
            'href',
            '/projects/project-1/chart-studio/radial-gauge',
        );
    });

    it('hides Edit for a custom chart type without Chart Studio', () => {
        renderCard(null);

        expect(
            screen.queryByRole('link', { name: 'Edit Radial gauge' }),
        ).not.toBeInTheDocument();
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
});
