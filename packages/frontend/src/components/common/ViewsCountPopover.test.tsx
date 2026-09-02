import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import ViewsCountPopover from './ViewsCountPopover';

vi.mock('../EChartsReactWrapper', () => ({
    default: () => <div data-testid="views-sparkline" />,
}));

const viewTrend = {
    granularity: 'day' as const,
    points: Array.from({ length: 30 }, (_, index) => ({
        date: `2026-08-${String(index + 1).padStart(2, '0')}`,
        views: index === 29 ? 5 : 0,
    })),
};

vi.mock('../../hooks/chart/useChartViewStats', () => ({
    useChartViewStats: (
        chartUuid: string | undefined,
        options: { enabled: boolean },
    ) => ({
        data:
            chartUuid && options.enabled
                ? {
                      views: 12,
                      uniqueViewerCount: 4,
                      anonymousViewCount: 2,
                      firstViewedAt: '2026-08-28T10:12:00.000Z',
                      viewTrend,
                  }
                : undefined,
    }),
}));

vi.mock('../../hooks/dashboard/useDashboardViewStats', () => ({
    useDashboardViewStats: () => ({ data: undefined }),
}));

describe('ViewsCountPopover', () => {
    it('shows the 30-day trend and all-time statistics on hover', async () => {
        renderWithProviders(
            <ViewsCountPopover
                resourceType="chart"
                resourceUuid="chart-uuid"
                projectUuid="project-uuid"
                views={12}
            >
                12 views
            </ViewsCountPopover>,
        );

        await userEvent.hover(screen.getByText('12 views'));

        expect(await screen.findByText('Last 30 days')).toBeVisible();
        expect(screen.getByText('5 views')).toBeVisible();
        expect(screen.getByTestId('views-sparkline')).toBeInTheDocument();
        expect(screen.getByText('Unique viewers')).toBeVisible();
        expect(screen.getByText('4')).toBeVisible();
        expect(screen.getByText('Aug 28, 2026')).toBeVisible();
        expect(screen.getByText(/Includes 2 anonymous views/)).toBeVisible();
    });

    it('falls back to a plain tooltip when there are no per-user events', async () => {
        renderWithProviders(
            <ViewsCountPopover
                resourceType={undefined}
                resourceUuid="sql-chart-uuid"
                projectUuid="project-uuid"
                views={3}
                fallbackTooltip="3 views since Aug 1, 2026"
            >
                3 views
            </ViewsCountPopover>,
        );

        await userEvent.hover(screen.getByText('3 views'));

        expect(
            await screen.findByText('3 views since Aug 1, 2026'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Last 30 days')).not.toBeInTheDocument();
    });

    it('does not open a card for resources with zero views', async () => {
        renderWithProviders(
            <ViewsCountPopover
                resourceType="chart"
                resourceUuid="chart-uuid"
                projectUuid="project-uuid"
                views={0}
            >
                0 views
            </ViewsCountPopover>,
        );

        await userEvent.hover(screen.getByText('0 views'));

        expect(screen.queryByText('Last 30 days')).not.toBeInTheDocument();
    });
});
