import { ContentType } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { ComposerChartDeleteModal } from './ComposerChartDeleteModal';

const mocks = vi.hoisted(() => ({
    mutate: vi.fn(),
    dashboards: {} as {
        isSuccess: boolean;
        isError: boolean;
        isFetching: boolean;
        data?: { uuid: string; name: string }[];
    },
}));
vi.mock('../hooks/useComposerChartDashboards', () => ({
    useComposerChartDashboards: () => mocks.dashboards,
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
        mocks.dashboards = {
            isSuccess: true,
            isError: false,
            isFetching: false,
            data: [{ uuid: 'dashboard', name: 'Sales' }],
        };
        renderModal(true);
        expect(
            await screen.findByText(
                'This chart will be moved to Recently deleted and permanently removed after 30 days.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Tiles on 1 dashboard will show the chart as deleted. The chart can be restored from Recently deleted.',
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

    it('blocks the delete while the dashboards that show the chart are unknown', async () => {
        mocks.dashboards = {
            isSuccess: false,
            isError: true,
            isFetching: false,
        };
        renderModal(true);
        expect(
            await screen.findByText(
                'Could not load the dashboards that show this chart. Close and try again.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    });
});
