import { ChartType } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import VisualizationCardOptions from './index';

const { mocks } = vi.hoisted(() => ({
    mocks: {
        chartType: 'table',
        dataAppsEnabled: true,
        canCreateApp: true,
        setChartType: vi.fn(),
        createProjectChartType: vi.fn(),
    },
}));

vi.mock('../../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        visualizationConfig: { chartType: mocks.chartType, chartConfig: {} },
        setChartType: mocks.setChartType,
        setCartesianType: vi.fn(),
        setStacking: vi.fn(),
        isLoading: false,
        resultsData: { rows: [{}] },
        pivotDimensions: undefined,
    }),
}));

vi.mock(
    '../../VisualizationConfigs/CustomChartType/useSelectProjectChartType',
    () => ({
        useCreateProjectChartType: () => mocks.createProjectChartType,
    }),
);

vi.mock('../../../features/apps/hooks/useCanCreateDataApp', () => ({
    useCanCreateDataApp: () => mocks.canCreateApp,
}));

vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: mocks.dataAppsEnabled } }),
}));

// The menu reads the project from the route, which this test does not mount.
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useParams: () => ({ projectUuid: 'project-1' }),
}));

const openMenuAndPickCustom = async () => {
    const user = userEvent.setup();
    renderWithProviders(<VisualizationCardOptions />);
    await user.click(screen.getByTestId('VisualizationCardOptions'));
    // The target button carries the same label once the chart is already on a
    // custom type, so the dropdown's entry is the last match.
    const entries = await screen.findAllByText('Custom');
    await user.click(entries[entries.length - 1]);
    // Wait out the menu's close transition, so its timer cannot fire after
    // the test environment is torn down.
    await waitFor(() =>
        expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
};

describe('VisualizationCardOptions — the Custom entry', () => {
    beforeEach(() => {
        mocks.chartType = 'table';
        mocks.dataAppsEnabled = true;
        mocks.canCreateApp = true;
        mocks.setChartType.mockClear();
        mocks.createProjectChartType.mockClear();
    });

    it('lands on the composer rather than Vega', async () => {
        await openMenuAndPickCustom();

        expect(mocks.createProjectChartType).toHaveBeenCalledTimes(1);
        expect(mocks.setChartType).not.toHaveBeenCalled();
    });

    it('falls back to Vega when data apps are off', async () => {
        mocks.dataAppsEnabled = false;

        await openMenuAndPickCustom();

        expect(mocks.setChartType).toHaveBeenCalledWith(ChartType.CUSTOM);
        expect(mocks.createProjectChartType).not.toHaveBeenCalled();
    });

    it('falls back to Vega without rights to create a chart type', async () => {
        mocks.canCreateApp = false;

        await openMenuAndPickCustom();

        expect(mocks.setChartType).toHaveBeenCalledWith(ChartType.CUSTOM);
        expect(mocks.createProjectChartType).not.toHaveBeenCalled();
    });

    it('leaves a chart already on a project type alone', async () => {
        mocks.chartType = ChartType.DATA_APP_VIZ;

        await openMenuAndPickCustom();

        expect(mocks.createProjectChartType).not.toHaveBeenCalled();
        expect(mocks.setChartType).not.toHaveBeenCalled();
    });

    it('leaves a chart already on Vega alone', async () => {
        mocks.chartType = ChartType.CUSTOM;

        await openMenuAndPickCustom();

        expect(mocks.createProjectChartType).not.toHaveBeenCalled();
        expect(mocks.setChartType).not.toHaveBeenCalled();
    });
});
