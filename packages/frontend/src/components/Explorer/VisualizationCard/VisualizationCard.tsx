import { subject } from '@casl/ability';
import {
    ECHARTS_DEFAULT_COLORS,
    getHiddenTableFields,
    getPivotConfig,
    NotFoundError,
    type ApiErrorDetail,
} from '@lightdash/common';
import { Button } from '@mantine/core';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import {
    memo,
    useCallback,
    useLayoutEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import { createPortal } from 'react-dom';
import ErrorBoundary from '../../../features/errorBoundary/ErrorBoundary';
import {
    explorerActions,
    selectColumnOrder,
    selectIsEditMode,
    selectIsVisualizationConfigOpen,
    selectIsVisualizationExpanded,
    selectMetricQuery,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { type EChartSeries } from '../../../hooks/echarts/useEchartsCartesianConfig';
import { uploadGsheet } from '../../../hooks/gdrive/useGdrive';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { ExplorerSection } from '../../../providers/Explorer/types';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import ChartDownloadMenu from '../../common/ChartDownload/ChartDownloadMenu';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard/constants';
import MantineIcon from '../../common/MantineIcon';
import LightdashVisualization from '../../LightdashVisualization';
import VisualizationProvider from '../../LightdashVisualization/VisualizationProvider';
import { type EchartSeriesClickEvent } from '../../SimpleChart';
import { VisualizationConfigPortalId } from '../ExplorePanel/constants';
import VisualizationConfig from '../VisualizationCard/VisualizationConfig';
import { SeriesContextMenu } from './SeriesContextMenu';
import VisualizationWarning from './VisualizationWarning';

export type EchartsClickEvent = {
    event: EchartSeriesClickEvent;
    dimensions: string[];
    series: EChartSeries[];
};

type Props = {
    projectUuid?: string;
};

const VisualizationCard: FC<Props> = memo(({ projectUuid: fallBackUUid }) => {
    const { health } = useApp();
    const { data: org } = useOrganization();

    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );

    const { query, queryResults, isLoading, getDownloadQueryUuid } =
        useExplorerQuery();
    const isLoadingQueryResults = isLoading || queryResults.isFetchingRows;

    const resultsData = useMemo(
        () => ({
            ...queryResults,
            metricQuery: query.data?.metricQuery,
            fields: query.data?.fields,
        }),
        [query.data, queryResults],
    );

    const setPivotFields = useExplorerContext(
        (context) => context.actions.setPivotFields,
    );
    const setChartType = useExplorerContext(
        (context) => context.actions.setChartType,
    );
    const setChartConfig = useExplorerContext(
        (context) => context.actions.setChartConfig,
    );

    const isOpen = useExplorerSelector(selectIsVisualizationExpanded);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const isVisualizationConfigOpen = useExplorerSelector(
        selectIsVisualizationConfigOpen,
    );
    const dispatch = useExplorerDispatch();

    const toggleExpandedSection = useCallback(
        (section: ExplorerSection) => {
            dispatch(explorerActions.toggleExpandedSection(section));
        },
        [dispatch],
    );

    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const columnOrder = useExplorerSelector(selectColumnOrder);

    // Read chartConfig and pivotConfig from Context (not synced to Redux)
    const chartConfig = useExplorerContext(
        (context) => context.state.unsavedChartVersion.chartConfig,
    );
    const pivotConfig = useExplorerContext(
        (context) => context.state.unsavedChartVersion.pivotConfig,
    );

    const unsavedChartVersion = useMemo(
        () => ({
            tableName,
            metricQuery,
            tableConfig: { columnOrder },
            chartConfig,
            pivotConfig,
        }),
        [tableName, metricQuery, columnOrder, chartConfig, pivotConfig],
    );

    const tableCalculationsMetadata = useExplorerContext(
        (context) => context.state.metadata?.tableCalculations,
    );

    const toggleSection = useCallback(
        () => toggleExpandedSection(ExplorerSection.VISUALIZATION),
        [toggleExpandedSection],
    );
    const projectUuid = useExplorerContext(
        (context) => context.state.savedChart?.projectUuid || fallBackUUid,
    );

    const { data: explore } = useExplore(unsavedChartVersion.tableName);

    const [echartsClickEvent, setEchartsClickEvent] =
        useState<EchartsClickEvent>();

    const openVisualizationConfig = useCallback(
        () => dispatch(explorerActions.openVisualizationConfig()),
        [dispatch],
    );
    const closeVisualizationConfig = useCallback(
        () => dispatch(explorerActions.closeVisualizationConfig()),
        [dispatch],
    );

    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

    useLayoutEffect(() => {
        if (isVisualizationConfigOpen) {
            const target = document.getElementById(VisualizationConfigPortalId);
            setPortalTarget(target);
        } else {
            setPortalTarget(null);
        }
    }, [isVisualizationConfigOpen]);

    useLayoutEffect(() => {
        if (!isEditMode) {
            closeVisualizationConfig();
        }
    }, [isEditMode, closeVisualizationConfig]);

    useLayoutEffect(() => {
        if (!isOpen) {
            closeVisualizationConfig();
        }
    }, [closeVisualizationConfig, isOpen]);

    const onSeriesContextMenu = useCallback(
        (e: EchartSeriesClickEvent, series: EChartSeries[]) => {
            setEchartsClickEvent({
                event: e,
                dimensions: unsavedChartVersion.metricQuery.dimensions,
                series,
            });
        },
        [unsavedChartVersion],
    );

    const { missingRequiredParameters } = useExplorerQuery();

    const apiErrorDetail = useMemo(() => {
        const queryError = query.error?.error ?? queryResults.error?.error;

        return !missingRequiredParameters?.length
            ? queryError
            : // Mimicking an API Error Detail so it can be used in the EmptyState component
              ({
                  message: 'Missing required parameters',
                  name: 'Error',
                  statusCode: 400,
                  data: {},
              } satisfies ApiErrorDetail);
    }, [
        query.error?.error,
        queryResults.error?.error,
        missingRequiredParameters,
    ]);

    if (!unsavedChartVersion.tableName) {
        return <CollapsableCard title="Charts" disabled />;
    }

    const getGsheetLink = async (
        exportColumnOrder: string[],
        showTableNames: boolean,
        customLabels?: Record<string, string>,
    ) => {
        if (explore?.name && unsavedChartVersion?.metricQuery && projectUuid) {
            const gsheetResponse = await uploadGsheet({
                projectUuid,
                exploreId: explore?.name,
                metricQuery: unsavedChartVersion?.metricQuery,
                columnOrder: exportColumnOrder,
                showTableNames,
                customLabels,
                hiddenFields: getHiddenTableFields(
                    unsavedChartVersion.chartConfig,
                ),
                pivotConfig: getPivotConfig(unsavedChartVersion),
            });
            return gsheetResponse;
        }
        throw new NotFoundError('no metric query defined');
    };

    if (health.isInitialLoading || !health.data) {
        return null;
    }

    console.log(unsavedChartVersion.chartConfig);

    return (
        <ErrorBoundary>
            <VisualizationProvider
                chartConfig={unsavedChartVersion.chartConfig}
                initialPivotDimensions={
                    unsavedChartVersion.pivotConfig?.columns
                }
                unsavedMetricQuery={unsavedChartVersion.metricQuery}
                resultsData={resultsData}
                apiErrorDetail={apiErrorDetail}
                isLoading={isLoadingQueryResults}
                columnOrder={unsavedChartVersion.tableConfig.columnOrder}
                onSeriesContextMenu={onSeriesContextMenu}
                pivotTableMaxColumnLimit={health.data.pivotTable.maxColumnLimit}
                savedChartUuid={isEditMode ? undefined : savedChart?.uuid}
                onChartConfigChange={setChartConfig}
                onChartTypeChange={setChartType}
                onPivotDimensionsChange={setPivotFields}
                colorPalette={org?.chartColors ?? ECHARTS_DEFAULT_COLORS}
                tableCalculationsMetadata={tableCalculationsMetadata}
                parameters={query.data?.usedParametersValues}
            >
                <CollapsableCard
                    title="Chart"
                    isOpen={isOpen}
                    isVisualizationCard
                    onToggle={toggleSection}
                    headerElement={
                        isOpen && (
                            <VisualizationWarning
                                pivotDimensions={
                                    unsavedChartVersion.pivotConfig?.columns
                                }
                                chartConfig={unsavedChartVersion.chartConfig}
                                resultsData={resultsData}
                                isLoading={isLoadingQueryResults}
                            />
                        )
                    }
                    rightHeaderElement={
                        isOpen && (
                            <>
                                {isEditMode ? (
                                    <Button
                                        {...COLLAPSABLE_CARD_BUTTON_PROPS}
                                        onClick={
                                            isVisualizationConfigOpen
                                                ? closeVisualizationConfig
                                                : openVisualizationConfig
                                        }
                                        rightIcon={
                                            <MantineIcon
                                                icon={
                                                    isVisualizationConfigOpen
                                                        ? IconLayoutSidebarLeftCollapse
                                                        : IconLayoutSidebarLeftExpand
                                                }
                                            />
                                        }
                                    >
                                        {isVisualizationConfigOpen
                                            ? 'Close configure'
                                            : 'Configure'}
                                    </Button>
                                ) : null}

                                {/*
                                 * NOTE: not using Portal from mantine-8 because this page lacks MantineProvider from Mantine 8
                                 * TODO: use mantine-8 portal with reuseTargetNode flag to avoid rendering additional divs
                                 */}
                                {portalTarget &&
                                    createPortal(
                                        <VisualizationConfig
                                            chartType={
                                                unsavedChartVersion.chartConfig
                                                    .type
                                            }
                                            onClose={closeVisualizationConfig}
                                        />,
                                        portalTarget,
                                    )}

                                <Can
                                    I="manage"
                                    this={subject('Explore', {
                                        organizationUuid: org?.organizationUuid,
                                        projectUuid,
                                    })}
                                >
                                    {!!projectUuid && (
                                        <ChartDownloadMenu
                                            getDownloadQueryUuid={
                                                getDownloadQueryUuid
                                            }
                                            projectUuid={projectUuid}
                                            chartName={savedChart?.name}
                                            getGsheetLink={getGsheetLink}
                                        />
                                    )}
                                </Can>
                            </>
                        )
                    }
                >
                    <LightdashVisualization
                        className="sentry-block ph-no-capture"
                        data-testid="visualization"
                    />
                    <SeriesContextMenu
                        echartSeriesClickEvent={echartsClickEvent?.event}
                        dimensions={echartsClickEvent?.dimensions}
                        series={echartsClickEvent?.series}
                        explore={explore}
                    />
                </CollapsableCard>
            </VisualizationProvider>
        </ErrorBoundary>
    );
});

export default VisualizationCard;
