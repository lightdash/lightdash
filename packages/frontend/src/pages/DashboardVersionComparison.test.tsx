import {
    type Dashboard,
    type DashboardControlSection,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../testing/testUtils';
import DashboardVersionComparison from './DashboardVersionComparison';

const state = vi.hoisted(() => ({
    enabled: true,
    version: null as unknown,
}));
vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: state.enabled } }),
}));
vi.mock('../hooks/dashboard/useDashboard', () => ({
    useDashboardVersion: () => ({
        data: {
            versionUuid: 'old',
            createdAt: new Date('2026-10-01'),
            createdBy: null,
            dashboard: state.version,
            chartVersionDifferences: [],
        },
        isLoading: false,
        error: null,
    }),
}));

const dashboardWith = (
    versionUuid: string,
    controlSections: DashboardControlSection[],
) =>
    ({
        versionUuid,
        tiles: [],
        filters: { dimensions: [], metrics: [], tableCalculations: [] },
        config: { isDateZoomDisabled: false, controlSections },
    }) as unknown as Dashboard;

const renderComparison = () =>
    renderWithProviders(
        <DashboardVersionComparison
            dashboard={dashboardWith('current', [{ id: 'a', name: 'Geo' }])}
            dashboardUuid="dashboard"
            projectUuid="project"
            versionUuid="old"
        />,
    );

describe('DashboardVersionComparison filter sections', () => {
    beforeEach(() => {
        state.version = dashboardWith('old', [{ id: 'a', name: 'Place' }]);
    });

    it('shows section changes with the flag on', () => {
        state.enabled = true;
        renderComparison();
        expect(screen.getByText('Filter sections')).toBeInTheDocument();
        expect(screen.getAllByText('1 change').length).toBeGreaterThan(0);
    });

    it('shows nothing new with the flag off', () => {
        state.enabled = false;
        renderComparison();
        expect(screen.getByText('Filters')).toBeInTheDocument();
        expect(screen.queryByText('Filter sections')).not.toBeInTheDocument();
    });
});
