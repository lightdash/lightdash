import { type DashboardBuildResult } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import DashboardResultView from './DashboardResultView';

const result: DashboardBuildResult = {
    dashboardUuid: 'dash-1',
    dashboardSlug: 'starter-dashboard',
    spaceUuid: 'space-1',
    chartCount: 4,
    warnings: ['We left out Avg order value — no revenue metric was found.'],
    builtAt: '2026-07-14T00:00:00.000Z',
};

describe('DashboardResultView', () => {
    it('celebrates, renders warnings and fires both actions', () => {
        const onOpenDashboard = vi.fn();
        const onExplore = vi.fn();
        renderWithProviders(
            <DashboardResultView
                result={result}
                onOpenDashboard={onOpenDashboard}
                onExplore={onExplore}
            />,
        );

        expect(
            screen.getByText(/every number traces back to a metric/i),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'We left out Avg order value — no revenue metric was found.',
            ),
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole('button', { name: 'Open my dashboard' }),
        );
        expect(onOpenDashboard).toHaveBeenCalledTimes(1);

        fireEvent.click(
            screen.getByRole('button', { name: 'Explore from here' }),
        );
        expect(onExplore).toHaveBeenCalledTimes(1);
    });

    it('renders without warnings', () => {
        renderWithProviders(
            <DashboardResultView
                result={{ ...result, warnings: [] }}
                onOpenDashboard={vi.fn()}
                onExplore={vi.fn()}
            />,
        );
        expect(
            screen.getByRole('button', { name: 'Open my dashboard' }),
        ).toBeInTheDocument();
    });
});
