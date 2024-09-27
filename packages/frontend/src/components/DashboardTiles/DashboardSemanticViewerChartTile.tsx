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
    useSavedSemanticViewerChart,
    useSavedSemanticViewerChartResults,
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
        tile.properties.savedSemanticViewerChartUuid ?? undefined;

    const chartQuery = useSavedSemanticViewerChart({
        projectUuid,
        findBy: { uuid: savedSemanticViewerChartUuid },
    });

    const chartResultsQuery = useSavedSemanticViewerChartResults({
        projectUuid,
        findBy: { uuid: savedSemanticViewerChartUuid },
    });

    const fieldsQuery = useSemanticLayerViewFields(
        {
            projectUuid,
            // TODO: this should never be empty or that hook should receive a null view!
            semanticLayerView: chartQuery.data?.semanticLayerView ?? '',
            semanticLayerQuery: chartQuery.data?.semanticLayerQuery,
        },
        { enabled: chartQuery.isSuccess },
    );

    const resultsRunner = useMemo(() => {
        if (
            !chartQuery.isSuccess ||
            !fieldsQuery.isSuccess ||
            !chartResultsQuery.isSuccess
        ) {
            return;
        }

        const vizColumns =
            SemanticViewerResultsRunner.convertColumnsToVizColumns(
                fieldsQuery.data,
                chartResultsQuery.data.columns,
            );

        return new SemanticViewerResultsRunner({
            projectUuid,
            fields: fieldsQuery.data,
            query: chartQuery.data.semanticLayerQuery,
            rows: chartResultsQuery.data.results,
            columns: vizColumns,
        });
    }, [
        projectUuid,
        chartQuery.data,
        chartQuery.isSuccess,
        chartResultsQuery.data,
        chartResultsQuery.isSuccess,
        fieldsQuery.data,
        fieldsQuery.isSuccess,
    ]);

    const [chartVizQuery, chartSpec] = useChartViz({
        projectUuid,
        resultsRunner,
        uuid: savedSemanticViewerChartUuid ?? undefined,
        config: chartQuery.data?.config,
        slug: chartQuery.data?.slug,
    });

    if (
        chartQuery.isLoading ||
        fieldsQuery.isLoading ||
        chartResultsQuery.isLoading
    ) {
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

    if (
        chartQuery.error !== null ||
        fieldsQuery.error !== null ||
        chartResultsQuery.error !== null ||
        !chartResultsQuery.data
    ) {
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
                        chartResultsQuery.error?.error?.message ??
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
            titleHref={`/projects/${projectUuid}/semantic-viewer/${chartQuery.data.slug}`}
            tile={tile}
            title={tile.properties.title || tile.properties.chartName || ''}
            {...rest}
            extraMenuItems={
                <ChartTileOptions
                    isEditMode={isEditMode}
                    projectUuid={projectUuid}
                    slug={chartQuery.data.slug}
                />
            }
        >
            {resultsRunner &&
                chartQuery.data.config.type === ChartKind.TABLE &&
                isVizTableConfig(chartQuery.data.config) && (
                    // So that the Table tile isn't cropped by the overflow
                    <Box w="100%" h="100%" sx={{ overflow: 'auto' }}>
                        <Table
                            resultsRunner={resultsRunner}
                            columnsConfig={chartQuery.data.config.columns}
                        />
                    </Box>
                )}

            {savedSemanticViewerChartUuid &&
                (chartQuery.data.config.type === ChartKind.VERTICAL_BAR ||
                    chartQuery.data.config.type === ChartKind.LINE ||
                    chartQuery.data.config.type === ChartKind.PIE) && (
                    <ChartView
                        config={chartQuery.data.config}
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
