import {
    ChartKind,
    isVizTableConfig,
    type DashboardSemanticViewerChartTile,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { IconAlertCircle, IconPencil } from '@tabler/icons-react';
import { memo, useMemo, type FC } from 'react';
import { useParams } from 'react-router-dom';
import {
    useSavedSemanticViewerChartAndResults,
    useSemanticLayerViewFields,
} from '../../features/semanticViewer/api/hooks';
import { SemanticViewerResultsRunner } from '../../features/semanticViewer/runners/SemanticViewerResultsRunner';
import LinkMenuItem from '../common/LinkMenuItem';
import MantineIcon from '../common/MantineIcon';
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
 */

const ChartTileOptions = memo(
    ({
        isEditMode,
        projectUuid,
        slug,
    }: {
        isEditMode: boolean;
        projectUuid: string;
        slug: string;
    }) => (
        <LinkMenuItem
            icon={<MantineIcon icon={IconPencil} />}
            href={`/projects/${projectUuid}/semantic-viewer/${slug}/edit`}
            disabled={isEditMode}
            target="_blank"
        >
            Edit Semantic Viewer chart
        </LinkMenuItem>
    ),
);

const SemanticViewerChartTile: FC<Props> = ({ tile, isEditMode, ...rest }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const savedSemanticViewerChartUuid =
        tile.properties.savedSemanticViewerChartUuid;

    const chartQuery = useSavedSemanticViewerChartAndResults({
        projectUuid,
        uuid: savedSemanticViewerChartUuid,
    });

    const fieldsQuery = useSemanticLayerViewFields(
        {
            projectUuid,
            // TODO: this should never be empty or that hook should receive a null view!
            semanticLayerView: chartQuery.data?.chart.semanticLayerView ?? '',
            semanticLayerQuery: chartQuery.data?.chart.semanticLayerQuery,
        },
        { enabled: chartQuery.isSuccess },
    );

    const chartData = useMemo(() => {
        if (!chartQuery.isSuccess) return undefined;
        return chartQuery.data.results;
    }, [chartQuery]);

    const resultsRunner = useMemo(() => {
        if (!chartQuery.isSuccess || !fieldsQuery.isSuccess || !chartData)
            return;

        const vizColumns =
            SemanticViewerResultsRunner.convertColumnsToVizColumns(
                fieldsQuery.data,
                chartData.columns,
            );

        return new SemanticViewerResultsRunner({
            projectUuid,
            fields: fieldsQuery.data,
            query: chartQuery.data.chart.semanticLayerQuery,
            rows: chartData.results,
            columns: vizColumns,
        });
    }, [chartQuery, fieldsQuery, chartData, projectUuid]);

    const [chartVizQuery, chartSpec] = useChartViz({
        projectUuid,
        resultsRunner,
        uuid: savedSemanticViewerChartUuid ?? undefined,
        config: chartQuery.data?.chart.config,
        slug: chartQuery.data?.chart.slug,
    });

    if (chartQuery.isLoading || fieldsQuery.isLoading) {
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

    if (chartQuery.error !== null || fieldsQuery.error !== null || !chartData) {
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
                        chartQuery.error?.error?.message ??
                        fieldsQuery.error?.error?.message ??
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
            titleHref={`/projects/${projectUuid}/semantic-viewer/${chartQuery.data.chart.slug}`}
            tile={tile}
            title={tile.properties.title || tile.properties.chartName || ''}
            {...rest}
            extraMenuItems={
                <ChartTileOptions
                    isEditMode={isEditMode}
                    projectUuid={projectUuid}
                    slug={chartQuery.data.chart.slug}
                />
            }
        >
            {resultsRunner &&
                chartQuery.data.chart.config.type === ChartKind.TABLE &&
                isVizTableConfig(chartQuery.data.chart.config) && (
                    // So that the Table tile isn't cropped by the overflow
                    <Box w="100%" h="100%" sx={{ overflow: 'auto' }}>
                        <Table
                            resultsRunner={resultsRunner}
                            columnsConfig={chartQuery.data.chart.config.columns}
                        />
                    </Box>
                )}

            {savedSemanticViewerChartUuid &&
                (chartQuery.data.chart.config.type === ChartKind.VERTICAL_BAR ||
                    chartQuery.data.chart.config.type === ChartKind.LINE ||
                    chartQuery.data.chart.config.type === ChartKind.PIE) && (
                    <ChartView
                        config={chartQuery.data.chart.config}
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
