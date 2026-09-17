import {
    assertUnreachable,
    getAppDisplayName,
    getDataAppBuilderPath,
    getSdkFeatureTargetForTemplate,
    isAppVersionInProgress,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Group,
    Loader,
    Menu,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconAppWindow,
    IconArrowRight,
    IconCircleMinus,
    IconExternalLink,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useRef, useState, type FC, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import EmptyStateLoader from '../../../../../components/common/EmptyStateLoader';
import MantineIcon from '../../../../../components/common/MantineIcon';
import TruncatedText from '../../../../../components/common/TruncatedText';
import AppIframePreview, {
    type AppIframePreviewHandle,
} from '../../../../../features/apps/AppIframePreview';
import AppInspectorPanel from '../../../../../features/apps/AppInspectorPanel';
import AppActionsMenu from '../../../../../features/apps/components/AppActionsMenu';
import { ElementPickerButton } from '../../../../../features/apps/components/ElementPickerButton';
import LoadingDots from '../../../../../features/apps/components/LoadingDots';
import { RestoreAppVersionModal } from '../../../../../features/apps/components/RestoreAppVersionModal';
import { getVisiblePreviewTokenError } from '../../../../../features/apps/hooks/previewTokenQueryOptions';
import { useAppInspector } from '../../../../../features/apps/hooks/useAppInspector';
import { useAppPreviewToken } from '../../../../../features/apps/hooks/useAppPreviewToken';
import { useCanEditDataApp } from '../../../../../features/apps/hooks/useCanEditDataApp';
import { useCaptureThumbnail } from '../../../../../features/apps/hooks/useCaptureThumbnail';
import { useElementPicker } from '../../../../../features/apps/hooks/useElementPicker';
import { useGetApp } from '../../../../../features/apps/hooks/useGetApp';
import { useSdkUpgradeStatus } from '../../../../../features/apps/hooks/useSdkUpgradeStatus';
import { usePreviewOrigin } from '../../../../../features/apps/previewOrigin';
import { type ElementRef } from '../../../../../features/apps/utils/elementRefs';
import { useRestoreAiAgentThreadDataAppVersionMutation } from '../../hooks/useProjectAiAgents';
import { addThreadElementReference } from '../../store/aiAgentThreadElementRefsSlice';
import {
    clearPreview,
    selectElementPickerEnabled,
    setElementPickerEnabled,
    setDataAppPreviewVersion,
    type DataAppPreviewData,
} from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import artifactStyles from './AiArtifactPanel.module.css';
import { type DataAppBuildCardState } from './DataAppBuildCard/DataAppBuildCard';
import {
    DATA_APP_BUILD_CANCELLED_TITLE,
    DATA_APP_BUILD_FAILED_TITLE,
    getDataAppLatestVersionState,
} from './DataAppBuildCard/dataAppBuildCardState';
import { getEffectiveDataAppVersion } from './DataAppBuildCard/dataAppPreviewVersion';
import { DataAppVersionPill } from './DataAppVersionPill';

type Props = {
    dataAppPreview: DataAppPreviewData;
    /** Only the full-page thread panel hosts the network inspector and the
     *  element picker; the floating launcher preview is too small for them. */
    showInspector: boolean;
};

/** Shown in place of the iframe while the app has no ready version. */
const BuildStateBody: FC<{ state: DataAppBuildCardState }> = ({ state }) => {
    switch (state.kind) {
        case 'queued':
        case 'building':
            return (
                <Box className={artifactStyles.previewEmpty}>
                    <MantineIcon icon={IconAppWindow} size={48} />
                    <Text size="sm">Your app preview will appear here</Text>
                    <Text size="xs" c="dimmed">
                        {state.kind === 'building'
                            ? state.statusMessage
                            : 'Starting the build'}{' '}
                        <LoadingDots />
                    </Text>
                </Box>
            );
        case 'failed':
            return (
                <Box className={artifactStyles.previewEmpty}>
                    <MantineIcon icon={IconAlertTriangle} size={48} />
                    <Text size="sm">{DATA_APP_BUILD_FAILED_TITLE}</Text>
                    <Text size="xs" c="dimmed" ta="center">
                        {state.message}
                    </Text>
                </Box>
            );
        case 'cancelled':
            return (
                <Box className={artifactStyles.previewEmpty}>
                    <MantineIcon icon={IconCircleMinus} size={48} />
                    <Text size="sm">{DATA_APP_BUILD_CANCELLED_TITLE}</Text>
                </Box>
            );
        // A ready row without a ready version is a stale app read; the
        // refetch lands shortly.
        case 'ready':
        case 'unavailable':
            return <EmptyStateLoader />;
        default:
            return assertUnreachable(state, 'Unknown build state');
    }
};

export const AiDataAppPreviewPanel: FC<Props> = ({
    dataAppPreview,
    showInspector,
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const navigate = useNavigate();
    const {
        appUuid,
        projectUuid,
        agentUuid,
        threadUuid,
        version,
        latestReadyVersionAtOpen,
    } = dataAppPreview;

    const previewOrigin = usePreviewOrigin();
    const appQuery = useGetApp(projectUuid, appUuid);
    const app = appQuery.data?.pages[0];

    // Authoritative across ALL versions — the ready version may be older than
    // the fetched page of versions, so never scan `versions` for it.
    const latestReadyVersion = app?.latestReadyVersion ?? null;
    const effectiveVersion = getEffectiveDataAppVersion({
        version,
        latestReadyVersionAtOpen,
        latestReadyVersion,
    });
    // An explicit version newer than the cached latest (just restored) is
    // latest by definition, so compare rather than test equality.
    const isViewingOlderVersion =
        effectiveVersion !== null &&
        latestReadyVersion !== null &&
        effectiveVersion < latestReadyVersion;
    const identityKey = `${appUuid}:${effectiveVersion}`;
    // Lives here, not next to the iframe, so logs and dismissal survive the
    // token reload between versions. Only wired in when `showInspector`.
    const inspector = useAppInspector({ identityKey, defaultHidden: false });
    // Opened from the menu: keep the panel visible (collapsed bar) even before
    // the app issues its first query.
    const [inspectorPinned, setInspectorPinned] = useState(false);
    const hasInspectorLogs =
        inspector.panelProps.queries.length > 0 ||
        inspector.panelProps.externalRequests.length > 0;
    const isInspectorVisible =
        showInspector &&
        !inspector.hidden &&
        (inspectorPinned || hasInspectorLogs);
    const toggleInspector = () => {
        if (isInspectorVisible) {
            inspector.hide();
        } else {
            setInspectorPinned(true);
            inspector.show();
        }
    };
    const { onLineageCancelled } = inspector.iframeProps;

    // Bumping the key reloads the iframe so queries re-fire; `invalidateCache`
    // latches on with the first refresh so they bypass the warehouse cache.
    const [refreshKey, setRefreshKey] = useState(0);
    const [invalidateCache, setInvalidateCache] = useState(false);
    const { rolloverLogs } = inspector;
    const handleRefresh = useCallback(() => {
        setRefreshKey((k) => k + 1);
        setInvalidateCache(true);
        rolloverLogs();
    }, [rolloverLogs]);

    // Picked references go to the thread's composer state, not the hook's own
    // list, so they outlive closing the panel and the next version. They
    // always name the latest ready version, which is what the coding agent
    // iterates from.
    const appSlug = app?.slug;
    const appName = app?.name;
    const handlePick = useCallback(
        (ref: ElementRef) => {
            if (
                appSlug === undefined ||
                appName === undefined ||
                latestReadyVersion === null
            ) {
                return;
            }
            dispatch(
                addThreadElementReference({
                    threadUuid,
                    reference: {
                        appUuid,
                        appSlug,
                        appDisplayName: getAppDisplayName(appName, appUuid),
                        version: latestReadyVersion,
                        ...ref,
                    },
                }),
            );
        },
        [dispatch, threadUuid, appUuid, appSlug, appName, latestReadyVersion],
    );
    const pickerEnabled = useAiAgentStoreSelector(
        selectElementPickerEnabled(threadUuid),
    );
    const handlePickerEnabledChange = useCallback(
        (enabled: boolean) => {
            dispatch(setElementPickerEnabled({ threadUuid, enabled }));
        },
        [dispatch, threadUuid],
    );
    // Picker and lineage both claim clicks in the preview: one at a time.
    const picker = useElementPicker({
        identityKey,
        enabled: pickerEnabled,
        onEnabledChange: handlePickerEnabledChange,
        onEnabled: onLineageCancelled,
        onPick: handlePick,
    });
    const { lineageEnabled, onToggleLineage } = inspector.panelProps;
    const handleToggleLineage = () => {
        if (!lineageEnabled) picker.cancel();
        onToggleLineage();
    };

    const {
        data: token,
        isLoading: isTokenLoading,
        error: tokenError,
    } = useAppPreviewToken(projectUuid, appUuid, effectiveVersion ?? undefined);
    const visibleTokenError = getVisiblePreviewTokenError(tokenError, !!token);

    const isForbidden =
        appQuery.error?.error?.statusCode === 403 ||
        visibleTokenError?.error?.statusCode === 403;
    const isNotFound =
        appQuery.error?.error?.statusCode === 404 ||
        visibleTokenError?.error?.statusCode === 404;
    const otherError =
        !isForbidden && !isNotFound && (appQuery.error || visibleTokenError);

    const previewUrl =
        token && effectiveVersion !== null
            ? `${previewOrigin}/api/apps/${appUuid}/versions/${effectiveVersion}/t/${token}/?r=${refreshKey}#transport=postMessage&projectUuid=${projectUuid}`
            : undefined;

    const isPreviewMounted = !isTokenLoading && !!previewUrl && !!token;

    // Same offer the builder derives: keyed to the latest ready bundle (the
    // one an upgrade rebuilds from), not to the version on screen.
    const { offer: sdkUpgradeOffer, onSdkManifest: handleSdkManifest } =
        useSdkUpgradeStatus({
            target: getSdkFeatureTargetForTemplate(app?.template),
            bundleKey:
                latestReadyVersion !== null
                    ? `${appUuid}:${latestReadyVersion}`
                    : null,
            renderedKey: isPreviewMounted ? identityKey : null,
            isRendering:
                isPreviewMounted &&
                latestReadyVersion !== null &&
                effectiveVersion === latestReadyVersion,
        });
    const { onSdkManifest: onInspectorSdkManifest } = inspector.iframeProps;
    const handleIframeSdkManifest = useCallback<typeof handleSdkManifest>(
        (manifest) => {
            onInspectorSdkManifest(manifest);
            handleSdkManifest(manifest);
        },
        [onInspectorSdkManifest, handleSdkManifest],
    );

    const previewRef = useRef<AppIframePreviewHandle>(null);
    const [screenshotAvailable, setScreenshotAvailable] = useState(false);
    const capturePreviewScreenshot = useCallback(async () => {
        const capture = previewRef.current?.captureScreenshot;
        if (!capture) {
            throw new Error('Screenshot capture is not available');
        }
        return capture();
    }, []);
    const { captureThumbnail, isCapturing: isCapturingThumbnail } =
        useCaptureThumbnail({
            app: { projectUuid, appUuid },
            capture: capturePreviewScreenshot,
        });

    const returnToLatest = () =>
        dispatch(
            setDataAppPreviewVersion({
                version: null,
                latestReadyVersionAtOpen: latestReadyVersion,
            }),
        );

    // Same gate as Edit on the standalone view page.
    const canManageApp = useCanEditDataApp(projectUuid, {
        spaceUuid: app?.spaceUuid ?? null,
        createdByUserUuid: app?.createdByUserUuid ?? null,
    });
    // Versions come newest first; the backend refuses restores mid-build.
    const latestVersionStatus = app?.versions[0]?.status;
    const isBuildInProgress =
        latestVersionStatus !== undefined &&
        isAppVersionInProgress(latestVersionStatus);
    const [restoreTargetVersion, setRestoreTargetVersion] = useState<
        number | null
    >(null);
    const restoreMutation = useRestoreAiAgentThreadDataAppVersionMutation(
        projectUuid,
        agentUuid,
        threadUuid,
    );
    const closeRestoreModal = () => {
        setRestoreTargetVersion(null);
        restoreMutation.reset();
    };
    const confirmRestore = (targetVersion: number) =>
        restoreMutation.mutate(
            { appUuid, version: targetVersion },
            {
                onSuccess: (result) => {
                    dispatch(
                        setDataAppPreviewVersion({
                            version: result.version,
                            latestReadyVersionAtOpen: result.version,
                        }),
                    );
                    closeRestoreModal();
                },
            },
        );
    const restore =
        canManageApp && effectiveVersion !== null
            ? {
                  onClick: () => setRestoreTargetVersion(effectiveVersion),
                  disabledReason: isBuildInProgress
                      ? 'A version is building; restore once it finishes.'
                      : null,
              }
            : null;

    const closeButton = (
        <ActionIcon
            size="sm"
            onClick={() => dispatch(clearPreview())}
            aria-label="Close"
        >
            <MantineIcon icon={IconX} />
        </ActionIcon>
    );

    const renderMessage = (message: string) => (
        <Box className={artifactStyles.floatingPanel}>
            <Center className={artifactStyles.loading}>
                <Stack gap="xs" align="center">
                    <Text size="xs" c="dimmed" ta="center">
                        {message}
                    </Text>
                    {closeButton}
                </Stack>
            </Center>
        </Box>
    );

    if (isNotFound) {
        return renderMessage('This data app no longer exists.');
    }
    if (isForbidden) {
        return renderMessage(
            "You don't have permission to view this data app.",
        );
    }
    if (otherError) {
        return renderMessage('Failed to load data app. Please try again.');
    }

    if (appQuery.isLoading || !app) {
        return (
            <Box className={artifactStyles.floatingPanel}>
                <Center className={artifactStyles.loading}>
                    <Stack gap="xs" align="center">
                        <Loader
                            type="dots"
                            color="ldGray.6"
                            delayedMessage="Loading data app..."
                        />
                        {closeButton}
                    </Stack>
                </Center>
            </Box>
        );
    }

    // No ready version to render: the newest version is building or failed.
    const buildState =
        effectiveVersion === null ? getDataAppLatestVersionState(app) : null;
    const isRenderingVersion = buildState === null;

    let body: ReactNode;
    if (buildState !== null) {
        body = <BuildStateBody state={buildState} />;
    } else if (isTokenLoading || !previewUrl || !token) {
        body = (
            <Center h="100%">
                <Loader
                    type="dots"
                    color="ldGray.6"
                    delayedMessage="Loading data app..."
                />
            </Center>
        );
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
                    capabilities={{ gsheetExport: true }}
                    invalidateCache={invalidateCache}
                    onScreenshotAvailabilityChange={setScreenshotAvailable}
                    {...(showInspector
                        ? { ...inspector.iframeProps, ...picker.iframeProps }
                        : {})}
                    onSdkManifest={
                        showInspector
                            ? handleIframeSdkManifest
                            : handleSdkManifest
                    }
                />
                {showInspector && !inspector.hidden && (
                    <AppInspectorPanel
                        projectUuid={projectUuid}
                        hideWhenEmpty={!inspectorPinned}
                        {...inspector.panelProps}
                        onToggleLineage={handleToggleLineage}
                    />
                )}
            </>
        );
    }

    const appUrl = isViewingOlderVersion
        ? `/projects/${projectUuid}/apps/${appUuid}/versions/${effectiveVersion}/view`
        : `/projects/${projectUuid}/apps/${appUuid}/view`;

    return (
        <Box className={artifactStyles.floatingPanel}>
            <Box className={artifactStyles.floatingContent}>
                <Box className={artifactStyles.head}>
                    <Stack gap={0} flex={1} miw={0}>
                        <TruncatedText fz="sm" fw={600} maxWidth="100%">
                            {getAppDisplayName(app.name, appUuid)}
                        </TruncatedText>
                        {app.description && (
                            <TruncatedText fz="xs" c="dimmed" maxWidth="100%">
                                {app.description}
                            </TruncatedText>
                        )}
                    </Stack>

                    <Group gap={2} className={artifactStyles.headRight}>
                        <AppActionsMenu
                            projectUuid={projectUuid}
                            appUuid={appUuid}
                            appName={app.name}
                            appDescription={app.description || null}
                            appSpaceUuid={app.spaceUuid}
                            appCreatedByUserUuid={app.createdByUserUuid}
                            verification={app.verification ?? null}
                            latestVersionNumber={latestReadyVersion}
                            latestVersionStatus={
                                latestReadyVersion !== null ? 'ready' : null
                            }
                            navItem={
                                <>
                                    <Menu.Item
                                        component="a"
                                        href={appUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconExternalLink}
                                                size={14}
                                            />
                                        }
                                    >
                                        Open in new tab
                                    </Menu.Item>
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon
                                                icon={IconArrowRight}
                                                size={14}
                                            />
                                        }
                                        onClick={() =>
                                            void navigate(
                                                getDataAppBuilderPath(
                                                    projectUuid,
                                                    appUuid,
                                                ),
                                            )
                                        }
                                    >
                                        Continue in builder
                                    </Menu.Item>
                                </>
                            }
                            askAiItem={null}
                            viewNetwork={
                                showInspector && isRenderingVersion
                                    ? {
                                          label: isInspectorVisible
                                              ? 'Hide network'
                                              : 'Show network',
                                          onClick: toggleInspector,
                                      }
                                    : null
                            }
                            onRefresh={
                                isRenderingVersion ? handleRefresh : null
                            }
                            capturedQueryCount={
                                showInspector
                                    ? inspector.readyQueryCount
                                    : undefined
                            }
                            onDuplicated={({ appUuid: newAppUuid }) =>
                                window.open(
                                    `/projects/${projectUuid}/apps/${newAppUuid}`,
                                    '_blank',
                                )
                            }
                            onDeleted={() => dispatch(clearPreview())}
                            captureThumbnail={
                                isRenderingVersion
                                    ? {
                                          onCapture: () =>
                                              void captureThumbnail(),
                                          disabled:
                                              !isPreviewMounted ||
                                              !screenshotAvailable ||
                                              isCapturingThumbnail,
                                      }
                                    : null
                            }
                            capturePreviewScreenshot={
                                screenshotAvailable
                                    ? capturePreviewScreenshot
                                    : null
                            }
                            upgrade={{
                                ...sdkUpgradeOffer,
                                disabled:
                                    !isPreviewMounted || isBuildInProgress,
                            }}
                            target={{
                                size: 'sm',
                                variant: 'subtle',
                                ariaLabel: 'More options',
                                tooltip: 'More options',
                            }}
                        />
                        {showInspector &&
                            isRenderingVersion &&
                            picker.available &&
                            !isViewingOlderVersion && (
                                <ElementPickerButton
                                    enabled={picker.enabled}
                                    onToggle={picker.toggle}
                                />
                            )}
                        {closeButton}
                    </Group>
                </Box>

                <Box className={artifactStyles.previewBody}>
                    {body}
                    {isViewingOlderVersion && (
                        <DataAppVersionPill
                            version={effectiveVersion}
                            onReturnToLatest={returnToLatest}
                            restore={restore}
                        />
                    )}
                </Box>
            </Box>
            {restoreTargetVersion !== null && (
                <RestoreAppVersionModal
                    version={restoreTargetVersion}
                    isLoading={restoreMutation.isLoading}
                    error={restoreMutation.error}
                    onClose={closeRestoreModal}
                    onConfirm={() => confirmRestore(restoreTargetVersion)}
                />
            )}
        </Box>
    );
};
