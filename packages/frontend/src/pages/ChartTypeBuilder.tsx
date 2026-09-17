import {
    ChartType,
    DATA_APP_VIZ_TEMPLATE,
    FeatureFlags,
    type ItemsMap,
} from '@lightdash/common';
import { Box, Button } from '@mantine/core';
import { useEffect, useMemo, useState, type FC } from 'react';
import {
    Link,
    Navigate,
    useLocation,
    useNavigate,
    useParams,
} from 'react-router';
import { validate as isUuidString } from 'uuid';
import { DocumentTitle } from '../components/common/DocumentTitle';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import { useCanCreateDataApp } from '../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../features/apps/hooks/useCanEditDataApp';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import ChartTypeBuilderHeader from '../features/chartTypes/builder/ChartTypeBuilderHeader';
import ChartTypeBuilderWorkspace from '../features/chartTypes/builder/ChartTypeBuilderWorkspace';
import ConfigurePanel from '../features/chartTypes/builder/ConfigurePanel';
import { useChartTypeBuilderWorkspace } from '../features/chartTypes/builder/useChartTypeBuilderWorkspace';
import { useConfigurePanelState } from '../features/chartTypes/builder/useConfigurePanelState';
import ChartTypePreviewTableModal from '../features/chartTypes/components/ChartTypePreviewTableModal';
import { chartTypeBuilderPath } from '../features/chartTypes/utils/chartTypeBuilderPath';
import { buildSampleVizContext } from '../features/chartTypes/utils/sampleVizContext';
import { useResolvedColorPalette } from '../hooks/appearance/useResolvedColorPalette';
import {
    getExplorerUrlFromCreateSavedChartVersion,
    parseChartFromExplorerSearchParams,
} from '../hooks/useExplorerRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import classes from './ChartTypeBuilder.module.css';

// No chart query here; auto-mapping belongs to charts binding fields.
const NO_ITEMS: ItemsMap = {};

/**
 * The dedicated chart type builder. Mounted at both `chart-types/new`
 * (create) and `chart-types/:dataAppVizUuid` (edit); the create flow
 * adopts the new uuid into the URL once the first build is accepted.
 */
const ChartTypeBuilder: FC = () => {
    const { dataAppVizUuid: urlVizUuid } = useParams();
    const projectUuid = useProjectUuid();
    const location = useLocation();
    const navigate = useNavigate();
    const [isPreviewTableOpen, setIsPreviewTableOpen] = useState(false);
    const explorerChart = useMemo(() => {
        try {
            const chart = parseChartFromExplorerSearchParams(location.search);
            return chart?.tableName ? chart : null;
        } catch {
            return null;
        }
    }, [location.search]);
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const canCreate = useCanCreateDataApp(projectUuid);

    // `useGetApp` accepts slugs, so the raw URL param is the right key.
    const appQuery = useGetApp(projectUuid, urlVizUuid);
    const appMeta = appQuery.data?.pages[0] ?? null;
    // The uuid every uuid-keyed hook runs against; a slug URL resolves to it
    // once the app row loads.
    const activeVizUuid =
        appMeta?.appUuid ??
        (isUuidString(urlVizUuid ?? '') ? urlVizUuid : undefined);

    const workspace = useChartTypeBuilderWorkspace({
        projectUuid,
        dataAppVizUuid: activeVizUuid ?? null,
        creationExperience: 'chart_type_builder',
        itemsMap: NO_ITEMS,
    });
    const { build, history, isBuilding, isHistoryOpen } = workspace;
    const panel = useConfigurePanelState(activeVizUuid ?? null);

    // On `/new`, move to the edit route as soon as the build claims an app so
    // a refresh mid-build lands on the in-progress version.
    useEffect(() => {
        if (!urlVizUuid && build.appUuid && projectUuid) {
            void navigate(
                {
                    pathname: chartTypeBuilderPath(projectUuid, build.appUuid),
                    search: location.search,
                },
                { replace: true },
            );
        }
    }, [urlVizUuid, build.appUuid, projectUuid, location.search, navigate]);

    const colorPalette = useResolvedColorPalette(
        projectUuid,
        panel.colorPaletteUuid,
    );
    const previewData =
        workspace.history.versions.find(
            (version) => version.version === workspace.previewVersion,
        )?.resources?.vizPreview ?? null;
    // The sample-data preview context, rebuilt on any option or palette edit.
    const previewContext = useMemo(
        () =>
            workspace.dataAppViz?.schema
                ? buildSampleVizContext(
                      workspace.dataAppViz.schema,
                      colorPalette,
                      panel.optionValues,
                      previewData,
                  )
                : null,
        [
            workspace.dataAppViz?.schema,
            colorPalette,
            panel.optionValues,
            previewData,
        ],
    );

    const explorerDestination = useMemo(() => {
        if (!explorerChart || !activeVizUuid) return null;

        return getExplorerUrlFromCreateSavedChartVersion(
            projectUuid,
            {
                ...explorerChart,
                chartConfig: {
                    type: ChartType.DATA_APP_VIZ,
                    config: {
                        dataAppVizUuid: activeVizUuid,
                        fieldMapping: {},
                        optionValues: {},
                    },
                },
            },
            false,
        );
    }, [activeVizUuid, explorerChart, projectUuid]);

    const canEdit = useCanEditDataApp(projectUuid, {
        spaceUuid: appMeta?.spaceUuid ?? null,
        createdByUserUuid: appMeta?.createdByUserUuid ?? null,
    });

    if (!projectUuid) return null;
    if (dataAppsFlag.isLoading) return null;
    if (!dataAppsFlag.data?.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    const isCreateFlow = urlVizUuid === undefined && build.appUuid === null;
    if (isCreateFlow && !canCreate) {
        return <Navigate to={`/projects/${projectUuid}/chart-types`} replace />;
    }

    if (appQuery.error?.error.statusCode === 404) {
        return (
            <Box className={classes.root}>
                <Box className={classes.notFound}>
                    <SuboptimalState
                        title="Chart type not found"
                        description="It may have been deleted, or the link is wrong."
                        action={
                            <Button
                                component={Link}
                                to={`/projects/${projectUuid}/chart-types`}
                                variant="default"
                            >
                                Back to chart types
                            </Button>
                        }
                    />
                </Box>
            </Box>
        );
    }

    if (appMeta) {
        // A data app that isn't a chart type belongs in the app builder.
        if (appMeta.template !== DATA_APP_VIZ_TEMPLATE) {
            return (
                <Navigate
                    to={`/projects/${projectUuid}/apps/${appMeta.appUuid}`}
                    replace
                />
            );
        }
        if (!canEdit) {
            return (
                <Navigate to={`/projects/${projectUuid}/chart-types`} replace />
            );
        }
        // Server-enforced (registry apps are read-only); this only keeps
        // the builder UI from being reached for an official chart type.
        if (appMeta.registrySlug !== null) {
            return (
                <Navigate to={`/projects/${projectUuid}/chart-types`} replace />
            );
        }
    }

    // Remounted per viz so the selected tab belongs to the declaration on screen.
    const configurePanel = workspace.dataAppViz?.schema ? (
        <ConfigurePanel
            key={activeVizUuid}
            schema={workspace.dataAppViz.schema}
            optionValues={panel.optionValues}
            onOptionChange={panel.onOptionChange}
            colorPaletteUuid={panel.colorPaletteUuid}
            onPaletteChange={panel.onPaletteChange}
            resolvedColorPalette={colorPalette}
            isStale={workspace.isFetchingSchema}
        />
    ) : null;

    const backLink = explorerChart
        ? {
              label: 'Explorer',
              to: explorerDestination ?? {
                  pathname: `/projects/${projectUuid}/tables/${explorerChart.tableName}`,
                  search: location.search,
              },
          }
        : {
              label: 'Chart types',
              to: `/projects/${projectUuid}/chart-types`,
          };

    return (
        <Box className={classes.root}>
            <DocumentTitle title="Chart Studio" />
            <ChartTypeBuilderHeader
                projectUuid={projectUuid}
                appUuidOrSlug={urlVizUuid}
                backLink={backLink}
                app={appMeta}
                latestReadyVersion={history.latestReadyVersion}
                hasHistory={workspace.hasHistory}
                isHistoryOpen={isHistoryOpen}
                upgrade={
                    activeVizUuid && history.latestReadyVersion !== null
                        ? { ...workspace.sdkUpgradeOffer, disabled: isBuilding }
                        : null
                }
                onUpgradeStarted={workspace.openHistory}
                onToggleHistory={workspace.toggleHistory}
                previewInExplorerLink={explorerDestination}
                onPreviewInExplorer={
                    activeVizUuid ? () => setIsPreviewTableOpen(true) : null
                }
            />
            <ChartTypeBuilderWorkspace
                projectUuid={projectUuid}
                workspace={workspace}
                previewContext={previewContext}
                syncPreviewUrlState
                configurePanel={configurePanel}
            />
            {isPreviewTableOpen && activeVizUuid && (
                <ChartTypePreviewTableModal
                    projectUuid={projectUuid}
                    dataAppVizUuid={activeVizUuid}
                    registrySlug={appMeta?.registrySlug ?? null}
                    onClose={() => setIsPreviewTableOpen(false)}
                />
            )}
        </Box>
    );
};

export default ChartTypeBuilder;
