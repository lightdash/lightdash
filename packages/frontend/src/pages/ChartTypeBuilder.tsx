import {
    DATA_APP_VIZ_TEMPLATE,
    FeatureFlags,
    isAppVersionInProgress,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
} from '@lightdash/common';
import { Box, Button } from '@mantine/core';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { validate as isUuidString } from 'uuid';
import { DocumentTitle } from '../components/common/DocumentTitle';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import BuilderCanvas from '../features/apps/builder/BuilderCanvas';
import BuilderPromptBar from '../features/apps/builder/BuilderPromptBar';
import ChartTypeBuilderHeader from '../features/apps/builder/ChartTypeBuilderHeader';
import ConfigurePanel from '../features/apps/builder/ConfigurePanel';
import VersionChips from '../features/apps/builder/VersionChips';
import { getAppVersionFailureMessage } from '../features/apps/getAppVersionFailureMessage';
import { useAppBuildPoller } from '../features/apps/hooks/useAppBuildPoller';
import { useAppVersionHistory } from '../features/apps/hooks/useAppVersionHistory';
import { useCanCreateDataApp } from '../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../features/apps/hooks/useCanEditDataApp';
import { useDataAppVisualization } from '../features/apps/hooks/useDataAppVisualization';
import { useDataAppVizBuild } from '../features/apps/hooks/useDataAppVizBuild';
import { useElapsedClock } from '../features/apps/hooks/useElapsedClock';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import { useUpdateApp } from '../features/apps/hooks/useUpdateApp';
import { buildSampleVizContext } from '../features/apps/utils/sampleVizContext';
import { useResolvedColorPalette } from '../hooks/appearance/useResolvedColorPalette';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import classes from './ChartTypeBuilder.module.css';

const noop = () => undefined;

/**
 * The dedicated chart type builder. Mounted at both `chart-types/new`
 * (create) and `chart-types/:dataAppVizUuid` (edit); the create flow
 * adopts the new uuid into the URL once the first build is accepted.
 */
const ChartTypeBuilder: FC = () => {
    const { projectUuid, dataAppVizUuid: urlVizUuid } = useParams<{
        projectUuid: string;
        dataAppVizUuid?: string;
    }>();
    const navigate = useNavigate();
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

    const build = useDataAppVizBuild({
        projectUuid,
        // No chart query here; auto-mapping belongs to charts binding fields.
        itemsMap: {},
        dataAppVizUuid: activeVizUuid ?? null,
        onCreated: noop,
    });

    const historyUuid = activeVizUuid ?? build.appUuid;
    const history = useAppVersionHistory(projectUuid ?? '', historyUuid);
    const { data: dataAppViz } = useDataAppVisualization(
        projectUuid,
        activeVizUuid,
    );

    // Covers builds sent here and builds found already running in history.
    const historyLatestInProgress =
        history.latest !== null &&
        isAppVersionInProgress(history.latest.status);
    const buildStartedAt =
        build.startedAt ??
        (historyLatestInProgress && history.latest
            ? new Date(history.latest.createdAt)
            : null);
    const elapsed = useElapsedClock(buildStartedAt);

    // On `/new`, move to the edit route as soon as the build claims an app so
    // a refresh mid-build lands on the in-progress version.
    useEffect(() => {
        if (!urlVizUuid && build.appUuid && projectUuid) {
            void navigate(
                `/projects/${projectUuid}/chart-types/${build.appUuid}`,
                { replace: true },
            );
        }
    }, [urlVizUuid, build.appUuid, projectUuid, navigate]);

    // Intentional navigation between vizs resets session state; the
    // post-submit `/new` → uuid replace must not.
    const prevUrlVizUuid = useRef(urlVizUuid);
    const [pin, setPin] = useState<{
        appUuid: string;
        version: number;
        /** Latest ready version at the moment of pinning; the pin is treated
         *  as cleared once a newer build finishes past this snapshot. */
        pinnedAtLatest: number | null;
    } | null>(null);
    // Only what the author explicitly changed; defaults resolve at render.
    const [optionValues, setOptionValues] = useState<DataAppVizOptionValues>(
        {},
    );
    // Preview-only; a chart using the viz owns the palette the normal way.
    const [colorPaletteUuid, setColorPaletteUuid] = useState<string | null>(
        null,
    );
    useEffect(() => {
        const prev = prevUrlVizUuid.current;
        prevUrlVizUuid.current = urlVizUuid;
        // Post-submit redirect: undefined → new uuid. Don't clear state.
        if (!prev && urlVizUuid) return;
        setPin(null);
        setOptionValues({});
        setColorPaletteUuid(null);
    }, [urlVizUuid]);

    const isBuilding = build.isBuilding || historyLatestInProgress;

    // A build started elsewhere needs polling here; a build sent from this
    // page already polls inside useDataAppVizBuild.
    const externalBuildRunning = !build.isBuilding && historyLatestInProgress;
    useAppBuildPoller(
        projectUuid,
        historyUuid ?? undefined,
        externalBuildRunning,
        noop,
    );

    // Derived pin: ignored when it belongs to another app, a newer version
    // landed since, or the pinned version is no longer ready.
    const effectiveViewedVersion = useMemo(() => {
        if (pin === null || pin.appUuid !== activeVizUuid) return null;
        if (
            pin.pinnedAtLatest !== null &&
            history.latestReadyVersion !== null &&
            history.latestReadyVersion > pin.pinnedAtLatest
        ) {
            return null;
        }
        const stillReady = history.versions.some(
            (v) => v.version === pin.version && v.status === 'ready',
        );
        return stillReady ? pin.version : null;
    }, [pin, activeVizUuid, history.latestReadyVersion, history.versions]);

    const previewVersion = effectiveViewedVersion ?? history.latestReadyVersion;

    const colorPalette = useResolvedColorPalette(projectUuid, colorPaletteUuid);
    // The sample-data preview context, rebuilt on any option or palette edit.
    const previewContext = useMemo(
        () =>
            dataAppViz?.schema
                ? buildSampleVizContext(
                      dataAppViz.schema,
                      colorPalette,
                      optionValues,
                  )
                : null,
        [dataAppViz?.schema, colorPalette, optionValues],
    );

    const handleOptionChange = useCallback(
        (name: string, value: DataAppVizOptionValue) =>
            setOptionValues((prev) => ({ ...prev, [name]: value })),
        [],
    );

    const handleView = useCallback(
        (version: number | null) => {
            if (version === null) {
                setPin(null);
                return;
            }
            if (!activeVizUuid) return;
            setPin({
                appUuid: activeVizUuid,
                version,
                pinnedAtLatest: history.latestReadyVersion,
            });
        },
        [activeVizUuid, history.latestReadyVersion],
    );

    const { mutate: updateApp } = useUpdateApp({ resourceLabel: 'Chart type' });
    const handleSaveMeta = useCallback(
        (patch: { name?: string; description?: string }) => {
            if (!projectUuid || !appMeta) return;
            updateApp({ projectUuid, appUuid: appMeta.appUuid, ...patch });
        },
        [projectUuid, appMeta, updateApp],
    );

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
        return <Navigate to={`/projects/${projectUuid}/gallery`} replace />;
    }

    if (appQuery.error?.error.statusCode === 404) {
        return (
            <Box className={classes.root}>
                <Box className={classes.main}>
                    <SuboptimalState
                        title="Chart type not found"
                        description="It may have been deleted, or the link is wrong."
                        action={
                            <Button
                                component={Link}
                                to={`/projects/${projectUuid}/gallery`}
                                variant="default"
                            >
                                Back to the gallery
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
            return <Navigate to={`/projects/${projectUuid}/gallery`} replace />;
        }
    }

    // The request in flight, or the stored prompt of a build found in history.
    const buildingPrompt =
        build.pendingPrompt ??
        (historyLatestInProgress ? (history.latest?.prompt ?? null) : null);
    // A first build on a brand-new viz is discarded whole; a revision is only
    // cancelled. Builds found in history (started elsewhere) offer no cancel.
    const onCancelBuild = build.isBuilding
        ? build.draft !== null
            ? build.discard
            : build.cancel
        : null;

    // With nothing renderable, the newest terminal version explains itself.
    const failureMessage =
        history.latestReadyVersion === null &&
        history.latest !== null &&
        !isAppVersionInProgress(history.latest.status) &&
        history.latest.status !== 'ready'
            ? getAppVersionFailureMessage(history.latest)
            : null;

    const provenanceVersion = history.hasOrigin
        ? history.oldest
        : history.latest;

    // Always beside the chart it configures; remounted per viz so the selected
    // tab belongs to the declaration on screen.
    const configurePanel = dataAppViz?.schema ? (
        <ConfigurePanel
            key={activeVizUuid}
            schema={dataAppViz.schema}
            optionValues={optionValues}
            onOptionChange={handleOptionChange}
            colorPaletteUuid={colorPaletteUuid}
            onPaletteChange={setColorPaletteUuid}
        />
    ) : null;

    return (
        <Box className={classes.root}>
            <DocumentTitle title="Chart type builder" />
            <ChartTypeBuilderHeader
                projectUuid={projectUuid}
                app={appMeta}
                latestReadyVersion={history.latestReadyVersion}
                provenanceVersion={provenanceVersion}
                hasOrigin={history.hasOrigin}
                onSaveMeta={handleSaveMeta}
                onPreviewInExplorer={() =>
                    void navigate(
                        `/projects/${projectUuid}/tables?dataAppVizUuid=${activeVizUuid}`,
                    )
                }
            />
            <Box className={classes.main}>
                {activeVizUuid && history.versions.length > 0 && (
                    <VersionChips
                        projectUuid={projectUuid}
                        appUuid={activeVizUuid}
                        versions={history.versions}
                        latestReadyVersion={history.latestReadyVersion}
                        viewedVersion={effectiveViewedVersion}
                        onView={handleView}
                        build={build}
                        hasEarlier={history.hasEarlier}
                        isFetchingEarlier={history.isFetchingEarlier}
                        fetchEarlier={history.fetchEarlier}
                    />
                )}
                <BuilderCanvas
                    projectUuid={projectUuid}
                    appUuid={activeVizUuid ?? null}
                    previewVersion={previewVersion}
                    isBuilding={isBuilding}
                    buildingPrompt={buildingPrompt}
                    elapsed={elapsed}
                    onCancelBuild={onCancelBuild}
                    failureMessage={failureMessage}
                    previewContext={previewContext}
                    configurePanel={configurePanel}
                />
                {/* The composer captures its placeholder at mount, so wait for
                    history before choosing create vs revise wording. */}
                {!(activeVizUuid && history.isLoading) && (
                    <BuilderPromptBar
                        projectUuid={projectUuid}
                        composerAppUuid={activeVizUuid ?? build.draftAppUuid}
                        hasVersions={history.versions.length > 0}
                        build={build}
                        onCancelBuild={onCancelBuild}
                    />
                )}
            </Box>
        </Box>
    );
};

export default ChartTypeBuilder;
