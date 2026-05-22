import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { ActionIcon, Box, Loader, Menu, Stack, Text } from '@mantine-8/core';
import {
    IconAppsOff,
    IconDatabase,
    IconDots,
    IconPencil,
    IconRefresh,
    IconSend,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import MantineIcon from '../components/common/MantineIcon';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import ForbiddenPanel from '../components/ForbiddenPanel';
import AppIframePreview from '../features/apps/AppIframePreview';
import { useAppPreviewToken } from '../features/apps/hooks/useAppPreviewToken';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import { useTrackedAppQueries } from '../features/apps/hooks/useTrackedAppQueries';
import { usePreviewOrigin } from '../features/apps/previewOrigin';
import QueryInspector from '../features/apps/QueryInspector';
import { AppSchedulersModal } from '../features/scheduler/components/SchedulerModals';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { useSpaceSummaries } from '../hooks/useSpaces';
import useApp from '../providers/App/useApp';
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
    const scheduledDeliveriesFlag = useServerFeatureFlag(
        FeatureFlags.DataAppsScheduledDeliveries,
    );
    const { user } = useApp();

    // Always fetch app to get creator info + latest ready version when needed.
    // The backend enforces space-aware view permissions and will 403 if the
    // user doesn't have access — we surface that as the error state below.
    const appQuery = useGetApp(projectUuid, appUuid);

    const latestReadyVersion = appQuery.data?.pages[0]?.versions.find(
        (v) => v.status === 'ready',
    )?.version;

    const appSpaceUuid = appQuery.data?.pages[0]?.spaceUuid ?? null;
    const appCreatedByUserUuid =
        appQuery.data?.pages[0]?.createdByUserUuid ?? null;
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true, {});
    const userSpaceAccess = appSpaceUuid
        ? spaces.find((s) => s.uuid === appSpaceUuid)?.userAccess
        : undefined;
    const canEditApp =
        user.data?.ability?.can(
            'manage',
            subject('DataApp', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
                access: userSpaceAccess ? [userSpaceAccess] : [],
                createdByUserUuid: appCreatedByUserUuid,
            }),
        ) === true;

    const version = explicitVersion ?? latestReadyVersion;

    const {
        data: token,
        isLoading: isTokenLoading,
        error: tokenError,
    } = useAppPreviewToken(projectUuid, appUuid, version);

    const [menuOpened, setMenuOpened] = useState(false);
    const [schedulerModalOpen, setSchedulerModalOpen] = useState(false);
    const [queriesPanelHidden, setQueriesPanelHidden] = useState(true);

    // Query tracking from the preview iframe. The panel is opt-in (hidden by
    // default in preview because most viewers aren't technical), but we wire
    // up the SDK bridge callback unconditionally so queries that run before
    // the user opens the panel are still captured.
    const { queries, handleQueryEvent, clearQueries } = useTrackedAppQueries();

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
    }, [clearQueries]);

    // Close menu when the iframe receives focus (i.e. user clicked on it)
    const handleBlur = useCallback(() => {
        if (menuOpened) {
            setMenuOpened(false);
        }
    }, [menuOpened]);

    useEffect(() => {
        window.addEventListener('blur', handleBlur);
        return () => window.removeEventListener('blur', handleBlur);
    }, [handleBlur]);

    const previewOrigin = usePreviewOrigin();

    if (dataAppsFlag.isLoading) {
        return null;
    }
    if (!dataAppsFlag.data?.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    if (!projectUuid || !appUuid) {
        return <div>Missing route params</div>;
    }

    const isLoading =
        appQuery.isLoading || (version !== undefined && isTokenLoading);
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

    if (
        !explicitVersion &&
        !appQuery.isLoading &&
        !appQuery.error &&
        !latestReadyVersion
    ) {
        return (
            <Stack align="center" justify="center" h="calc(100vh - 50px)">
                <Text c="red" size="sm">
                    No ready version found for this app
                </Text>
            </Stack>
        );
    }

    const previewUrl = token
        ? `${previewOrigin}/api/apps/${appUuid}/versions/${version}/t/${token}/?r=${refreshKey}#transport=postMessage&projectUuid=${projectUuid}`
        : undefined;

    if (isLoading) {
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

    if (!previewUrl) return null;

    return (
        <Box className={classes.previewContainer}>
            <Box className={classes.menuOverlay}>
                <Menu
                    position="bottom-end"
                    withinPortal
                    opened={menuOpened}
                    onChange={setMenuOpened}
                >
                    <Menu.Target>
                        <ActionIcon
                            variant="filled"
                            color="gray"
                            size="lg"
                            radius="xl"
                        >
                            <MantineIcon icon={IconDots} size={18} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        {canEditApp && (
                            <Menu.Item
                                leftSection={<IconPencil size={14} />}
                                onClick={() =>
                                    navigate(
                                        `/projects/${projectUuid}/apps/${appUuid}`,
                                    )
                                }
                            >
                                Continue building
                            </Menu.Item>
                        )}
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconRefresh} />}
                            onClick={handleRefresh}
                        >
                            Refresh
                        </Menu.Item>
                        {canEditApp &&
                            scheduledDeliveriesFlag.data?.enabled && (
                                <Menu.Item
                                    leftSection={<IconSend size={14} />}
                                    onClick={() => setSchedulerModalOpen(true)}
                                >
                                    Schedule delivery
                                </Menu.Item>
                            )}
                        <Menu.Item
                            leftSection={<IconDatabase size={14} />}
                            onClick={() => setQueriesPanelHidden(false)}
                        >
                            View queries
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Box>
            <AppIframePreview
                src={previewUrl}
                expectedPreviewOrigin={previewOrigin}
                identityKey={`${appUuid}:${version}`}
                invalidateCache={invalidateCache}
                onQueryEvent={handleQueryEvent}
            />
            {!queriesPanelHidden && (
                <QueryInspector
                    queries={queries}
                    projectUuid={projectUuid}
                    onClear={clearQueries}
                    defaultCollapsed={false}
                    hideWhenEmpty={false}
                    onDismiss={() => setQueriesPanelHidden(true)}
                />
            )}
            {schedulerModalOpen && (
                <AppSchedulersModal
                    projectUuid={projectUuid}
                    appUuid={appUuid}
                    name={appQuery.data?.pages[0]?.name ?? 'Data app'}
                    isOpen
                    onClose={() => setSchedulerModalOpen(false)}
                />
            )}
        </Box>
    );
}
