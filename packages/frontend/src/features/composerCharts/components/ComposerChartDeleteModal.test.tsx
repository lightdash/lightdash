import { ContentType } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { ComposerChartDeleteModal } from './ComposerChartDeleteModal';

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('../hooks/useComposerChartDashboards', () => ({
    useComposerChartDashboards: () => ({
        isInitialLoading: false,
        data: [{ uuid: 'dashboard', name: 'Sales', slug: 'sales' }],
    }),
}));
vi.mock('../../../hooks/useContent', () => ({
    useContentAction: () => ({ mutate: mocks.mutate, isLoading: false }),
}));

const renderModal = (softDeleteEnabled: boolean) =>
    renderWithProviders(
        <MemoryRouter>
            <ComposerChartDeleteModal
                opened
                onClose={vi.fn()}
                projectUuid="project"
                composerChartUuid="chart"
                name="Orders"
            />
        </MemoryRouter>,
        {
            health: {
                softDelete: { enabled: softDeleteEnabled, retentionDays: 30 },
            },
        },
    );

describe('ComposerChartDeleteModal', () => {
    it('names the dashboards showing the chart and deletes it through the content API', async () => {
        renderModal(true);
        expect(
            await screen.findByText(
                'This chart tile will be removed from 1 dashboard. The chart can be restored from Recently deleted.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Sales' })).toHaveAttribute(
            'href',
            '/projects/project/dashboards/dashboard',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(mocks.mutate).toHaveBeenCalledWith({
            action: { type: 'delete' },
            item: { contentType: ContentType.COMPOSER_CHART, uuid: 'chart' },
        });
    });

    it('says the tile goes for good with soft delete off', async () => {
        renderModal(false);
        expect(
            await screen.findByText(
                'This action will permanently remove a chart tile from 1 dashboard:',
            ),
        ).toBeInTheDocument();
    });
});
