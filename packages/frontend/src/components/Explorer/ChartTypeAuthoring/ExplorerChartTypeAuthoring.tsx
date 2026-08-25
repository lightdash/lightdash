import {
    ChartType,
    derivePivotConfigurationFromChart,
    FeatureFlags,
    getFieldsFromMetricQuery,
    type DataAppVizOptionValues,
    type ItemsMap,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, type FC } from 'react';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../../../features/apps/hooks/useCanEditDataApp';
import { useDeleteApp } from '../../../features/apps/hooks/useDeleteApp';
import { useChartTypeBuilderWorkspace } from '../../../features/chartTypes/builder/useChartTypeBuilderWorkspace';
import { buildExplorerVizContext } from '../../../features/chartTypes/utils/explorerVizContext';
import {
    explorerActions,
    selectChartConfig,
    selectUnsavedChartVersion,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useHealth from '../../../hooks/health/useHealth';
import useToaster from '../../../hooks/toaster/useToaster';
import { useExplore } from '../../../hooks/useExplore';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { type ChartTypeAuthoringState } from '../../../providers/Explorer/types';
import { CHART_GALLERY_SIDEBAR_TITLE_ID } from '../../common/ChartGallery/ChartGalleryContext';
import { RefreshButton } from '../../RefreshButton';
import { useSelectProjectChartType } from '../../VisualizationConfigs/CustomChartType/useSelectProjectChartType';
import { useExplorerChartColorPalette } from '../VisualizationCard/useExplorerChartColorPalette';
import { useExplorerResultsData } from '../VisualizationCard/useExplorerResultsData';
import VisualizationWarning from '../VisualizationCard/VisualizationWarning';
import ExplorerChartTypeAuthoringView from './ExplorerChartTypeAuthoringView';

// Stable identities, so the workspace does not rebind before results land.
const NO_ITEMS: ItemsMap = {};
const NO_OPTIONS: DataAppVizOptionValues = {};

type Props = {
    authoring: ChartTypeAuthoringState;
};

/** The builder hosted by the Explorer: the chart moves onto the type being
 *  authored, so the sidebar configures what the preview renders. */
const ExplorerChartTypeAuthoring: FC<Props> = ({ authoring }) => {
    const projectUuid = useProjectUuid();
    const dispatch = useExplorerDispatch();
    const queryClient = useQueryClient();
    const { showToastError } = useToaster();
    const selectProjectChartType = useSelectProjectChartType();
    const { mutate: deleteApp } = useDeleteApp();

    const {
        resultsData,
        isLoadingQueryResults,
        mergeResults,
        suppressPrimaryResults,
    } = useExplorerResultsData();
    // Every page, so the preview sees what the chart would.
    useEffect(() => {
        resultsData.setFetchAll(true);
    }, [resultsData]);
    const itemsMap = resultsData.fields ?? NO_ITEMS;

    // The same staleness signal the chart card shows: results computed with
    // pivot settings that no longer match the configuration.
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);
    const { data: explore } = useExplore(unsavedChartVersion.tableName);
    const health = useHealth();
    const visualizationMetricQuery = suppressPrimaryResults
        ? undefined
        : (mergeResults?.metricQuery ?? unsavedChartVersion.metricQuery);
    const dirtyPivotConfiguration = useMemo(() => {
        const fields =
            mergeResults?.fields ??
            (explore
                ? getFieldsFromMetricQuery(
                      unsavedChartVersion.metricQuery,
                      explore,
                  )
                : undefined);
        return visualizationMetricQuery && fields
            ? derivePivotConfigurationFromChart(
                  unsavedChartVersion,
                  visualizationMetricQuery,
                  fields,
              )
            : undefined;
    }, [unsavedChartVersion, visualizationMetricQuery, mergeResults, explore]);

    const workspace = useChartTypeBuilderWorkspace({
        projectUuid,
        dataAppVizUuid: authoring.dataAppVizUuid,
        itemsMap,
    });
    const { build, dataAppViz, dataAppVizUuid, history } = workspace;

    // A first build claimed an app; the session continues under it.
    useEffect(() => {
        if (authoring.dataAppVizUuid === null && build.appUuid) {
            dispatch(explorerActions.claimChartTypeAuthoringViz(build.appUuid));
        }
    }, [authoring.dataAppVizUuid, build.appUuid, dispatch]);

    // The sidebar lives outside this tree, so the pinned version reaches it
    // through the store and its options follow the previewed version.
    useEffect(() => {
        dispatch(
            explorerActions.viewChartTypeAuthoringVersion(
                workspace.viewedVersion,
            ),
        );
    }, [workspace.viewedVersion, dispatch]);

    const chartConfig = useExplorerSelector(selectChartConfig);
    const chartUsesThisType =
        chartConfig.type === ChartType.DATA_APP_VIZ &&
        dataAppVizUuid !== null &&
        chartConfig.config?.dataAppVizUuid === dataAppVizUuid;
    const chartTypeConfig =
        chartUsesThisType && chartConfig.type === ChartType.DATA_APP_VIZ
            ? (chartConfig.config ?? null)
            : null;

    // Bound once per type when its schema lands; the sidebar owns it after.
    const boundUuid = useRef<string | null>(null);
    useEffect(() => {
        if (!dataAppViz?.schema || dataAppVizUuid === null) return;
        if (chartUsesThisType || boundUuid.current === dataAppVizUuid) return;
        boundUuid.current = dataAppVizUuid;
        selectProjectChartType(dataAppViz, itemsMap);
    }, [
        dataAppViz,
        dataAppVizUuid,
        chartUsesThisType,
        itemsMap,
        selectProjectChartType,
    ]);

    // The entry points gate already; this closes a door opened by hand.
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const canCreate = useCanCreateDataApp(projectUuid);
    const canEdit = useCanEditDataApp(projectUuid, {
        spaceUuid: dataAppViz?.spaceUuid ?? null,
        createdByUserUuid: dataAppViz?.createdByUserUuid ?? null,
    });
    const isForbidden =
        (!dataAppsFlag.isLoading && !dataAppsFlag.data?.enabled) ||
        (dataAppVizUuid === null && !canCreate) ||
        (dataAppViz !== undefined && !canEdit);
    useEffect(() => {
        if (!isForbidden) return;
        showToastError({ title: 'You cannot author this chart type' });
        dispatch(explorerActions.cancelChartTypeAuthoring());
    }, [isForbidden, showToastError, dispatch]);

    const colorPalette = useExplorerChartColorPalette(projectUuid);
    const schema = dataAppViz?.schema ?? null;
    const persistedFieldMapping = chartTypeConfig?.fieldMapping ?? null;
    const optionValues = chartTypeConfig?.optionValues ?? NO_OPTIONS;
    const previewContext = useMemo(
        () =>
            schema
                ? buildExplorerVizContext({
                      schema,
                      itemsMap,
                      persistedFieldMapping,
                      rows: resultsData.rows,
                      pivotDetails: resultsData.pivotDetails ?? null,
                      colorPalette,
                      optionValues,
                  })
                : null,
        [
            schema,
            itemsMap,
            persistedFieldMapping,
            resultsData.rows,
            resultsData.pivotDetails,
            colorPalette,
            optionValues,
        ],
    );

    // The sidebar stays mounted, so it can take focus back from the workspace.
    const focusSidebar = () =>
        requestAnimationFrame(() =>
            document.getElementById(CHART_GALLERY_SIDEBAR_TITLE_ID)?.focus(),
        );

    // One exit: keep the type the chart now uses, or, with nothing usable
    // built, put the chart back the way it was.
    const handleDone = () => {
        if (chartUsesThisType && dataAppVizUuid !== null) {
            // The chart renders through metadata that may still hold the
            // version before this build; the gallery list may not know the
            // type yet.
            void queryClient.invalidateQueries({
                queryKey: [
                    'data-app-viz-render-metadata',
                    projectUuid,
                    dataAppVizUuid,
                ],
            });
            void queryClient.invalidateQueries({ queryKey: ['data-app-vizs'] });
            dispatch(explorerActions.finishChartTypeAuthoring());
        } else {
            if (build.isBuilding && build.draft !== null && build.discard) {
                // A first build still running would leave an orphan behind.
                build.discard();
            } else if (
                projectUuid &&
                authoring.createdInSession &&
                dataAppVizUuid !== null &&
                history.latestReadyVersion === null
            ) {
                // Created here and never got a usable version: nothing to keep.
                deleteApp({
                    projectUuid,
                    appUuid: dataAppVizUuid,
                    successTitle: 'Chart type discarded',
                });
            }
            dispatch(explorerActions.cancelChartTypeAuthoring());
        }
        focusSidebar();
    };

    // A rename lands in the app row; the type the header and rail read
    // comes from the viz queries.
    const handleDetailsSaved = () => {
        void queryClient.invalidateQueries({
            queryKey: ['data-app-viz', projectUuid, dataAppVizUuid],
        });
        void queryClient.invalidateQueries({ queryKey: ['data-app-vizs'] });
    };

    if (!projectUuid) return null;

    return (
        <ExplorerChartTypeAuthoringView
            projectUuid={projectUuid}
            app={
                dataAppViz
                    ? {
                          appUuid: dataAppViz.dataAppVizUuid,
                          name: dataAppViz.name,
                          description: dataAppViz.description,
                      }
                    : null
            }
            upgrade={
                dataAppVizUuid !== null && history.latestReadyVersion !== null
                    ? {
                          ...workspace.sdkUpgradeOffer,
                          disabled: workspace.isBuilding,
                      }
                    : null
            }
            workspace={workspace}
            previewContext={previewContext}
            runQuery={
                <>
                    <VisualizationWarning
                        dirtyPivotConfiguration={dirtyPivotConfiguration}
                        chartConfig={unsavedChartVersion.chartConfig}
                        resultsData={resultsData}
                        isLoading={isLoadingQueryResults}
                        maxColumnLimit={health.data?.pivotTable?.maxColumnLimit}
                    />
                    <RefreshButton size="xs" />
                </>
            }
            onDetailsSaved={handleDetailsSaved}
            onDone={handleDone}
        />
    );
};

export default ExplorerChartTypeAuthoring;
