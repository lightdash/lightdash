import { FeatureFlags, isAppVersionInProgress } from '@lightdash/common';
import { ActionIcon, Box, Loader, Stack, Text, Tooltip } from '@mantine/core';
import { IconAppsOff, IconMaximize } from '@tabler/icons-react';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import MantineIcon from '../components/common/MantineIcon';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { AskAiAgentMenuItem } from '../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem';
import AppIframePreview, {
    type AppIframePreviewHandle,
} from '../features/apps/AppIframePreview';
import AppInspectorPanel from '../features/apps/AppInspectorPanel';
import AppHeader from '../features/apps/components/AppHeader';
import AppHeaderActions from '../features/apps/components/AppHeaderActions';
import DataAppAiAgentContextBridge from '../features/apps/components/DataAppAiAgentContextBridge';
import { getVisiblePreviewTokenError } from '../features/apps/hooks/previewTokenQueryOptions';
import { useAppBuildPoller } from '../features/apps/hooks/useAppBuildPoller';
import { useAppInspector } from '../features/apps/hooks/useAppInspector';
import { useAppPreviewToken } from '../features/apps/hooks/useAppPreviewToken';
import { useCanEditDataApp } from '../features/apps/hooks/useCanEditDataApp';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import { usePreviewOrigin } from '../features/apps/previewOrigin';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useNativeFullscreenToggle from '../providers/Fullscreen/useNativeFullscreenToggle';
import classes from './AppPreviewTest.module.css';

export default function AppPreviewTest() {
    const navigate = useNavigate();
    const { appUuid, version: versionParam } = useParams();
    const projectUuid = useProjectUuid();

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
    const appSlug = firstPage?.slug ?? null;
    const appViews = firstPage?.views ?? null;
    // Latest build activity stands in for "last modified" — apps have no
    // updated-at of their own.
    const newestVersion = firstPage?.versions[0];
    const appLastModified = newestVersion
        ? (newestVersion.statusUpdatedAt ?? newestVersion.createdAt)
        : null;
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

    // Panel is opt-in here (most viewers aren't technical), but bridge events
    // are captured regardless so earlier queries show once it's opened.
    const identityKey = `${appUuid}:${version}`;
    const inspector = useAppInspector({ identityKey, defaultHidden: true });
    const { rolloverLogs } = inspector;

    // Manual refresh: bumping the counter changes the iframe URL, forcing a
    // reload so the app's metric queries re-fire. `invalidateCache` latches on
    // with the first refresh so those re-fired queries bypass the warehouse
    // results cache — the initial load still serves cached results fast.
    const [refreshKey, setRefreshKey] = useState(0);
    const [invalidateCache, setInvalidateCache] = useState(false);
    const handleRefresh = useCallback(() => {
        setRefreshKey((k) => k + 1);
        setInvalidateCache(true);
        rolloverLogs();
    }, [rolloverLogs]);

    const previewOrigin = usePreviewOrigin();

    // Presentation mode: native fullscreen with all Lightdash chrome hidden
    // (navbar hides itself via the shared context). Esc exits via the
    // browser's own fullscreen handling.
    const {
        enabled: isFullscreenFeatureEnabled,
        isFullscreen,
        handleToggleFullscreen,
    } = useNativeFullscreenToggle();

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

    const visibleTokenError = getVisiblePreviewTokenError(tokenError, !!token);
    const error = appQuery.error ?? visibleTokenError;

    const isForbidden =
        appQuery.error?.error?.statusCode === 403 ||
        visibleTokenError?.error?.statusCode === 403;
    if (isForbidden) {
        return <ForbiddenPanel />;
    }
    const isNotFound =
        appQuery.error?.error?.statusCode === 404 ||
        visibleTokenError?.error?.statusCode === 404;
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
    } else if (isTokenLoading || !previewUrl || !token) {
        body = <SuboptimalState loading title="Loading app..." />;
    } else {
        body = (
            <>
                <AppIframePreview
                    ref={previewRef}
                    src={previewUrl}
                    previewToken={token}
                    expectedPreviewOrigin={previewOrigin}
                    projectUuid={projectUuid}
                    appUuid={appUuid}
                    identityKey={identityKey}
                    onScreenshotAvailabilityChange={setScreenshotAvailable}
                    invalidateCache={invalidateCache}
                    urlStateSync
                    capabilities={{ gsheetExport: true }}
                    {...inspector.iframeProps}
                />
                {!inspector.hidden && !isFullscreen && (
                    <AppInspectorPanel
                        projectUuid={projectUuid}
                        defaultCollapsed={false}
                        hideWhenEmpty={false}
                        {...inspector.panelProps}
                    />
                )}
            </>
        );
    }

    return (
        <Box
            className={
                isFullscreen
                    ? `${classes.previewContainer} ${classes.previewContainerFullscreen}`
                    : classes.previewContainer
            }
        >
            {firstPage && (
                <DataAppAiAgentContextBridge
                    projectUuid={projectUuid}
                    appUuid={firstPage.appUuid}
                />
            )}
            {!isFullscreen && (
                <AppHeader
                    projectUuid={projectUuid}
                    app={{
                        uuid: appUuid,
                        name: appName,
                        description: appDescription,
                        spaceUuid: appSpaceUuid,
                        spaceName: appSpaceName,
                        createdByUserUuid: appCreatedByUserUuid,
                        latestVersionNumber: latestReadyVersion ?? null,
                        latestVersionStatus: latestReadyVersion
                            ? 'ready'
                            : null,
                        lastModified: appLastModified,
                        views: appViews,
                        slug: appSlug,
                    }}
                    rightSection={
                        <AppHeaderActions
                            capturedQueryCount={inspector.readyQueryCount}
                            fullscreenToggle={
                                isFullscreenFeatureEnabled &&
                                document.fullscreenEnabled ? (
                                    <Tooltip
                                        label="Enter Fullscreen Mode"
                                        position="bottom"
                                        openDelay={200}
                                        transitionProps={{
                                            transition: 'fade',
                                            duration: 150,
                                        }}
                                    >
                                        <ActionIcon
                                            variant="default"
                                            size="md"
                                            onClick={handleToggleFullscreen}
                                            aria-label="Enter Fullscreen Mode"
                                        >
                                            <MantineIcon
                                                icon={IconMaximize}
                                                size="md"
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                ) : null
                            }
                            projectUuid={projectUuid}
                            appUuid={appUuid}
                            upgrade={null}
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
                            onViewNetwork={inspector.show}
                            onDeleted={() => {
                                void navigate(`/projects/${projectUuid}/home`);
                            }}
                            onEdit={
                                canEditApp
                                    ? () =>
                                          void navigate(
                                              `/projects/${projectUuid}/apps/${appUuid}`,
                                          )
                                    : null
                            }
                            shareUrl={window.location.href}
                            navItem={null}
                            askAiItem={
                                <AskAiAgentMenuItem
                                    projectUuid={projectUuid}
                                    dataAppUuid={appUuid}
                                    clickedFrom={
                                        explicitVersion === undefined
                                            ? 'data_app_header'
                                            : 'data_app_version_header'
                                    }
                                />
                            }
                        />
                    }
                />
            )}
            <Box className={classes.previewBody}>{body}</Box>
        </Box>
    );
}
