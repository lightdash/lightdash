import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { DashboardControlsSummary } from './DashboardControlsSummary';
import { useNamedDateZoomCount } from './useDateZoomBar';

vi.mock('./useDateZoomBar', () => ({ useNamedDateZoomCount: vi.fn() }));

const renderSummary = (
    isControlsEnabled: boolean,
    dateZoomLabel: string | null = null,
) =>
    renderWithProviders(
        <DashboardControlsSummary
            isControlsEnabled={isControlsEnabled}
            filtersCount={2}
            parametersCount={0}
            dateZoomLabel={dateZoomLabel}
            onExpand={vi.fn()}
        />,
    );

describe('DashboardControlsSummary', () => {
    beforeEach(() => {
        vi.mocked(useNamedDateZoomCount).mockReset().mockReturnValue(3);
    });

    it('counts the named date zooms with the controls on, with no funnel', () => {
        const { container } = renderSummary(true);
        expect(screen.getByText(/date zooms/)).toBeInTheDocument();
        expect(useNamedDateZoomCount).toHaveBeenCalled();
        expect(container.querySelector('.tabler-icon-filter')).toBeNull();
    });

    it('reads as a controls bar with the controls on', () => {
        const { container } = renderSummary(true, 'Week');
        expect(
            screen.getByRole('button', { name: 'Show controls' }),
        ).toBeInTheDocument();
        expect(container).toHaveTextContent(/Default zoom\s+Week/);
        expect(container).not.toHaveTextContent('Date Zoom:');
    });

    it('keeps the funnel, "Show filters" and "Date Zoom:" with the controls off', () => {
        const { container } = renderSummary(false, 'Week');
        expect(container.querySelector('.tabler-icon-filter')).not.toBeNull();
        expect(
            screen.getByRole('button', { name: 'Show filters' }),
        ).toBeInTheDocument();
        expect(container).toHaveTextContent(/Date Zoom:\s+Week/);
    });

    it('shows no count and never reads the date zooms with the controls off', () => {
        renderSummary(false);
        expect(screen.queryByText(/date zoom/)).not.toBeInTheDocument();
        expect(useNamedDateZoomCount).not.toHaveBeenCalled();
    });
});
