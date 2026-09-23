import { type DataAppViz } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../../../testing/testUtils';
import { useCanEditDataApp } from '../../apps/hooks/useCanEditDataApp';
import ChartTypeGalleryCard from './ChartTypeGalleryCard';

vi.mock('../../apps/hooks/useCanEditDataApp', () => ({
    useCanEditDataApp: vi.fn(),
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
            hasRegistryUpdate={false}
            onClick={vi.fn()}
            onPreview={vi.fn()}
            onDelete={vi.fn()}
        />,
    );

describe('ChartTypeGalleryCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useCanEditDataApp).mockReturnValue(true);
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
});
