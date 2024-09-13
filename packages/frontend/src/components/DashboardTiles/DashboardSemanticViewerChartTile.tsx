import {
    ChartKind,
    isVizTableConfig,
    type DashboardSemanticViewerChartTile,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useParams } from 'react-router-dom';
import {
    useDashboardSemanticViewerChart,
    useSemanticLayerViewFields,
} from '../../features/semanticViewer/api/hooks';
import { SemanticViewerResultsRunner } from '../../features/semanticViewer/runners/SemanticViewerResultsRunner';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import { useChartViz } from '../DataViz/hooks/useChartViz';
import ChartView from '../DataViz/visualizations/ChartView';
import { Table } from '../DataViz/visualizations/Table';
import TileBase from './TileBase';

interface Props
    extends Pick<
        React.ComponentProps<typeof TileBase>,
        'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
    > {
    tile: DashboardSemanticViewerChartTile;
    minimal?: boolean;
}

/**
 * TODO:
 * Handle minimal mode
 * handle tabs
 * handle edit
 * handle title link that goes to semantic viewer
 */

const SemanticViewerChartTile: FC<Props> = ({ tile, isEditMode, ...rest }) => {
    const { projectUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();

    const savedSemanticViewerChartUuid =
        tile.properties.savedSemanticViewerChartUuid;
    const {
        data,
        isLoading: isLoadingChart,
        error: savedError,
    } = useDashboardSemanticViewerChart(
        projectUuid,
        savedSemanticViewerChartUuid,
    );

    const {
        data: fields,
        isLoading: isLoadingFields,
        error: fieldsError,
    } = useSemanticLayerViewFields(
        {
            projectUuid,
            view: data!.chart.semanticLayerView ?? '', // TODO: this should never be empty or that hook should receive a null view!
            selectedFields: {
                dimensions: data!.chart.semanticLayerQuery.dimensions ?? [],
                timeDimensions:
                    data!.chart.semanticLayerQuery.timeDimensions ?? [],
                metrics: data!.chart.semanticLayerQuery.metrics ?? [],
            },
        },
        { enabled: !!data },
    );

    const chartData = useMemo(() => {
        return {
            results: data?.resultsAndColumns.results ?? [],
            columns: data?.resultsAndColumns.columns ?? [],
        };
    }, [data]);

    const resultsRunner = useMemo(() => {
        if (!data || !fields) return;

        const vizColumns =
            SemanticViewerResultsRunner.convertColumnsToVizColumns(
                fields,
                chartData.columns,
            );

        return new SemanticViewerResultsRunner({
            projectUuid,
            fields,
            query: data.chart.semanticLayerQuery,
            rows: chartData.results,
            columns: vizColumns,
        });
    }, [data, fields, chartData.columns, chartData.results, projectUuid]);

    const [chartVizQuery, chartSpec] = useChartViz({
        projectUuid,
        resultsRunner,
        config: data?.chart.config,
        uuid: savedSemanticViewerChartUuid ?? undefined,
        slug: data?.chart.slug,
    });

    if (isLoadingChart || isLoadingFields) {
        return (
            <TileBase
                isEditMode={isEditMode}
                chartName={tile.properties.chartName ?? ''}
                tile={tile}
                isLoading
                title={tile.properties.title || tile.properties.chartName || ''}
                {...rest}
            />
        );
    }

    if (savedError !== null || fieldsError !== null || !data) {
        return (
            <TileBase
                isEditMode={isEditMode}
                chartName={tile.properties.chartName ?? ''}
                tile={tile}
                title={tile.properties.title || tile.properties.chartName || ''}
                {...rest}
            >
                <SuboptimalState
                    icon={IconAlertCircle}
                    title={
                        savedError?.error?.message ??
                        fieldsError?.error?.message ??
                        'No data available'
                    }
                />
            </TileBase>
        );
    }

    return (
        <TileBase
            isEditMode={isEditMode}
            chartName={tile.properties.chartName ?? ''}
            titleHref={`/projects/${projectUuid}/semantic-viewer/${data.chart.slug}`}
            tile={tile}
            title={tile.properties.title || tile.properties.chartName || ''}
            {...rest}
        >
            {resultsRunner &&
                data.chart.config.type === ChartKind.TABLE &&
                isVizTableConfig(data.chart.config) && (
                    // So that the Table tile isn't cropped by the overflow
                    <Box w="100%" h="100%" sx={{ overflow: 'auto' }}>
                        <Table
                            resultsRunner={resultsRunner}
                            columnsConfig={data.chart.config.columns}
                        />
                    </Box>
                )}

            {savedSemanticViewerChartUuid &&
                (data.chart.config.type === ChartKind.VERTICAL_BAR ||
                    data.chart.config.type === ChartKind.LINE ||
                    data.chart.config.type === ChartKind.PIE) && (
                    <ChartView
                        config={data.chart.config}
                        spec={chartSpec}
                        isLoading={chartVizQuery.isLoading}
                        error={chartVizQuery.error}
                        style={{
                            minHeight: 'inherit',
                            height: '100%',
                            width: '100%',
                        }}
                    />
                )}
        </TileBase>
    );
};

export default SemanticViewerChartTile;
