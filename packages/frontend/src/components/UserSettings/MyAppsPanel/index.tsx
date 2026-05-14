import {
    ContentType,
    ResourceViewItemType,
    type ApiAppSummary,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Group,
    Loader,
    Menu,
    Stack,
    Text,
} from '@mantine-8/core';
import {
    IconClock,
    IconCode,
    IconDots,
    IconExternalLink,
    IconFolder,
    IconFolderPlus,
    IconFolderSymlink,
    IconLayoutDashboard,
    IconPencil,
    IconRadar,
    IconTextCaption,
    IconTrash,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
} from 'mantine-react-table';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { Link } from 'react-router';
import { useMyApps } from '../../../features/apps/hooks/useMyApps';
import { useContentAction } from '../../../hooks/useContent';
import MantineIcon from '../../common/MantineIcon';
import AppDeleteModal from '../../common/modal/AppDeleteModal';
import AppUpdateModal from '../../common/modal/AppUpdateModal';
import TransferItemsModal from '../../common/TransferItemsModal/TransferItemsModal';

const hasReadyVersion = (app: ApiAppSummary) =>
    app.lastVersionStatus === 'ready' && !!app.lastVersionNumber;

const MoveAppToSpaceModal: FC<{
    app: ApiAppSummary;
    onClose: () => void;
}> = ({ app, onClose }) => {
    const queryClient = useQueryClient();
    const { mutateAsync: contentAction, isLoading } = useContentAction(
        app.projectUuid,
    );
    return (
        <TransferItemsModal
            projectUuid={app.projectUuid}
            opened
            onClose={onClose}
            items={[
                {
                    type: ResourceViewItemType.DATA_APP,
                    data: {
                        uuid: app.appUuid,
                        name: app.name,
                        description: app.description || undefined,
                        spaceUuid: app.spaceUuid,
                        createdByUserUuid: null,
                        updatedAt: new Date(),
                        updatedByUser: null,
                        views: 0,
                        firstViewedAt: null,
                        latestVersionNumber: app.lastVersionNumber,
                        latestVersionStatus: app.lastVersionStatus,
                        pinnedListUuid: null,
                        pinnedListOrder: null,
                    },
                },
            ]}
            isLoading={isLoading}
            onConfirm={async (targetSpaceUuid) => {
                if (!targetSpaceUuid) return;
                await contentAction({
                    action: { type: 'move', targetSpaceUuid },
                    item: {
                        uuid: app.appUuid,
                        contentType: ContentType.DATA_APP,
                    },
                });
                await queryClient.invalidateQueries({ queryKey: ['myApps'] });
                onClose();
            }}
        />
    );
};

const statusColor = (status: string | null) => {
    switch (status) {
        case 'ready':
            return 'green';
        case 'building':
            return 'blue';
        case 'error':
            return 'red';
        default:
            return 'gray';
    }
};

const MyAppsPanel: FC = () => {
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const { data, fetchNextPage, isFetching, isLoading, isError } = useMyApps();
    const [appToDelete, setAppToDelete] = useState<ApiAppSummary | null>(null);
    const [appToMove, setAppToMove] = useState<ApiAppSummary | null>(null);
    const [appToRename, setAppToRename] = useState<ApiAppSummary | null>(null);

    const flatData = useMemo<ApiAppSummary[]>(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data],
    );

    const totalDBRowCount = data?.pages?.[0]?.pagination?.totalResults ?? 0;
    const totalFetched = flatData.length;

    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (containerRefElement) {
                const { scrollHeight, scrollTop, clientHeight } =
                    containerRefElement;
                if (
                    scrollHeight - scrollTop - clientHeight < 400 &&
                    !isFetching &&
                    totalFetched < totalDBRowCount
                ) {
                    void fetchNextPage();
                }
            }
        },
        [fetchNextPage, isFetching, totalFetched, totalDBRowCount],
    );

    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    const columns: MRT_ColumnDef<ApiAppSummary>[] = useMemo(
        () => [
            {
                accessorKey: 'name',
                header: 'Name',
                enableSorting: false,
                size: 200,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconTextCaption} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const app = row.original;
                    const displayName =
                        app.name || `Untitled app ${app.appUuid.slice(0, 8)}`;

                    return (
                        <Anchor
                            component={Link}
                            to={`/projects/${app.projectUuid}/apps/${app.appUuid}`}
                            fz="sm"
                            fw={500}
                            c="inherit"
                            underline="hover"
                            truncate="end"
                        >
                            {displayName}
                        </Anchor>
                    );
                },
            },
            {
                accessorKey: 'projectName',
                header: 'Project',
                enableSorting: false,
                size: 150,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon
                            icon={IconLayoutDashboard}
                            color="ldGray.6"
                        />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text fz="sm" c="ldGray.7">
                        {row.original.projectName}
                    </Text>
                ),
            },
            {
                accessorKey: 'spaceName',
                header: 'Space',
                enableSorting: false,
                size: 150,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconFolder} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const { spaceUuid, spaceName, projectUuid } = row.original;
                    if (!spaceUuid || !spaceName) {
                        return (
                            <Text fz="sm" c="dimmed">
                                -
                            </Text>
                        );
                    }
                    return (
                        <Anchor
                            component={Link}
                            to={`/projects/${projectUuid}/spaces/${spaceUuid}`}
                            fz="sm"
                            c="inherit"
                            underline="hover"
                            truncate="end"
                        >
                            {spaceName}
                        </Anchor>
                    );
                },
            },
            {
                accessorKey: 'lastVersionStatus',
                header: 'Status',
                enableSorting: false,
                size: 100,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconRadar} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const { lastVersionStatus, lastVersionNumber } =
                        row.original;
                    return (
                        <Group gap="xs">
                            <Badge
                                variant="light"
                                color={statusColor(lastVersionStatus)}
                                size="sm"
                            >
                                {lastVersionStatus ?? 'no versions'}
                            </Badge>
                            {lastVersionNumber && (
                                <Text fz="xs" c="dimmed">
                                    v{lastVersionNumber}
                                </Text>
                            )}
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'createdAt',
                header: 'Created',
                enableSorting: false,
                size: 120,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text fz="sm" c="ldGray.7">
                        {new Date(row.original.createdAt).toLocaleDateString()}
                    </Text>
                ),
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 60,
                mantineTableHeadCellProps: { align: 'right' },
                mantineTableBodyCellProps: { align: 'right' },
                Cell: ({ row }) => {
                    const app = row.original;

                    return (
                        <Menu position="bottom-end" withinPortal>
                            <Menu.Target>
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    size="sm"
                                >
                                    <MantineIcon icon={IconDots} size={16} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                {hasReadyVersion(app) && (
                                    <Menu.Item
                                        component={Link}
                                        to={`/projects/${app.projectUuid}/apps/${app.appUuid}/preview`}
                                        target="_blank"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconExternalLink}
                                                size={14}
                                            />
                                        }
                                    >
                                        Preview latest
                                    </Menu.Item>
                                )}
                                <Menu.Item
                                    component={Link}
                                    to={`/projects/${app.projectUuid}/apps/${app.appUuid}`}
                                    leftSection={
                                        <MantineIcon
                                            icon={IconCode}
                                            size={14}
                                        />
                                    }
                                >
                                    Continue building
                                </Menu.Item>
                                <Menu.Divider />
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon
                                            icon={IconPencil}
                                            size={14}
                                        />
                                    }
                                    onClick={() => setAppToRename(app)}
                                >
                                    Rename
                                </Menu.Item>
                                <Menu.Item
                                    leftSection={
                                        app.spaceUuid ? (
                                            <MantineIcon
                                                icon={IconFolderSymlink}
                                                size={14}
                                            />
                                        ) : (
                                            <MantineIcon
                                                icon={IconFolderPlus}
                                                size={14}
                                            />
                                        )
                                    }
                                    onClick={() => setAppToMove(app)}
                                >
                                    {app.spaceUuid
                                        ? 'Move to space'
                                        : 'Add to space'}
                                </Menu.Item>
                                <Menu.Divider />
                                <Menu.Item
                                    color="red"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconTrash}
                                            size={14}
                                        />
                                    }
                                    onClick={() => setAppToDelete(app)}
                                >
                                    Delete
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    );
                },
            },
        ],
        [],
    );

    const table = useMantineReactTable({
        columns,
        data: flatData,
        enableColumnActions: false,
        enableColumnFilters: false,
        enablePagination: false,
        enableSorting: false,
        enableTopToolbar: false,
        enableBottomToolbar: false,
        mantineTableContainerProps: {
            ref: tableContainerRef,
            style: { maxHeight: 'calc(100dvh - 420px)' },
            onScroll: (event: React.UIEvent<HTMLDivElement>) =>
                fetchMoreOnBottomReached(event.target as HTMLDivElement),
        },
        mantineTableProps: {
            highlightOnHover: true,
        },
        state: {
            isLoading,
            showProgressBars: isFetching,
            showAlertBanner: isError,
        },
    });

    if (isLoading && flatData.length === 0) {
        return (
            <Group justify="center" p="xl">
                <Loader size="sm" />
            </Group>
        );
    }

    if (!isLoading && !isError && flatData.length === 0) {
        return (
            <Text c="dimmed" fz="sm" p="md">
                You haven't created any apps yet.
            </Text>
        );
    }

    return (
        <Stack gap="md">
            <MantineReactTable table={table} />
            {appToDelete && (
                <AppDeleteModal
                    opened
                    projectUuid={appToDelete.projectUuid}
                    uuid={appToDelete.appUuid}
                    name={appToDelete.name}
                    onClose={() => setAppToDelete(null)}
                    onConfirm={() => setAppToDelete(null)}
                />
            )}
            {appToMove && (
                <MoveAppToSpaceModal
                    app={appToMove}
                    onClose={() => setAppToMove(null)}
                />
            )}
            {appToRename && (
                <AppUpdateModal
                    opened
                    projectUuid={appToRename.projectUuid}
                    uuid={appToRename.appUuid}
                    initialName={appToRename.name}
                    initialDescription={appToRename.description}
                    onClose={() => setAppToRename(null)}
                    onConfirm={() => setAppToRename(null)}
                />
            )}
        </Stack>
    );
};

export default MyAppsPanel;
