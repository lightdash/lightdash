import { subject } from '@casl/ability';
import {
    DirectAccessResourceType,
    getAppDisplayName,
    isApiError,
    type AppVersionStatus,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Divider,
    Indicator,
    Menu,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowsUpDown,
    IconCamera,
    IconCirclesRelation,
    IconCopy,
    IconDatabaseExport,
    IconDots,
    IconEdit,
    IconFolderPlus,
    IconFolderSymlink,
    IconPencil,
    IconPhotoX,
    IconRefresh,
    IconSend,
    IconSparkles,
    IconTrash,
    IconUsers,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState, type FC, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import AppDeleteModal from '../../../components/common/modal/AppDeleteModal';
import AppUpdateModal from '../../../components/common/modal/AppUpdateModal';
import { ShareLinkButton } from '../../../components/common/ShareLinkButton';
import useToaster from '../../../hooks/toaster/useToaster';
import { useProject } from '../../../hooks/useProject';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import {
    DirectAccessModal,
    useCanManageDirectAccess,
    useDirectAccessAvailability,
} from '../../directAccess';
import { AppSchedulersModal } from '../../scheduler/components/SchedulerModals';
import { AppSyncModal } from '../../sync/components';
import {
    useAppThumbnailDelete,
    useAppThumbnailUrl,
} from '../hooks/useAppThumbnail';
import { useCanCreateDataApp } from '../hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../hooks/useCanEditDataApp';
import { useDuplicateApp } from '../hooks/useDuplicateApp';
import { type SdkUpgradeOffer } from '../hooks/useSdkUpgradeStatus';
import AppUpgradeModal from './AppUpgradeModal';
import { MoveAppToSpaceModal } from './MoveAppToSpaceModal';
import { PromoteAppModal } from './PromoteAppModal';

type Props = {
    projectUuid: string;
    appUuid: string;
    appName: string;
    appDescription: string | null;
    appSpaceUuid: string | null;
    appCreatedByUserUuid: string | null;
    /** The latest ready version's number + status — used by the favorite flow
     *  and to gate the Promote action. */
    latestVersionNumber: number | null;
    latestVersionStatus: AppVersionStatus | null;
    onRefresh: () => void;
    refreshDisabled: boolean;
    onViewNetwork: () => void;
    /** Called after a successful delete so the page can navigate away. */
    onDeleted: () => void;
    /** Prominent edit affordance matching the dashboard header's pencil
     *  button — "Continue building" in the viewer. Pass null on surfaces
     *  that ARE the edit surface (the builder). */
    onEdit: (() => void) | null;
    /** URL for the copy-link button, matching the dashboard header. Pass
     *  null on surfaces without a shareable URL (the builder). */
    shareUrl: string | null;
    /** Cross-navigation menu item that differs per surface (e.g. "Preview
     *  latest" in the builder). Rendered at the top of the menu; pass null
     *  to omit it. */
    navItem: ReactNode;
    /** "Ask AI Agent" menu item, rendered right after `navItem`. Pass null
     *  on surfaces that don't offer it. */
    askAiItem: ReactNode;
    /** Fullscreen/presentation toggle, rendered between the refresh button
     *  and the overflow menu to match the dashboard header's ordering. Pass
     *  null on surfaces without it (the builder). */
    fullscreenToggle: ReactNode;
    /** Builder-only action that captures the live preview and saves it as the
     *  app thumbnail. Pass null on surfaces without a capture pipeline (the
     *  viewer). Disabled until the iframe announces screenshot capability. */
    captureThumbnail: {
        onCapture: () => void;
        disabled: boolean;
    } | null;
    /** Raw capture from this surface's live preview iframe, forwarded to the
     *  move modal so its thumbnail checkbox screenshots what the user is
     *  looking at. Null when the iframe hasn't announced screenshot
     *  capability — the modal then falls back to a default-state render. */
    capturePreviewScreenshot: (() => Promise<File>) | null;
    /** Upgrade offer derived from the live preview's SDK manifest (see
     *  `useSdkUpgradeStatus`). Null on surfaces without an upgrade flow (the
     *  viewer). `disabled` while a build is already in flight. */
    upgrade: (SdkUpgradeOffer & { disabled: boolean }) | null;
    /** Count of ready queries captured by the live preview, forwarded to the
     *  scheduler modal so it can gate/caption csv/xlsx delivery formats. */
    capturedQueryCount?: number;
};

/**
 * The shared right-hand side of a data app's header, following the dashboard
 * header's ordering: edit pencil, refresh, fullscreen, share link, overflow
 * menu (plus every action modal). Used by both the builder (`AppGenerate`) and
 * the viewer (`AppPreviewTest`) so the two surfaces expose the same actions;
 * per-surface differences come in via the `onEdit`/`shareUrl`/`navItem` slots.
 *
 * Edit-actions are gated by `useCanEditDataApp`, because the viewer can be
 * opened by users without manage rights. Delivery actions use their dedicated
 * permissions, while duplicate only needs `useCanCreateDataApp`.
 */
const AppHeaderActions: FC<Props> = ({
    projectUuid,
    appUuid,
    appName,
    appDescription,
    appSpaceUuid,
    appCreatedByUserUuid,
    latestVersionNumber,
    latestVersionStatus,
    onRefresh,
    refreshDisabled,
    onViewNetwork,
    onDeleted,
    onEdit,
    shareUrl,
    navItem,
    askAiItem,
    fullscreenToggle,
    captureThumbnail,
    capturePreviewScreenshot,
    upgrade,
    capturedQueryCount,
}) => {
    const navigate = useNavigate();

    const canEdit = useCanEditDataApp(projectUuid, {
        spaceUuid: appSpaceUuid,
        createdByUserUuid: appCreatedByUserUuid,
    });

    // Duplicating forks the app into the user's own personal app, so it only
    // needs `create:DataApp` — not manage rights on this app.
    const canDuplicate = useCanCreateDataApp(projectUuid);

    const { user, health } = useApp();
    const canCreateScheduledDeliveries =
        user.data?.ability.can(
            'create',
            subject('ScheduledDeliveries', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
            }),
        ) === true;

    // Same health check the chart/SQL chart Google Sheets Sync entries gate
    // on — Drive picker credentials must be configured.
    const hasGoogleDriveEnabled =
        health.data?.auth.google.oauth2ClientId !== undefined &&
        health.data?.auth.google.googleDriveApiKey !== undefined;

    // Promotion is only offered from a preview project linked to an upstream.
    const { data: project } = useProject(projectUuid);
    const isPreviewProject = !!project?.upstreamProjectUuid;

    const hasReadyVersion = latestVersionStatus === 'ready';

    const { mutate: duplicateMutate, isLoading: isDuplicating } =
        useDuplicateApp();

    // "Remove thumbnail" is builder-only (same surfaces as captureThumbnail)
    // and only enabled when a thumbnail actually exists. The existence check
    // is deferred until the menu first opens; invalidations from captures
    // keep it current afterwards. The error guard matters because
    // react-query keeps stale data when a refetch fails.
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    const [menuOpened, setMenuOpened] = useState(false);
    const thumbnailQuery = useAppThumbnailUrl(
        projectUuid,
        appUuid,
        menuOpened && canEdit && captureThumbnail !== null,
    );
    const hasThumbnail = !thumbnailQuery.isError && !!thumbnailQuery.data;
    const { mutateAsync: deleteThumbnail, isLoading: isDeletingThumbnail } =
        useAppThumbnailDelete();
    const handleRemoveThumbnail = useCallback(async () => {
        try {
            await deleteThumbnail({ projectUuid, appUuid });
            // Reset (not invalidate): the refetch 404s and react-query would
            // keep the stale signed URL as data.
            void queryClient.resetQueries({
                queryKey: ['app-thumbnail', projectUuid, appUuid],
            });
            showToastSuccess({ title: 'Thumbnail removed' });
        } catch (err) {
            showToastError({
                title: 'Failed to remove thumbnail',
                subtitle: isApiError(err) ? err.error.message : 'Unknown error',
            });
        }
    }, [
        deleteThumbnail,
        projectUuid,
        appUuid,
        queryClient,
        showToastSuccess,
        showToastError,
    ]);

    const [schedulerModalOpen, setSchedulerModalOpen] = useState(false);
    const [syncModalOpen, setSyncModalOpen] = useState(false);
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
    const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
    const [isMoveToSpaceOpen, setIsMoveToSpaceOpen] = useState(false);
    const [isPromoteModalOpen, setIsPromoteModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDirectAccessModalOpen, setIsDirectAccessModalOpen] =
        useState(false);
    const directAccessAvailability = useDirectAccessAvailability();
    const canManageAppAccess = useCanManageDirectAccess({
        projectUuid,
        spaceUuid: appSpaceUuid ?? null,
        createdByUserUuid: appCreatedByUserUuid ?? null,
        access: [],
        grantRoles: [],
    });

    const handleDuplicate = useCallback(() => {
        duplicateMutate(
            { projectUuid, appUuid },
            {
                onSuccess: ({ appUuid: newAppUuid }) => {
                    void navigate(
                        `/projects/${projectUuid}/apps/${newAppUuid}`,
                    );
                },
            },
        );
    }, [duplicateMutate, navigate, projectUuid, appUuid]);

    const upgradeAvailable =
        canEdit &&
        upgrade !== null &&
        (upgrade.status === 'stale' || upgrade.status === 'legacy');
    return (
        <>
            {onEdit && (
                <>
                    <Tooltip
                        label="Continue building"
                        position="bottom"
                        openDelay={200}
                        transitionProps={{
                            transition: 'fade',
                            duration: 150,
                        }}
                    >
                        <ActionIcon
                            aria-label="Continue building"
                            onClick={onEdit}
                            bg="foreground"
                            c="background"
                            size="md"
                        >
                            <MantineIcon
                                icon={IconPencil}
                                color="background"
                                size="md"
                            />
                        </ActionIcon>
                    </Tooltip>
                    <Divider orientation="vertical" />
                </>
            )}
            <Tooltip
                label="Refresh to re-run queries"
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
                    disabled={refreshDisabled}
                    onClick={onRefresh}
                    aria-label="Refresh"
                >
                    <MantineIcon icon={IconRefresh} />
                </ActionIcon>
            </Tooltip>
            {fullscreenToggle}
            {shareUrl && (
                <ShareLinkButton url={shareUrl} label="Copy link to the app" />
            )}
            <Menu
                position="bottom-end"
                withArrow
                arrowPosition="center"
                onOpen={() => setMenuOpened(true)}
            >
                <Menu.Target>
                    <Indicator
                        disabled={!upgradeAvailable}
                        color="blue"
                        size={8}
                        offset={2}
                    >
                        <ActionIcon
                            variant="default"
                            size="md"
                            aria-label="App actions"
                        >
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Indicator>
                </Menu.Target>
                <Menu.Dropdown>
                    {navItem}
                    {askAiItem}
                    <Menu.Item
                        leftSection={
                            <MantineIcon icon={IconArrowsUpDown} size={14} />
                        }
                        onClick={onViewNetwork}
                    >
                        View network
                    </Menu.Item>
                    {canCreateScheduledDeliveries && (
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconSend} size={14} />
                            }
                            onClick={() => setSchedulerModalOpen(true)}
                        >
                            Schedule delivery
                        </Menu.Item>
                    )}
                    {canCreateScheduledDeliveries && hasGoogleDriveEnabled && (
                        <Can
                            I="manage"
                            this={subject('GoogleSheets', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <Menu.Item
                                leftSection={
                                    <MantineIcon
                                        icon={IconCirclesRelation}
                                        size={14}
                                    />
                                }
                                onClick={() => setSyncModalOpen(true)}
                            >
                                Google Sheets Sync
                            </Menu.Item>
                        </Can>
                    )}
                    {(canEdit || canDuplicate) && <Menu.Divider />}
                    {canEdit && upgrade && (
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconSparkles} size={14} />
                            }
                            rightSection={
                                upgradeAvailable ? (
                                    <Badge size="xs" color="blue">
                                        New
                                    </Badge>
                                ) : undefined
                            }
                            disabled={upgrade.disabled}
                            onClick={() => setIsUpgradeModalOpen(true)}
                        >
                            Upgrade app
                        </Menu.Item>
                    )}
                    {canEdit && (
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconEdit} size={14} />
                            }
                            onClick={() => setIsUpdateModalOpen(true)}
                        >
                            Rename
                        </Menu.Item>
                    )}
                    {canEdit && captureThumbnail && (
                        <>
                            <Menu.Item
                                leftSection={
                                    <MantineIcon icon={IconCamera} size={14} />
                                }
                                disabled={captureThumbnail.disabled}
                                onClick={captureThumbnail.onCapture}
                            >
                                Capture thumbnail
                            </Menu.Item>
                            <Menu.Item
                                leftSection={
                                    <MantineIcon icon={IconPhotoX} size={14} />
                                }
                                disabled={!hasThumbnail || isDeletingThumbnail}
                                onClick={() => void handleRemoveThumbnail()}
                            >
                                Remove thumbnail
                            </Menu.Item>
                        </>
                    )}
                    {canDuplicate && (
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconCopy} size={14} />
                            }
                            disabled={isDuplicating}
                            onClick={handleDuplicate}
                        >
                            Duplicate
                        </Menu.Item>
                    )}
                    {canEdit && (
                        <>
                            <Menu.Item
                                leftSection={
                                    <MantineIcon
                                        icon={
                                            appSpaceUuid
                                                ? IconFolderSymlink
                                                : IconFolderPlus
                                        }
                                        size={14}
                                    />
                                }
                                onClick={() => setIsMoveToSpaceOpen(true)}
                            >
                                {appSpaceUuid
                                    ? 'Move to space'
                                    : 'Add to space'}
                            </Menu.Item>
                            {isPreviewProject && hasReadyVersion && (
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon
                                            icon={IconDatabaseExport}
                                            size={14}
                                        />
                                    }
                                    onClick={() => setIsPromoteModalOpen(true)}
                                >
                                    Promote
                                </Menu.Item>
                            )}
                            {directAccessAvailability.isAvailable &&
                                canManageAppAccess && (
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon
                                                icon={IconUsers}
                                                size={14}
                                            />
                                        }
                                        onClick={() =>
                                            setIsDirectAccessModalOpen(true)
                                        }
                                    >
                                        Share
                                    </Menu.Item>
                                )}
                            <Menu.Divider />
                            <Menu.Item
                                color="red"
                                leftSection={
                                    <MantineIcon icon={IconTrash} size={14} />
                                }
                                onClick={() => setIsDeleteModalOpen(true)}
                            >
                                Delete
                            </Menu.Item>
                        </>
                    )}
                </Menu.Dropdown>
            </Menu>

            {isUpgradeModalOpen && upgrade && (
                <AppUpgradeModal
                    opened
                    onClose={() => setIsUpgradeModalOpen(false)}
                    projectUuid={projectUuid}
                    appUuid={appUuid}
                    offer={upgrade}
                    resource="dataApp"
                />
            )}
            {isUpdateModalOpen && (
                <AppUpdateModal
                    opened
                    projectUuid={projectUuid}
                    uuid={appUuid}
                    initialName={appName}
                    initialDescription={appDescription ?? ''}
                    onClose={() => setIsUpdateModalOpen(false)}
                    onConfirm={() => setIsUpdateModalOpen(false)}
                />
            )}
            {isDirectAccessModalOpen && (
                <DirectAccessModal
                    opened={isDirectAccessModalOpen}
                    onClose={() => setIsDirectAccessModalOpen(false)}
                    projectUuid={projectUuid}
                    resource={{
                        resourceType: DirectAccessResourceType.APP,
                        resourceUuid: appUuid,
                        name: appName,
                    }}
                />
            )}
            {isMoveToSpaceOpen && (
                <MoveAppToSpaceModal
                    projectUuid={projectUuid}
                    opened
                    onClose={() => setIsMoveToSpaceOpen(false)}
                    capturePreviewScreenshot={capturePreviewScreenshot}
                    app={{
                        uuid: appUuid,
                        name: appName,
                        description: appDescription ?? undefined,
                        spaceUuid: appSpaceUuid,
                        createdByUserUuid: appCreatedByUserUuid,
                        latestVersionNumber,
                        latestVersionStatus,
                    }}
                />
            )}
            {schedulerModalOpen && (
                <AppSchedulersModal
                    projectUuid={projectUuid}
                    appUuid={appUuid}
                    name={getAppDisplayName(appName, appUuid)}
                    isOpen
                    onClose={() => setSchedulerModalOpen(false)}
                    capturedQueryCount={capturedQueryCount}
                />
            )}
            {syncModalOpen && (
                <AppSyncModal
                    projectUuid={projectUuid}
                    appUuid={appUuid}
                    opened
                    onClose={() => setSyncModalOpen(false)}
                />
            )}
            {isPromoteModalOpen && (
                <PromoteAppModal
                    projectUuid={projectUuid}
                    appUuid={appUuid}
                    opened
                    onClose={() => setIsPromoteModalOpen(false)}
                />
            )}
            {isDeleteModalOpen && (
                <AppDeleteModal
                    opened
                    projectUuid={projectUuid}
                    uuid={appUuid}
                    name={appName}
                    onClose={() => setIsDeleteModalOpen(false)}
                    onConfirm={() => {
                        setIsDeleteModalOpen(false);
                        onDeleted();
                    }}
                />
            )}
        </>
    );
};

export default AppHeaderActions;
