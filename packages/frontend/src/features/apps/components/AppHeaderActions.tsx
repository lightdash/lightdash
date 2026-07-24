import {
    getAppDisplayName,
    isApiError,
    type AppVersionStatus,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Indicator,
    List,
    Menu,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconArrowsUpDown,
    IconCamera,
    IconCopy,
    IconDatabaseExport,
    IconDots,
    IconEdit,
    IconFolderPlus,
    IconFolderSymlink,
    IconPhotoX,
    IconRefresh,
    IconSend,
    IconSparkles,
    IconTrash,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState, type FC, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import AppDeleteModal from '../../../components/common/modal/AppDeleteModal';
import AppUpdateModal from '../../../components/common/modal/AppUpdateModal';
import useToaster from '../../../hooks/toaster/useToaster';
import { useProject } from '../../../hooks/useProject';
import { AppSchedulersModal } from '../../scheduler/components/SchedulerModals';
import {
    useAppThumbnailDelete,
    useAppThumbnailUrl,
} from '../hooks/useAppThumbnail';
import { useCanCreateDataApp } from '../hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../hooks/useCanEditDataApp';
import { useDuplicateApp } from '../hooks/useDuplicateApp';
import { type SdkUpgradeOffer } from '../hooks/useSdkUpgradeStatus';
import { useUpgradeApp } from '../hooks/useUpgradeApp';
import {
    DataAppFavoriteMenuItem,
    FavoritePersonalDataAppModal,
} from './DataAppFavoriteMenuItem';
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
    /** The single cross-navigation menu item that differs per surface:
     *  "Preview latest" in the builder, "Continue building" in the viewer.
     *  Rendered at the top of the menu; pass null to omit it. */
    navItem: ReactNode;
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
};

/**
 * The shared right-hand side of a data app's header — a refresh button plus the
 * overflow menu and every action modal. Used by both the builder
 * (`AppGenerate`) and the viewer (`AppPreviewTest`) so the two surfaces expose
 * the same actions; the only per-surface difference is `navItem`.
 *
 * Edit-actions are gated by `useCanEditDataApp`, because the viewer can be
 * opened by users without manage rights. Duplicate is the exception — it forks
 * the app into a personal copy, so it only needs `useCanCreateDataApp`.
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
    navItem,
    captureThumbnail,
    capturePreviewScreenshot,
    upgrade,
}) => {
    const navigate = useNavigate();

    const canEdit = useCanEditDataApp(projectUuid, {
        spaceUuid: appSpaceUuid,
        createdByUserUuid: appCreatedByUserUuid,
    });

    // Duplicating forks the app into the user's own personal app, so it only
    // needs `create:DataApp` — not manage rights on this app.
    const canDuplicate = useCanCreateDataApp(projectUuid);

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
    const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
    const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
    const [isMoveToSpaceOpen, setIsMoveToSpaceOpen] = useState(false);
    const [isPromoteModalOpen, setIsPromoteModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [favoriteSpaceModalOpen, setFavoriteSpaceModalOpen] = useState(false);

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

    const { mutate: upgradeMutate, isLoading: isUpgrading } = useUpgradeApp();
    const upgradeAvailable =
        canEdit &&
        upgrade !== null &&
        (upgrade.status === 'stale' || upgrade.status === 'legacy');
    const handleUpgrade = useCallback(() => {
        if (!upgrade) return;
        upgradeMutate(
            {
                projectUuid,
                appUuid,
                body: {
                    ...(upgrade.reportedSdkVersion !== null
                        ? { reportedSdkVersion: upgrade.reportedSdkVersion }
                        : {}),
                    ...(upgrade.reportedFeatures !== null
                        ? { reportedFeatures: upgrade.reportedFeatures }
                        : {}),
                    ...(upgrade.candidateFeatures.length > 0
                        ? { candidateFeatures: upgrade.candidateFeatures }
                        : {}),
                },
            },
            { onSuccess: () => setIsUpgradeModalOpen(false) },
        );
    }, [upgrade, upgradeMutate, projectUuid, appUuid]);

    return (
        <>
            <Tooltip
                label="Refresh to re-run queries"
                withArrow
                position="bottom"
            >
                <ActionIcon
                    variant="subtle"
                    size="sm"
                    color="ldGray.6"
                    disabled={refreshDisabled}
                    onClick={onRefresh}
                    aria-label="Refresh"
                >
                    <MantineIcon icon={IconRefresh} size={16} />
                </ActionIcon>
            </Tooltip>
            <Menu
                position="bottom-end"
                shadow="md"
                withinPortal
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
                            variant="subtle"
                            size="sm"
                            color="ldGray.6"
                            aria-label="App actions"
                        >
                            <MantineIcon icon={IconDots} size={16} />
                        </ActionIcon>
                    </Indicator>
                </Menu.Target>
                <Menu.Dropdown>
                    {navItem}
                    <DataAppFavoriteMenuItem
                        projectUuid={projectUuid}
                        appUuid={appUuid}
                        appSpaceUuid={appSpaceUuid}
                        onAddPersonalAppToSpace={() =>
                            setFavoriteSpaceModalOpen(true)
                        }
                    />
                    <Menu.Item
                        leftSection={
                            <MantineIcon icon={IconArrowsUpDown} size={14} />
                        }
                        onClick={onViewNetwork}
                    >
                        View network
                    </Menu.Item>
                    {canEdit && (
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconSend} size={14} />
                            }
                            onClick={() => setSchedulerModalOpen(true)}
                        >
                            Schedule delivery
                        </Menu.Item>
                    )}
                    {(canEdit || canDuplicate) && <Menu.Divider />}
                    {canEdit && upgrade && (
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconSparkles} size={14} />
                            }
                            rightSection={
                                upgradeAvailable ? (
                                    <Badge
                                        size="xs"
                                        variant="light"
                                        color="blue"
                                    >
                                        New
                                    </Badge>
                                ) : undefined
                            }
                            disabled={upgrade.disabled || isUpgrading}
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
                <MantineModal
                    opened
                    onClose={() => setIsUpgradeModalOpen(false)}
                    title="Upgrade app"
                    icon={IconSparkles}
                    confirmLabel="Upgrade"
                    confirmLoading={isUpgrading}
                    onConfirm={handleUpgrade}
                >
                    <Stack gap="sm">
                        {upgrade.status === 'stale' ? (
                            <>
                                <Text size="sm">
                                    Upgrading rebuilds this app on the latest
                                    template. New since this app was built:
                                </Text>
                                <List spacing="xs" size="sm">
                                    {upgrade.newFeatures.map((feature) => (
                                        <List.Item key={feature.key}>
                                            <Text size="sm" fw={500} span>
                                                {feature.label}
                                            </Text>{' '}
                                            <Text size="sm" c="dimmed" span>
                                                — {feature.description}
                                            </Text>
                                        </List.Item>
                                    ))}
                                </List>
                                <Text size="sm" c="dimmed">
                                    The agent fixes anything the new template
                                    breaks, then offers these features in chat —
                                    nothing is added until you ask.
                                </Text>
                            </>
                        ) : upgrade.status === 'current' ? (
                            <Text size="sm">
                                This app is already on the latest SDK. Upgrading
                                again rebuilds it on a fresh copy of the current
                                template.
                            </Text>
                        ) : (
                            <Text size="sm">
                                This app was built on an older SDK. Upgrading
                                rebuilds it on the latest template, and the
                                agent will offer newly available features in
                                chat — nothing is added until you ask.
                            </Text>
                        )}
                    </Stack>
                </MantineModal>
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
            {favoriteSpaceModalOpen && (
                <FavoritePersonalDataAppModal
                    projectUuid={projectUuid}
                    opened
                    onClose={() => setFavoriteSpaceModalOpen(false)}
                    app={{
                        uuid: appUuid,
                        name: appName,
                        description: appDescription || undefined,
                        spaceUuid: appSpaceUuid,
                        createdByUserUuid: appCreatedByUserUuid,
                        latestVersionNumber,
                        latestVersionStatus,
                    }}
                />
            )}
        </>
    );
};

export default AppHeaderActions;
