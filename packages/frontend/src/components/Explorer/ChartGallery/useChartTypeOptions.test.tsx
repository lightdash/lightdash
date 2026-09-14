import { ChartKind, ChartType, type DataAppViz } from '@lightdash/common';
import { IconChartScatter3d, IconPuzzle } from '@tabler/icons-react';
import { describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '../../../testing/testUtils';
import { useChartTypeOptions } from './useChartTypeOptions';

vi.mock('../../LightdashVisualization/useVisualizationContext', () => ({
    useVisualizationContext: () => ({
        visualizationConfig: {
            chartType: ChartType.TABLE,
            chartConfig: {},
        },
        setChartType: vi.fn(),
        setCartesianType: vi.fn(),
        setStacking: vi.fn(),
        isLoading: false,
        resultsData: { rows: [{}] },
        pivotDimensions: undefined,
    }),
}));

const projectChartType = {
    dataAppVizUuid: 'project-chart-type',
    slug: 'event-pulse',
    name: 'Event pulse',
    description: 'Reusable ranked bars',
    projectUuid: 'project-uuid',
    spaceUuid: null,
    createdAt: new Date('2026-08-20T00:00:00Z'),
    createdByUserUuid: 'user-uuid',
    schema: { fields: [], configOptions: [], colorPalette: null },
    icon: 'chart-scatter-3d',
    registrySlug: null,
} satisfies DataAppViz;

const getSelectedItem = (
    chartType: ChartType,
    dataAppViz: DataAppViz | null,
) => {
    const { result } = renderHookWithProviders(() => useChartTypeOptions());
    return result.current.getSelectedChartTypeItem(chartType, dataAppViz);
};

describe('getSelectedChartTypeItem', () => {
    it('names the loaded custom chart type and shows its icon', () => {
        expect(
            getSelectedItem(ChartType.DATA_APP_VIZ, projectChartType),
        ).toMatchObject({
            id: ChartKind.DATA_APP_VIZ,
            label: 'Event pulse',
            icon: IconChartScatter3d,
            rotatedIcon: false,
        });
    });

    it('keeps a generic label and the puzzle piece while the custom chart type loads', () => {
        expect(getSelectedItem(ChartType.DATA_APP_VIZ, null)).toMatchObject({
            id: ChartKind.DATA_APP_VIZ,
            label: 'Custom chart type',
            icon: IconPuzzle,
        });
    });

    it('falls back to the puzzle piece for a custom chart type with no icon chosen', () => {
        expect(
            getSelectedItem(ChartType.DATA_APP_VIZ, {
                ...projectChartType,
                icon: null,
            }),
        ).toMatchObject({
            id: ChartKind.DATA_APP_VIZ,
            icon: IconPuzzle,
        });
    });

    it('uses the Vega entry for custom charts', () => {
        expect(getSelectedItem(ChartType.CUSTOM, null)).toMatchObject({
            id: ChartKind.CUSTOM,
            label: 'Vega (JSON editor)',
        });
    });

    it('uses the matching built-in entry for every other chart type', () => {
        expect(getSelectedItem(ChartType.TABLE, null)).toMatchObject({
            id: ChartKind.TABLE,
            label: 'Table',
        });
    });
});
