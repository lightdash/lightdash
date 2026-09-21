import { ChartType } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    savedChartSelector: Symbol('savedChartSelector'),
    unsavedChangesSelector: Symbol('unsavedChangesSelector'),
    exportImage: vi.fn(),
    dateZoom: undefined as string | undefined,
    chartVersionPreview: undefined as string | undefined,
}));

vi.mock('../../../hooks/echarts/useEchartsCartesianConfig', () => ({
    default: () => undefined,
}));
vi.mock('../../../hooks/user/useAccount', () => ({
    useAccount: () => ({
        data: {
            organization: { organizationUuid: 'organization-uuid' },
            isJwtUser: () => false,
        },
    }),
}));
vi.mock('../../../hooks/useSavedChartImageExport', () => ({
    useSavedChartImageExport: () => ({
        mutate: mocks.exportImage,
        isLoading: false,
    }),
}));
vi.mock('../../../hooks/useExplorerRoute', () => ({
    useDateZoomGranularitySearch: () => mocks.dateZoom,
}));
vi.mock(
    '../../../features/apps/ChartVersionPreview/useChartVersionPreview',
    () => ({
        useChartVersionPreview: () => mocks.chartVersionPreview,
    }),
);
vi.mock('../../../features/explorer/store', () => ({
    selectSavedChart: mocks.savedChartSelector,
    selectHasUnsavedChanges: mocks.unsavedChangesSelector,
    useExplorerSelector: (selector: symbol) =>
        selector === mocks.savedChartSelector
            ? { uuid: 'chart-uuid', name: 'Custom chart' }
            : false,
}));
vi.mock('../../../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ({ can: () => true }),
}));
vi.mock('../../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        chartRef: { current: undefined },
        visualizationConfig: { chartType: ChartType.DATA_APP_VIZ },
        resultsData: undefined,
        pivotDimensions: undefined,
        chartConfig: {},
        columnOrder: [],
    }),
}));

import ChartDownloadMenu from './ChartDownloadMenu';
import { isSavedDataAppVizImageExportAvailable } from './chartDownloadUtils';

describe('isSavedDataAppVizImageExportAvailable', () => {
    beforeEach(() => {
        mocks.dateZoom = undefined;
        mocks.chartVersionPreview = undefined;
        vi.clearAllMocks();
    });

    it('allows a saved, unchanged custom chart type in the app', () => {
        expect(
            isSavedDataAppVizImageExportAvailable({
                chartType: ChartType.DATA_APP_VIZ,
                isEmbedded: false,
                hasSavedChart: true,
                hasUnsavedChanges: false,
            }),
        ).toBe(true);
    });

    it.each([
        {
            chartType: ChartType.DATA_APP_VIZ,
            isEmbedded: false,
            hasSavedChart: false,
            hasUnsavedChanges: false,
        },
        {
            chartType: ChartType.DATA_APP_VIZ,
            isEmbedded: false,
            hasSavedChart: true,
            hasUnsavedChanges: true,
        },
        {
            chartType: ChartType.DATA_APP_VIZ,
            isEmbedded: true,
            hasSavedChart: true,
            hasUnsavedChanges: false,
        },
        {
            chartType: ChartType.CARTESIAN,
            isEmbedded: false,
            hasSavedChart: true,
            hasUnsavedChanges: false,
        },
    ])('omits unsupported export state %#', (state) => {
        expect(isSavedDataAppVizImageExportAvailable(state)).toBe(false);
    });

    it('mounts an enabled PNG action for a saved custom chart type', () => {
        render(
            <MantineProvider env="test">
                <ChartDownloadMenu
                    getDownloadQueryUuid={async () => 'query-uuid'}
                    projectUuid="project-uuid"
                />
            </MantineProvider>,
        );

        fireEvent.click(screen.getByTestId('export-csv-button'));

        const exportButton = screen.getByRole('button', {
            name: 'Export PNG',
        });
        expect(exportButton).toBeEnabled();

        fireEvent.click(exportButton);
        expect(mocks.exportImage).toHaveBeenCalledWith({
            chartUuid: 'chart-uuid',
            projectUuid: 'project-uuid',
            chartName: 'Custom chart',
        });
    });

    it('omits the action when Explorer date zoom changes the rendered chart', () => {
        mocks.dateZoom = 'day';
        render(
            <MantineProvider env="test">
                <ChartDownloadMenu
                    getDownloadQueryUuid={async () => 'query-uuid'}
                    projectUuid="project-uuid"
                />
            </MantineProvider>,
        );

        expect(screen.queryByTestId('export-csv-button')).toBeNull();
    });

    it('omits the action while previewing a historical chart version', () => {
        mocks.chartVersionPreview = 'version-uuid';
        render(
            <MantineProvider env="test">
                <ChartDownloadMenu
                    getDownloadQueryUuid={async () => 'query-uuid'}
                    projectUuid="project-uuid"
                />
            </MantineProvider>,
        );

        expect(screen.queryByTestId('export-csv-button')).toBeNull();
    });
});
