import {
    ChartKind,
    type DashboardSemanticViewerChartTile,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { IconAlertCircle, IconPencil } from '@tabler/icons-react';
import { pick } from 'lodash';
import { memo, useMemo, type FC } from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from 'react-use';
import {
    useDashboardSemanticViewerChart,
    useSemanticLayerViewFields,
} from '../../features/semanticViewer/api/hooks';
import { SemanticViewerResultsRunnerFrontend } from '../../features/semanticViewer/runners/SemanticViewerResultsRunnerFrontend';
import { useOrganization } from '../../hooks/organization/useOrganization';
import LinkMenuItem from '../common/LinkMenuItem';
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import getChartDataModel from '../DataViz/transformers/getChartDataModel';
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
    const org = useOrganization();

    const savedSemanticViewerChartUuid =
        tile.properties.savedSemanticViewerChartUuid;

    const chartQuery = useDashboardSemanticViewerChart(
        projectUuid,
        savedSemanticViewerChartUuid,
    );

    const fieldsQuery = useSemanticLayerViewFields(
        {
            projectUuid,
            view: chartQuery.isSuccess
                ? chartQuery.data.chart.semanticLayerView ?? ''
                : '', // TODO: this should never be empty or that hook should receive a null view!
            selectedFields: chartQuery.isSuccess
                ? pick(chartQuery.data.chart.semanticLayerQuery, [
                      'dimensions',
                      'timeDimensions',
                      'metrics',
                  ])
                : { dimensions: [], timeDimensions: [], metrics: [] },
        },
        { enabled: chartQuery.isSuccess },
    );

    const chartData = useMemo(() => {
        if (!chartQuery.isSuccess) return undefined;

        return {
            results: chartQuery.data.resultsAndColumns.results,
            columns: chartQuery.data.resultsAndColumns.columns,
        };
    }, [chartQuery]);

    // TODO:Can we do away with this?
    const resultsRunner = useMemo(() => {
        if (!chartQuery.isSuccess || !fieldsQuery.isSuccess || !chartData)
            return;

        return new SemanticViewerResultsRunnerFrontend({
            projectUuid,
            fields: fieldsQuery.data,
            rows: chartData.results,
            columnNames: chartData.columns,
        });
    }, [chartQuery, fieldsQuery, chartData, projectUuid]);

    const vizDataModel = useMemo(() => {
        if (!resultsRunner) return;
        return getChartDataModel(
            resultsRunner,
            chartQuery.data?.chart.config,
            org.data,
        );
    }, [resultsRunner, chartQuery.data?.chart.config, org.data]);

    const {
        loading: chartLoading,
        error: chartError,
        value,
    } = useAsync(
        async () => vizDataModel?.getPivotedChartData(),
        [vizDataModel],
    );
    console.log('saved chart data', { value });
    const chartSpec = vizDataModel?.getSpec();

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
            {/* {resultsRunner &&
                chartQuery.data.chart.config.type === ChartKind.TABLE &&
                isVizTableConfig(chartQuery.data.chart.config) && (
                    // So that the Table tile isn't cropped by the overflow
                    <Box w="100%" h="100%" sx={{ overflow: 'auto' }}>
                        <Table
                            resultsRunner={resultsRunner}
                            columnsConfig={chartQuery.data.chart.config.columns}
                        />
                    </Box>
                )} */}

            {savedSemanticViewerChartUuid &&
                (chartQuery.data.chart.config.type === ChartKind.VERTICAL_BAR ||
                    chartQuery.data.chart.config.type === ChartKind.LINE ||
                    chartQuery.data.chart.config.type === ChartKind.PIE) && (
                    <ChartView
                        config={chartQuery.data.chart.config}
                        spec={chartSpec}
                        isLoading={chartLoading}
                        error={chartError}
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
