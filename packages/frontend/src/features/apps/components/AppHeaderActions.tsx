import { getAppDisplayName, type AppVersionStatus } from '@lightdash/common';
import { ActionIcon, Menu, Tooltip } from '@mantine-8/core';
import {
    IconArrowsUpDown,
    IconCamera,
    IconCopy,
    IconDatabaseExport,
    IconDots,
    IconEdit,
    IconFolderPlus,
    IconFolderSymlink,
    IconRefresh,
    IconSend,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useState, type FC, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import AppDeleteModal from '../../../components/common/modal/AppDeleteModal';
import AppUpdateModal from '../../../components/common/modal/AppUpdateModal';
import { useProject } from '../../../hooks/useProject';
import { AppSchedulersModal } from '../../scheduler/components/SchedulerModals';
import { useCanCreateDataApp } from '../hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../hooks/useCanEditDataApp';
import { useDuplicateApp } from '../hooks/useDuplicateApp';
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

    const [schedulerModalOpen, setSchedulerModalOpen] = useState(false);
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
            >
                <Menu.Target>
                    <ActionIcon
                        variant="subtle"
                        size="sm"
                        color="ldGray.6"
                        aria-label="App actions"
                    >
                        <MantineIcon icon={IconDots} size={16} />
                    </ActionIcon>
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
                        <Menu.Item
                            leftSection={
                                <MantineIcon icon={IconCamera} size={14} />
                            }
                            disabled={captureThumbnail.disabled}
                            onClick={captureThumbnail.onCapture}
                        >
                            Capture thumbnail
                        </Menu.Item>
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
