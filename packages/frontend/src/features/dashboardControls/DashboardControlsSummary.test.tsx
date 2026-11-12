import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { DashboardControlsSummary } from './DashboardControlsSummary';
import { useNamedDateZoomCount } from './useDateZoomBar';

vi.mock('./useDateZoomBar', () => ({ useNamedDateZoomCount: vi.fn() }));

const renderSummary = (isControlsEnabled: boolean) =>
    renderWithProviders(
        <DashboardControlsSummary
            isControlsEnabled={isControlsEnabled}
            filtersCount={2}
            parametersCount={0}
            dateZoomLabel={null}
            onExpand={vi.fn()}
        />,
    );

describe('DashboardControlsSummary', () => {
    beforeEach(() => {
        vi.mocked(useNamedDateZoomCount).mockReset().mockReturnValue(3);
    });

    it('counts the named date zooms with the controls on', () => {
        renderSummary(true);
        expect(screen.getByText(/date zooms/)).toBeInTheDocument();
        expect(useNamedDateZoomCount).toHaveBeenCalled();
    });

    it('shows no count and never reads the date zooms with the controls off', () => {
        renderSummary(false);
        expect(screen.queryByText(/date zoom/)).not.toBeInTheDocument();
        expect(useNamedDateZoomCount).not.toHaveBeenCalled();
    });
});
