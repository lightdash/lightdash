import {
    ChartType,
    FeatureFlags,
    getAppDisplayName,
    type DataAppVizOptionValues,
    type ItemsMap,
} from '@lightdash/common';
import { Button, Group } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../../../features/apps/hooks/useCanEditDataApp';
import { useDeleteApp } from '../../../features/apps/hooks/useDeleteApp';
import { useChartTypeBuilderWorkspace } from '../../../features/chartTypes/builder/useChartTypeBuilderWorkspace';
import { useDataAppVizResolvedColors } from '../../../features/chartTypes/hooks/useDataAppVizResolvedColors';
import {
    buildExplorerVizContext,
    resolveExplorerVizFieldMapping,
} from '../../../features/chartTypes/utils/explorerVizContext';
import {
    explorerActions,
    selectChartConfig,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useHealth from '../../../hooks/health/useHealth';
import useToaster from '../../../hooks/toaster/useToaster';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { type ChartTypeAuthoringState } from '../../../providers/Explorer/types';
import Callout from '../../common/Callout';
import { CHART_GALLERY_SIDEBAR_TITLE_ID } from '../../common/ChartGallery/ChartGalleryContext';
import MantineModal from '../../common/MantineModal';
import { useSelectProjectChartType } from '../../VisualizationConfigs/CustomChartType/useSelectProjectChartType';
import { useDirtyPivotConfiguration } from '../VisualizationCard/useDirtyPivotConfiguration';
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
    const { showToastError, showToastSuccess } = useToaster();
    const selectProjectChartType = useSelectProjectChartType();
    const { mutate: deleteApp } = useDeleteApp();

    const { resultsData, isLoadingQueryResults } = useExplorerResultsData();
    // Every page, so the preview sees what the chart would.
    useEffect(() => {
        resultsData.setFetchAll(true);
    }, [resultsData]);
    const itemsMap = resultsData.fields ?? NO_ITEMS;

    // The same staleness signal the chart card shows: results computed with
    // pivot settings that no longer match the configuration.
    const health = useHealth();
    const dirtyPivotConfiguration = useDirtyPivotConfiguration();

    const workspace = useChartTypeBuilderWorkspace({
        projectUuid,
        dataAppVizUuid: authoring.dataAppVizUuid,
        // The pre-builder explorer surface reported this source; the
        // embedded builder is its successor.
        creationExperience: 'explorer_chart_config',
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
        // Binding before the query's fields land would commit an empty
        // field mapping for the whole session; wait for them.
        if (itemsMap === NO_ITEMS) return;
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

    // Ref so the forbidden-exit effect can call cleanup without stale closures.
    const cleanupAbandonedTypeRef = useRef<() => void>(() => {});

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
        (dataAppViz !== undefined && !canEdit) ||
        (dataAppViz !== undefined && dataAppViz.registrySlug !== null);
    useEffect(() => {
        if (!isForbidden) return;
        showToastError({ title: 'You cannot author this chart type' });
        // Run the same cleanup as a manual cancel to avoid orphaned drafts.
        cleanupAbandonedTypeRef.current();
        dispatch(explorerActions.cancelChartTypeAuthoring());
    }, [isForbidden, showToastError, dispatch]);

    const colorPalette = useExplorerChartColorPalette(projectUuid);
    const schema = dataAppViz?.schema ?? null;
    const persistedFieldMapping = chartTypeConfig?.fieldMapping ?? null;
    const optionValues = chartTypeConfig?.optionValues ?? NO_OPTIONS;
    const previewFieldMapping = useMemo(
        () =>
            schema
                ? resolveExplorerVizFieldMapping({
                      schema,
                      itemsMap,
                      persistedFieldMapping,
                  })
                : {},
        [schema, itemsMap, persistedFieldMapping],
    );
    const resolvedColors = useDataAppVizResolvedColors({
        itemsMap,
        rows: resultsData.rows,
        fieldMapping: previewFieldMapping,
        pivotDetails: resultsData.pivotDetails ?? null,
        colorPalette,
    });
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
                      resolvedColors,
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
            resolvedColors,
        ],
    );

    // The sidebar stays mounted, so it can take focus back from the workspace.
    const focusSidebar = () =>
        requestAnimationFrame(() =>
            document.getElementById(CHART_GALLERY_SIDEBAR_TITLE_ID)?.focus(),
        );

    // One exit: keep the type the chart now uses, or, with nothing usable
    // built, put the chart back the way it was.
    const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
    // A running first build dies with the exit; a revision build survives it.
    const exitDiscardsBuild = build.isBuilding && build.draft !== null;
    const cleanupAbandonedType = () => {
        if (exitDiscardsBuild && build.discard) {
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
    };
    cleanupAbandonedTypeRef.current = cleanupAbandonedType;
    const performExit = () => {
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
            const typeName = dataAppViz
                ? getAppDisplayName(dataAppViz.name, dataAppViz.dataAppVizUuid)
                : 'this chart type';
            showToastSuccess({
                title: `Chart now uses ${typeName}${
                    history.latestReadyVersion !== null
                        ? ` v${history.latestReadyVersion}`
                        : ''
                }`,
            });
            dispatch(explorerActions.finishChartTypeAuthoring());
        } else {
            cleanupAbandonedType();
            dispatch(explorerActions.cancelChartTypeAuthoring());
        }
        focusSidebar();
    };
    const handleDone = () => {
        if (build.isBuilding) {
            setIsExitConfirmOpen(true);
            return;
        }
        performExit();
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
        <>
            {/* Esc routes through the same exit flow as Done; a stray click
                outside must not dump a running build. */}
            <MantineModal
                opened
                onClose={handleDone}
                title="Chart type builder"
                fullScreen
                cancelLabel={false}
                modalRootProps={{ closeOnClickOutside: false }}
                modalBodyProps={{ px: 'md', py: 'md' }}
            >
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
                        dataAppVizUuid !== null &&
                        history.latestReadyVersion !== null
                            ? {
                                  ...workspace.sdkUpgradeOffer,
                                  disabled: workspace.isBuilding,
                              }
                            : null
                    }
                    workspace={workspace}
                    previewContext={previewContext}
                    warning={
                        <VisualizationWarning
                            dirtyPivotConfiguration={dirtyPivotConfiguration}
                            chartConfig={chartConfig}
                            resultsData={resultsData}
                            isLoading={isLoadingQueryResults}
                            maxColumnLimit={
                                health.data?.pivotTable?.maxColumnLimit
                            }
                        />
                    }
                    onDetailsSaved={handleDetailsSaved}
                    onDone={handleDone}
                />
            </MantineModal>
            {isExitConfirmOpen && (
                <MantineModal
                    opened
                    onClose={() => setIsExitConfirmOpen(false)}
                    title="Build in progress"
                >
                    <Callout
                        variant={exitDiscardsBuild ? 'danger' : 'info'}
                        mb="md"
                    >
                        {exitDiscardsBuild
                            ? 'Leaving now discards the build that is still running.'
                            : 'The build keeps running and lands in version history when it finishes.'}
                    </Callout>
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={() => setIsExitConfirmOpen(false)}
                        >
                            Keep building
                        </Button>
                        <Button
                            color={exitDiscardsBuild ? 'red' : undefined}
                            onClick={() => {
                                setIsExitConfirmOpen(false);
                                performExit();
                            }}
                        >
                            {exitDiscardsBuild ? 'Discard and leave' : 'Leave'}
                        </Button>
                    </Group>
                </MantineModal>
            )}
        </>
    );
};

export default ExplorerChartTypeAuthoring;
