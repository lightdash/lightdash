import { FeatureFlags, isAppVersionInProgress } from '@lightdash/common';
import { Box, Loader, Menu, Stack, Text } from '@mantine-8/core';
import { IconAppsOff, IconCode } from '@tabler/icons-react';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import MantineIcon from '../components/common/MantineIcon';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import ForbiddenPanel from '../components/ForbiddenPanel';
import AppIframePreview, {
    type AppIframePreviewHandle,
} from '../features/apps/AppIframePreview';
import AppInspectorPanel from '../features/apps/AppInspectorPanel';
import AppHeader from '../features/apps/components/AppHeader';
import AppHeaderActions from '../features/apps/components/AppHeaderActions';
import AppSpaceChip from '../features/apps/components/AppSpaceChip';
import { useAppBuildPoller } from '../features/apps/hooks/useAppBuildPoller';
import { useAppPreviewToken } from '../features/apps/hooks/useAppPreviewToken';
import { useCanEditDataApp } from '../features/apps/hooks/useCanEditDataApp';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import { useTrackedAppQueries } from '../features/apps/hooks/useTrackedAppQueries';
import { useTrackedExternalRequests } from '../features/apps/hooks/useTrackedExternalRequests';
import { usePreviewOrigin } from '../features/apps/previewOrigin';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import classes from './AppPreviewTest.module.css';

export default function AppPreviewTest() {
    const navigate = useNavigate();
    const {
        projectUuid,
        appUuid,
        version: versionParam,
    } = useParams<{
        projectUuid: string;
        appUuid: string;
        version: string;
    }>();

    const explicitVersion = versionParam ? Number(versionParam) : undefined;

    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);

    // Always fetch app to get creator info + latest ready version when needed.
    // The backend enforces space-aware view permissions and will 403 if the
    // user doesn't have access — we surface that as the error state below.
    const appQuery = useGetApp(projectUuid, appUuid);
    const firstPage = appQuery.data?.pages[0];

    // Authoritative across ALL versions — the ready version may be older than
    // the fetched page of versions, so never scan `versions` for it.
    const latestReadyVersion = firstPage?.latestReadyVersion ?? undefined;

    const appName = firstPage?.name ?? '';
    const appDescription = firstPage?.description ?? null;
    const appSpaceUuid = firstPage?.spaceUuid ?? null;
    const appSpaceName = firstPage?.spaceName ?? null;
    const appCreatedByUserUuid = firstPage?.createdByUserUuid ?? null;
    const canEditApp = useCanEditDataApp(projectUuid, {
        spaceUuid: appSpaceUuid,
        createdByUserUuid: appCreatedByUserUuid,
    });

    const version = explicitVersion ?? latestReadyVersion;

    // No successful build yet — distinguish "still building" (poll so the
    // preview swaps in automatically when the build finishes) from "failed" /
    // "never built".
    const latestVersion = firstPage?.versions[0];
    const hasNoReadyVersion =
        !!firstPage && firstPage.latestReadyVersion === null;
    const isBuildInProgress =
        hasNoReadyVersion &&
        !!latestVersion &&
        isAppVersionInProgress(latestVersion.status);
    const handleBuildDone = useCallback(() => {}, []);
    useAppBuildPoller(
        projectUuid,
        appUuid,
        !explicitVersion && isBuildInProgress,
        handleBuildDone,
    );

    const {
        data: token,
        isLoading: isTokenLoading,
        error: tokenError,
    } = useAppPreviewToken(projectUuid, appUuid, version);

    const [networkPanelHidden, setNetworkPanelHidden] = useState(true);

    // Data-lineage ("Inspect data"): click a value to reveal the query behind
    // it; hover a query row to highlight where it renders.
    const [lineageEnabled, setLineageEnabled] = useState(false);
    const [lineageAvailable, setLineageAvailable] = useState(false);
    const [hoveredQueryUuid, setHoveredQueryUuid] = useState<string | null>(
        null,
    );
    const [focusedQueryUuid, setFocusedQueryUuid] = useState<string | null>(
        null,
    );

    // Query tracking from the preview iframe. The panel is opt-in (hidden by
    // default in preview because most viewers aren't technical), but we wire
    // up the SDK bridge callback unconditionally so queries that run before
    // the user opens the panel are still captured.
    const { queries, handleQueryEvent, clearQueries } = useTrackedAppQueries();
    const {
        externalRequests,
        handleExternalRequestEvent,
        clearExternalRequests,
    } = useTrackedExternalRequests();

    // Manual refresh: bumping the counter changes the iframe URL, forcing a
    // reload so the app's metric queries re-fire. `invalidateCache` latches on
    // with the first refresh so those re-fired queries bypass the warehouse
    // results cache — the initial load still serves cached results fast.
    const [refreshKey, setRefreshKey] = useState(0);
    const [invalidateCache, setInvalidateCache] = useState(false);
    const handleRefresh = useCallback(() => {
        setRefreshKey((k) => k + 1);
        setInvalidateCache(true);
        clearQueries();
        clearExternalRequests();
    }, [clearQueries, clearExternalRequests]);

    const handleToggleLineage = useCallback(() => {
        setLineageEnabled((v) => !v);
        setFocusedQueryUuid(null);
    }, []);
    const handleLineageSelected = useCallback(
        (event: { queryUuid: string }) => {
            setNetworkPanelHidden(false);
            // Selection persists (row highlight + in-app element outline);
            // re-clicking the selected element deselects it.
            setFocusedQueryUuid((prev) =>
                prev === event.queryUuid ? null : event.queryUuid,
            );
        },
        [],
    );
    const handleLineageCancelled = useCallback(() => {
        setLineageEnabled(false);
        setFocusedQueryUuid(null);
    }, []);

    const previewOrigin = usePreviewOrigin();

    // Live-preview capture for the move modal's thumbnail checkbox — same
    // handshake pattern as the builder. Older templates never announce, so
    // the modal falls back to a default-state render for them.
    const previewRef = useRef<AppIframePreviewHandle>(null);
    const [screenshotAvailable, setScreenshotAvailable] = useState(false);
    const capturePreviewScreenshot = useCallback(async () => {
        const capture = previewRef.current?.captureScreenshot;
        if (!capture) {
            throw new Error('Screenshot capture is not available');
        }
        return capture();
    }, []);

    if (dataAppsFlag.isLoading) {
        return null;
    }
    if (!dataAppsFlag.data?.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    if (!projectUuid || !appUuid) {
        return <div>Missing route params</div>;
    }

    const error = appQuery.error ?? tokenError;

    const isForbidden =
        appQuery.error?.error?.statusCode === 403 ||
        tokenError?.error?.statusCode === 403;
    if (isForbidden) {
        return <ForbiddenPanel />;
    }
    const isNotFound =
        appQuery.error?.error?.statusCode === 404 ||
        tokenError?.error?.statusCode === 404;
    if (isNotFound) {
        return (
            <Box mt="30vh">
                <SuboptimalState
                    icon={IconAppsOff}
                    title="Data app not found"
                    description="This data app doesn't exist or has been deleted."
                />
            </Box>
        );
    }

    if (appQuery.isLoading) {
        return (
            <Stack align="center" justify="center" h="calc(100vh - 50px)">
                <Loader size="md" />
                <Text size="sm" c="dimmed">
                    Loading app...
                </Text>
            </Stack>
        );
    }

    if (error) {
        return (
            <Stack align="center" justify="center" h="calc(100vh - 50px)">
                <Text c="red" size="sm">
                    Failed to load app:{' '}
                    {error instanceof Error ? error.message : 'Unknown error'}
                </Text>
            </Stack>
        );
    }

    const previewUrl = token
        ? `${previewOrigin}/api/apps/${appUuid}/versions/${version}/t/${token}/?r=${refreshKey}#transport=postMessage&projectUuid=${projectUuid}`
        : undefined;

    // App data is loaded — always render the header chrome so users can still
    // navigate (rename, delete, "Continue building", …) when there's nothing
    // to preview yet.
    let body: ReactNode;
    if (!explicitVersion && hasNoReadyVersion) {
        // Deliberately neutral: don't surface build failures or their status
        // messages here — that's builder territory and too technical (and
        // potentially too revealing) for viewers of the preview.
        body = isBuildInProgress ? (
            <SuboptimalState
                loading
                title="This app is still building"
                description="The preview will load automatically once the build is ready."
            />
        ) : (
            <SuboptimalState
                icon={IconAppsOff}
                title="This app hasn't been built yet"
                description="There's no ready version of this app to preview yet."
            />
        );
    } else if (isTokenLoading || !previewUrl) {
        body = <SuboptimalState loading title="Loading app..." />;
    } else {
        body = (
            <>
                <AppIframePreview
                    ref={previewRef}
                    src={previewUrl}
                    expectedPreviewOrigin={previewOrigin}
                    projectUuid={projectUuid}
                    appUuid={appUuid}
                    identityKey={`${appUuid}:${version}`}
                    onScreenshotAvailabilityChange={setScreenshotAvailable}
                    invalidateCache={invalidateCache}
                    onQueryEvent={handleQueryEvent}
                    onExternalRequestEvent={handleExternalRequestEvent}
                    urlStateSync
                    capabilities={{ gsheetExport: true }}
                    lineageEnabled={lineageEnabled}
                    onLineageAvailabilityChange={setLineageAvailable}
                    onLineageSelected={handleLineageSelected}
                    lineageHighlightQueryUuid={
                        // Hover overrides; falls back to the persistent
                        // click-selection.
                        hoveredQueryUuid ?? focusedQueryUuid
                    }
                    onLineageCancelled={handleLineageCancelled}
                />
                {!networkPanelHidden && (
                    <AppInspectorPanel
                        queries={queries}
                        projectUuid={projectUuid}
                        onClearQueries={clearQueries}
                        externalRequests={externalRequests}
                        onClearExternalRequests={clearExternalRequests}
                        defaultCollapsed={false}
                        hideWhenEmpty={false}
                        onDismiss={() => setNetworkPanelHidden(true)}
                        onHoverQuery={setHoveredQueryUuid}
                        focusedQueryUuid={focusedQueryUuid}
                        lineageEnabled={lineageEnabled}
                        lineageAvailable={lineageAvailable}
                        onToggleLineage={handleToggleLineage}
                    />
                )}
            </>
        );
    }

    return (
        <Box className={classes.previewContainer}>
            <AppHeader
                appUuid={appUuid}
                name={appName}
                description={appDescription}
                spaceChip={
                    <AppSpaceChip
                        projectUuid={projectUuid}
                        spaceName={appSpaceName}
                        capturePreviewScreenshot={
                            screenshotAvailable
                                ? capturePreviewScreenshot
                                : null
                        }
                        app={{
                            uuid: appUuid,
                            name: appName,
                            description: appDescription ?? undefined,
                            spaceUuid: appSpaceUuid,
                            createdByUserUuid: appCreatedByUserUuid,
                            latestVersionNumber: latestReadyVersion ?? null,
                            latestVersionStatus: latestReadyVersion
                                ? 'ready'
                                : null,
                        }}
                    />
                }
                rightSection={
                    <AppHeaderActions
                        projectUuid={projectUuid}
                        appUuid={appUuid}
                        appName={appName}
                        appDescription={appDescription}
                        appSpaceUuid={appSpaceUuid}
                        appCreatedByUserUuid={appCreatedByUserUuid}
                        latestVersionNumber={latestReadyVersion ?? null}
                        latestVersionStatus={
                            latestReadyVersion ? 'ready' : null
                        }
                        onRefresh={handleRefresh}
                        refreshDisabled={version === undefined}
                        captureThumbnail={null}
                        capturePreviewScreenshot={
                            screenshotAvailable
                                ? capturePreviewScreenshot
                                : null
                        }
                        onViewNetwork={() => setNetworkPanelHidden(false)}
                        onDeleted={() => {
                            void navigate(`/projects/${projectUuid}/home`);
                        }}
                        navItem={
                            canEditApp ? (
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon
                                            icon={IconCode}
                                            size={14}
                                        />
                                    }
                                    onClick={() =>
                                        navigate(
                                            `/projects/${projectUuid}/apps/${appUuid}`,
                                        )
                                    }
                                >
                                    Continue building
                                </Menu.Item>
                            ) : null
                        }
                    />
                }
            />
            <Box className={classes.previewBody}>{body}</Box>
        </Box>
    );
}
