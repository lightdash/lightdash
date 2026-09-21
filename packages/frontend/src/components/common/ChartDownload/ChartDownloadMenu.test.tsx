import { ChartType } from '@lightdash/common';
import { Button, MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    savedChartSelector: Symbol('savedChartSelector'),
    unsavedChangesSelector: Symbol('unsavedChangesSelector'),
    exportImage: vi.fn(),
    explorerSelector: vi.fn(),
    getChartInstance: vi.fn(),
    downloadQuery: vi.fn(async () => 'query-uuid'),
    chartType: 'data-app-viz' as ChartType,
    isEmbedded: false,
    canManageExplore: true,
    canExportCsv: true,
    canExportImages: true,
    hasUnsavedChanges: false,
    hasSavedChart: true,
    hasUnpublishedChanges: false,
    dateZoom: undefined as string | undefined,
    chartVersionPreview: undefined as string | undefined,
}));

vi.mock('../../../hooks/echarts/useEchartsCartesianConfig', () => ({
    default: () => ({}),
}));
vi.mock('../../../hooks/user/useAccount', () => ({
    useAccount: () => ({
        data: {
            organization: { organizationUuid: 'organization-uuid' },
            isJwtUser: () => mocks.isEmbedded,
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
    useExplorerSelector: (selector: symbol) => {
        mocks.explorerSelector(selector);
        return selector === mocks.savedChartSelector
            ? mocks.hasSavedChart
                ? {
                      uuid: 'chart-uuid',
                      name: 'Custom chart',
                      hasUnpublishedChanges: mocks.hasUnpublishedChanges,
                  }
                : undefined
            : mocks.hasUnsavedChanges;
    },
}));
vi.mock('../../../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ({
        can: (
            _action: string,
            resource: { __caslSubjectType__: string; type?: string },
        ) => {
            if (resource.__caslSubjectType__ === 'Explore')
                return mocks.canManageExplore;
            if (
                resource.__caslSubjectType__ === 'ExportCsv' ||
                resource.type === 'csv'
            )
                return mocks.canExportCsv;
            return mocks.canExportImages;
        },
    }),
}));
vi.mock('../../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        chartRef: { current: { getEchartsInstance: mocks.getChartInstance } },
        visualizationConfig: {
            chartType: mocks.chartType,
            chartConfig: {
                columnOrder: [],
                showTableNames: false,
                validConfig: {},
            },
        },
        resultsData: { totalResults: 1 },
        pivotDimensions: undefined,
        chartConfig: {},
        columnOrder: [],
    }),
}));

vi.mock('./ChartDownloadOptions', () => ({
    default: ({ getChartInstance }: { getChartInstance: () => unknown }) => (
        <Button onClick={() => getChartInstance()}>
            Download existing chart
        </Button>
    ),
}));
vi.mock('../../ExportSelector', () => ({
    default: ({
        getDownloadQueryUuid,
    }: {
        getDownloadQueryUuid: (
            limit: number,
            limitType: string,
            pivot: boolean,
        ) => Promise<string>;
    }) => (
        <Button onClick={() => void getDownloadQueryUuid(100, 'custom', false)}>
            Download table data
        </Button>
    ),
}));

import ChartDownloadMenu from './ChartDownloadMenu';

const renderMenu = () =>
    render(
        <MantineProvider env="test">
            <ChartDownloadMenu
                getDownloadQueryUuid={mocks.downloadQuery}
                projectUuid="project-uuid"
            />
        </MantineProvider>,
    );

describe('ChartDownloadMenu', () => {
    beforeEach(() => {
        mocks.chartType = ChartType.DATA_APP_VIZ;
        mocks.isEmbedded = false;
        mocks.canManageExplore = true;
        mocks.canExportCsv = true;
        mocks.canExportImages = true;
        mocks.hasUnsavedChanges = false;
        mocks.hasSavedChart = true;
        mocks.hasUnpublishedChanges = false;
        mocks.dateZoom = undefined;
        mocks.chartVersionPreview = undefined;
        vi.clearAllMocks();
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
    it.each([
        ChartType.CARTESIAN,
        ChartType.PIE,
        ChartType.FUNNEL,
        ChartType.TREEMAP,
        ChartType.GAUGE,
    ])(
        'keeps the existing image export path for %s charts with unsaved changes',
        (chartType) => {
            mocks.chartType = chartType;
            mocks.hasUnsavedChanges = true;
            mocks.dateZoom = 'day';
            renderMenu();
            fireEvent.click(screen.getByTestId('export-csv-button'));
            fireEvent.click(
                screen.getByRole('button', { name: 'Download existing chart' }),
            );
            expect(mocks.getChartInstance).toHaveBeenCalledOnce();
            expect(mocks.explorerSelector).not.toHaveBeenCalled();
            expect(mocks.exportImage).not.toHaveBeenCalled();
            expect(
                screen.queryByRole('button', { name: 'Export PNG' }),
            ).toBeNull();
        },
    );

    it('preserves table data export and its limit/pivot arguments', () => {
        mocks.chartType = ChartType.TABLE;
        renderMenu();
        fireEvent.click(screen.getByTestId('export-csv-button'));
        fireEvent.click(
            screen.getByRole('button', { name: 'Download table data' }),
        );
        expect(mocks.downloadQuery).toHaveBeenCalledWith(100, false);
        expect(mocks.exportImage).not.toHaveBeenCalled();
    });

    it.each([ChartType.CUSTOM, ChartType.BIG_NUMBER, ChartType.MAP])(
        'keeps image export unavailable for %s',
        (chartType) => {
            mocks.chartType = chartType;
            renderMenu();
            expect(screen.queryByTestId('export-csv-button')).toBeNull();
        },
    );

    it.each([ChartType.CARTESIAN, ChartType.TABLE, ChartType.DATA_APP_VIZ])(
        'hides export for %s without Explore permission',
        (chartType) => {
            mocks.chartType = chartType;
            mocks.canManageExplore = false;
            renderMenu();
            expect(screen.queryByTestId('export-csv-button')).toBeNull();
        },
    );

    it('preserves embedded image permission without native Explore permission', () => {
        mocks.chartType = ChartType.CARTESIAN;
        mocks.isEmbedded = true;
        mocks.canManageExplore = false;
        renderMenu();
        fireEvent.click(screen.getByTestId('export-csv-button'));
        expect(
            screen.getByRole('button', { name: 'Download existing chart' }),
        ).toBeInTheDocument();
    });

    it.each([ChartType.CARTESIAN, ChartType.TABLE, ChartType.DATA_APP_VIZ])(
        'hides denied embedded exports for %s',
        (chartType) => {
            mocks.chartType = chartType;
            mocks.isEmbedded = true;
            mocks.canExportCsv = false;
            mocks.canExportImages = false;
            renderMenu();
            expect(screen.queryByTestId('export-csv-button')).toBeNull();
        },
    );

    it.each(['hasUnsavedChanges', 'hasSavedChart', 'isEmbedded'] as const)(
        'does not offer the saved custom image when %s makes it unavailable',
        (field) => {
            mocks[field] = field !== 'hasSavedChart';
            renderMenu();
            expect(screen.queryByTestId('export-csv-button')).toBeNull();
        },
    );
    it('does not export the published chart while an unpublished draft is displayed', () => {
        mocks.hasUnpublishedChanges = true;
        renderMenu();
        expect(screen.queryByTestId('export-csv-button')).toBeNull();
    });
});
