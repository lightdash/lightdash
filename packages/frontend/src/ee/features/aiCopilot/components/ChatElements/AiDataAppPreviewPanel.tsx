import { getAppDisplayName, isAppVersionInProgress } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Group,
    Loader,
    Menu,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowsUpDown,
    IconDots,
    IconExternalLink,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import TruncatedText from '../../../../../components/common/TruncatedText';
import AppIframePreview from '../../../../../features/apps/AppIframePreview';
import AppInspectorPanel from '../../../../../features/apps/AppInspectorPanel';
import { ElementPickerButton } from '../../../../../features/apps/components/ElementPickerButton';
import { RestoreAppVersionModal } from '../../../../../features/apps/components/RestoreAppVersionModal';
import { getVisiblePreviewTokenError } from '../../../../../features/apps/hooks/previewTokenQueryOptions';
import { useAppInspector } from '../../../../../features/apps/hooks/useAppInspector';
import { useAppPreviewToken } from '../../../../../features/apps/hooks/useAppPreviewToken';
import { useCanEditDataApp } from '../../../../../features/apps/hooks/useCanEditDataApp';
import { useElementPicker } from '../../../../../features/apps/hooks/useElementPicker';
import { useGetApp } from '../../../../../features/apps/hooks/useGetApp';
import { usePreviewOrigin } from '../../../../../features/apps/previewOrigin';
import { type ElementRef } from '../../../../../features/apps/utils/elementRefs';
import { useRestoreAiAgentThreadDataAppVersionMutation } from '../../hooks/useProjectAiAgents';
import { addThreadElementReference } from '../../store/aiAgentThreadElementRefsSlice';
import {
    clearPreview,
    setDataAppPreviewVersion,
    type DataAppPreviewData,
} from '../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import artifactStyles from './AiArtifactPanel.module.css';
import { getEffectiveDataAppVersion } from './DataAppBuildCard/dataAppPreviewVersion';
import { DataAppVersionPill } from './DataAppVersionPill';

type Props = {
    dataAppPreview: DataAppPreviewData;
    /** Only the full-page thread panel hosts the network inspector and the
     *  element picker; the floating launcher preview is too small for them. */
    showInspector: boolean;
};

export const AiDataAppPreviewPanel: FC<Props> = ({
    dataAppPreview,
    showInspector,
}) => {
    const dispatch = useAiAgentStoreDispatch();
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
    // Picker and lineage both claim clicks in the preview: one at a time.
    const picker = useElementPicker({
        identityKey,
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
    const hasNoReadyVersion =
        !appQuery.isLoading && !appQuery.error && effectiveVersion === null;
    const otherError =
        !isForbidden && !isNotFound && (appQuery.error || visibleTokenError);

    const previewUrl =
        token && effectiveVersion !== null
            ? `${previewOrigin}/api/apps/${appUuid}/versions/${effectiveVersion}/t/${token}/#transport=postMessage&projectUuid=${projectUuid}`
            : undefined;

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
    if (hasNoReadyVersion) {
        return renderMessage("This data app hasn't finished building yet.");
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

    let body: ReactNode;
    if (isTokenLoading || !previewUrl || !token) {
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
                    src={previewUrl}
                    previewToken={token}
                    expectedPreviewOrigin={previewOrigin}
                    projectUuid={projectUuid}
                    appUuid={appUuid}
                    identityKey={identityKey}
                    capabilities={{ gsheetExport: true }}
                    {...(showInspector
                        ? { ...inspector.iframeProps, ...picker.iframeProps }
                        : {})}
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
                        <Menu position="bottom-end">
                            <Menu.Target>
                                <Tooltip label="More options">
                                    <ActionIcon
                                        size="sm"
                                        aria-label="More options"
                                    >
                                        <MantineIcon icon={IconDots} />
                                    </ActionIcon>
                                </Tooltip>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item
                                    component="a"
                                    href={appUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconExternalLink}
                                            size="sm"
                                        />
                                    }
                                >
                                    Open in new tab
                                </Menu.Item>
                                {showInspector && (
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon
                                                icon={IconArrowsUpDown}
                                                size="sm"
                                            />
                                        }
                                        onClick={toggleInspector}
                                    >
                                        {isInspectorVisible
                                            ? 'Hide network'
                                            : 'Show network'}
                                    </Menu.Item>
                                )}
                            </Menu.Dropdown>
                        </Menu>
                        {showInspector &&
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
