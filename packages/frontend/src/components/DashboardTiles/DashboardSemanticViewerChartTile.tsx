import { subject } from '@casl/ability';
import {
    ChartKind,
    isVizTableConfig,
    type DashboardSemanticViewerChartTile,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { IconAlertCircle, IconPencil } from '@tabler/icons-react';
import { memo, useMemo, type FC } from 'react';
import { useParams } from 'react-router-dom';
import { useAsync } from 'react-use';
import {
    useSavedSemanticViewerChart,
    useSavedSemanticViewerChartResults,
    useSemanticLayerViewFields,
} from '../../features/semanticViewer/api/hooks';
import { SemanticViewerResultsRunnerFrontend } from '../../features/semanticViewer/runners/SemanticViewerResultsRunnerFrontend';
import { useOrganization } from '../../hooks/organization/useOrganization';
import { useApp } from '../../providers/AppProvider';
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
    const { user } = useApp();

    const { data: organization } = useOrganization();

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

    const semanticLayerQuery = useMemo(() => {
        return chartQuery.data?.semanticLayerQuery;
    }, [chartQuery.data?.semanticLayerQuery]);

    const resultsRunner = useMemo(() => {
        if (
            !fieldsQuery.isSuccess ||
            !chartQuery.isSuccess ||
            !chartResultsQuery.isSuccess
        ) {
            return;
        }

        return new SemanticViewerResultsRunnerFrontend({
            projectUuid,
            fields: fieldsQuery.data,
            rows: chartResultsQuery.data.results,
            columnNames: chartResultsQuery.data.columns,
        });
    }, [
        projectUuid,
        fieldsQuery.isSuccess,
        fieldsQuery.data,
        chartQuery.isSuccess,
        chartResultsQuery.isSuccess,
        chartResultsQuery.data,
    ]);

    const chartFieldConfig = useMemo(() => {
        return isVizTableConfig(chartQuery.data?.config)
            ? chartQuery.data?.config.columns
            : chartQuery.data?.config.fieldConfig;
    }, [chartQuery.data]);

    const vizDataModel = useMemo(() => {
        if (!resultsRunner) return;
        return getChartDataModel(
            resultsRunner,
            chartFieldConfig,
            chartQuery.data?.config.type ?? ChartKind.TABLE,
        );
    }, [resultsRunner, chartFieldConfig, chartQuery.data?.config.type]);

    const { loading: chartLoading, error: chartError } = useAsync(
        async () =>
            vizDataModel?.getPivotedChartData({
                filters: semanticLayerQuery?.filters ?? [],
                sortBy: semanticLayerQuery?.sortBy ?? [],
                limit: semanticLayerQuery?.limit ?? undefined,
                sql: semanticLayerQuery?.sql ?? undefined,
            }),
        [vizDataModel, semanticLayerQuery],
    );

    const savedChartSpaceUserAccess =
        chartQuery.isSuccess && chartQuery.data.space.userAccess
            ? [chartQuery.data.space.userAccess]
            : [];

    const canManageSemanticViewer = user.data?.ability?.can(
        'manage',
        subject('SemanticViewer', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
            access: savedChartSpaceUserAccess,
        }),
    );

    const canUpdateChart = user.data?.ability?.can(
        'update',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
            access: savedChartSpaceUserAccess,
        }),
    );

    if (
        chartQuery.isLoading ||
        fieldsQuery.isLoading ||
        chartResultsQuery.isLoading ||
        chartLoading ||
        !vizDataModel
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
                canManageSemanticViewer &&
                canUpdateChart && (
                    <ChartTileOptions
                        isEditMode={isEditMode}
                        projectUuid={projectUuid}
                        slug={chartQuery.data.slug}
                    />
                )
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
                        spec={vizDataModel.getSpec(
                            chartQuery.data.config.display,
                            organization?.chartColors,
                        )}
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
