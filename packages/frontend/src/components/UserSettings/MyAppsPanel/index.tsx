import { getAppDisplayName, type ApiAppSummary } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Divider,
    Group,
    Menu,
    SegmentedControl,
    Text,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconCode,
    IconDots,
    IconEdit,
    IconExternalLink,
    IconFolderPlus,
    IconFolderSymlink,
    IconTrash,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AskAiAgentMenuItem } from '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem';
import AppThumbnailHoverCard from '../../../features/apps/components/AppThumbnailHoverCard';
import { MoveAppToSpaceModal as SharedMoveAppToSpaceModal } from '../../../features/apps/components/MoveAppToSpaceModal';
import { useMyApps } from '../../../features/apps/hooks/useMyApps';
import { useInfiniteScroll } from '../../../hooks/useInfiniteScroll';
import { useProjects } from '../../../hooks/useProjects';
import {
    ContentTable,
    ContentTableSearchInput,
    useContentTable,
    type ContentTableColumnDef,
} from '../../common/ContentTable';
import FilterFacet, { type FilterFacetOption } from '../../common/FilterFacet';
import MantineIcon from '../../common/MantineIcon';
import AppDeleteModal from '../../common/modal/AppDeleteModal';
import AppUpdateModal from '../../common/modal/AppUpdateModal';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import classes from './MyAppsPanel.module.css';

const hasReadyVersion = (app: ApiAppSummary) =>
    app.lastVersionStatus === 'ready' && !!app.lastVersionNumber;

const MoveAppToSpaceModal: FC<{
    app: ApiAppSummary;
    onClose: () => void;
}> = ({ app, onClose }) => {
    const queryClient = useQueryClient();
    return (
        <SharedMoveAppToSpaceModal
            projectUuid={app.projectUuid}
            opened
            onClose={onClose}
            app={{
                uuid: app.appUuid,
                name: app.name,
                description: app.description || undefined,
                spaceUuid: app.spaceUuid,
                createdByUserUuid: null,
                latestVersionNumber: app.lastVersionNumber,
                latestVersionStatus: app.lastVersionStatus,
            }}
            previewVersion={null}
            onMoved={() =>
                queryClient.invalidateQueries({ queryKey: ['myApps'] })
            }
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

const AppNameCell: FC<{ app: ApiAppSummary }> = ({ app }) => {
    const displayName = getAppDisplayName(app.name, app.appUuid);

    return (
        <AppThumbnailHoverCard
            projectUuid={app.projectUuid}
            appUuid={app.appUuid}
            appName={displayName}
            hasReadyVersion={hasReadyVersion(app)}
        >
            <Anchor
                component={Link}
                to={`/projects/${app.projectUuid}/apps/${app.appUuid}`}
                fz="sm"
                fw={500}
                c="inherit"
                underline="hover"
                truncate="end"
                display="block"
            >
                {displayName}
            </Anchor>
        </AppThumbnailHoverCard>
    );
};

type MyAppsPanelProps = {
    includePreviewAppsByDefault?: boolean;
};

const MyAppsPanel: FC<MyAppsPanelProps> = ({
    includePreviewAppsByDefault = false,
}) => {
    const { t } = useTranslation('userSettings');
    const [includePreviewApps, setIncludePreviewApps] = useState(
        includePreviewAppsByDefault,
    );
    const [selectedProjectUuids, setSelectedProjectUuids] = useState<string[]>(
        [],
    );
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search.trim(), 300);
    const { data: projects = [], isLoading: isLoadingProjects } = useProjects();
    const { data, fetchNextPage, isFetching, isLoading, isError } = useMyApps({
        excludePreviewProjects: !includePreviewApps,
        projectUuids: selectedProjectUuids,
        search: debouncedSearch || undefined,
    });
    const [appToDelete, setAppToDelete] = useState<ApiAppSummary | null>(null);
    const [appToMove, setAppToMove] = useState<ApiAppSummary | null>(null);
    const [appToRename, setAppToRename] = useState<ApiAppSummary | null>(null);

    const flatData = useMemo<ApiAppSummary[]>(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data],
    );

    const totalDBRowCount = data?.pages?.[0]?.pagination?.totalResults ?? 0;
    const totalFetched = flatData.length;

    const { containerRef: tableContainerRef, onScroll } = useInfiniteScroll({
        fetchNextPage,
        isFetching,
        hasMore: totalFetched < totalDBRowCount,
        threshold: 400,
    });

    const resetFilters = useCallback(() => {
        setSearch('');
        setIncludePreviewApps(false);
        setSelectedProjectUuids([]);
    }, []);

    const projectOptions = useMemo<FilterFacetOption[]>(
        () =>
            projects
                .map((project) => ({
                    label: project.name,
                    value: project.projectUuid,
                }))
                .sort((a, b) => a.label.localeCompare(b.label)),
        [projects],
    );

    const projectScopeOptions = useMemo(
        () => [
            {
                label: t('myAppsPanel.projectScope.production'),
                value: 'production',
            },
            { label: t('myAppsPanel.projectScope.all'), value: 'all' },
        ],
        [t],
    );

    const columns: ContentTableColumnDef<ApiAppSummary>[] = useMemo(
        () => [
            {
                accessorKey: 'name',
                header: t('myAppsPanel.columns.name'),
                enableSorting: false,
                size: 300,
                Cell: ({ row }) => {
                    const app = row.original;
                    return <AppNameCell app={app} />;
                },
            },
            {
                accessorKey: 'projectName',
                header: t('myAppsPanel.columns.project'),
                enableSorting: false,
                size: 150,
                Cell: ({ row }) => (
                    <Text fz="sm" c="ldGray.7">
                        {row.original.projectName}
                    </Text>
                ),
            },
            {
                accessorKey: 'spaceName',
                header: t('myAppsPanel.columns.space'),
                enableSorting: false,
                size: 150,
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
                            display="block"
                        >
                            {spaceName}
                        </Anchor>
                    );
                },
            },
            {
                accessorKey: 'lastVersionStatus',
                header: t('myAppsPanel.columns.status'),
                enableSorting: false,
                size: 100,
                Cell: ({ row }) => {
                    const { lastVersionStatus, lastVersionNumber } =
                        row.original;
                    return (
                        <Group gap="xs">
                            <Badge
                                color={statusColor(lastVersionStatus)}
                                size="sm"
                            >
                                {lastVersionStatus ??
                                    t('myAppsPanel.noVersions')}
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
                header: t('myAppsPanel.columns.created'),
                enableSorting: false,
                size: 120,
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
                        <Menu position="bottom-end">
                            <Menu.Target>
                                <ActionIcon variant="transparent" size="sm">
                                    <MantineIcon icon={IconDots} size={16} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <AskAiAgentMenuItem
                                    projectUuid={app.projectUuid}
                                    dataAppUuid={app.appUuid}
                                    clickedFrom="data_app_my_apps_menu"
                                    mode="navigate"
                                    withDivider
                                />
                                {hasReadyVersion(app) && (
                                    <Menu.Item
                                        component={Link}
                                        to={`/projects/${app.projectUuid}/apps/${app.appUuid}/view`}
                                        target="_blank"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconExternalLink}
                                                size={14}
                                            />
                                        }
                                    >
                                        {t('myAppsPanel.menu.previewLatest')}
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
                                    {t('myAppsPanel.menu.continueBuilding')}
                                </Menu.Item>
                                <Menu.Divider />
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon
                                            icon={IconEdit}
                                            size={14}
                                        />
                                    }
                                    onClick={() => setAppToRename(app)}
                                >
                                    {t('myAppsPanel.menu.rename')}
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
                                        ? t('myAppsPanel.menu.moveToSpace')
                                        : t('myAppsPanel.menu.addToSpace')}
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
                                    {t('actions.delete', { ns: 'common' })}
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    );
                },
            },
        ],
        [t],
    );

    const table = useContentTable({
        columns,
        data: flatData,
        enableColumnResizing: false,
        enablePagination: false,
        enableSorting: false,
        enableTopToolbar: true,
        enableBottomToolbar: false,
        enableStickyHeader: true,
        mantineTableHeadCellProps: {
            px: 'lg',
            py: 'sm',
        },
        mantineTableBodyCellProps: {
            px: 'lg',
            py: 'sm',
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            style: { maxHeight: 'calc(100dvh - 420px)' },
            onScroll,
        },
        mantineTableProps: {
            highlightOnHover: true,
        },
        emptyState: {
            title: includePreviewApps
                ? t('myAppsPanel.emptyState.noApps')
                : t('myAppsPanel.emptyState.noProductionApps'),
            description: includePreviewApps
                ? undefined
                : t('myAppsPanel.emptyState.switchToAllProjects'),
            entityName: t('myAppsPanel.emptyState.entityName'),
            hasActiveFilters: selectedProjectUuids.length > 0,
            onClearFilters: resetFilters,
            search,
        },
        renderTopToolbar: () => (
            <Group px="md" py="sm" gap="xs" wrap="nowrap">
                <ContentTableSearchInput
                    placeholder={t('myAppsPanel.search.placeholder')}
                    tooltipLabel={t('myAppsPanel.search.tooltip')}
                    value={search}
                    onChange={setSearch}
                />
                <Divider orientation="vertical" h={20} />
                <SegmentedControl
                    size="xs"
                    aria-label={t('myAppsPanel.projectScope.ariaLabel')}
                    value={includePreviewApps ? 'all' : 'production'}
                    onChange={(value) => setIncludePreviewApps(value === 'all')}
                    data={projectScopeOptions}
                    classNames={{
                        root: classes.segmentedControl,
                        indicator: classes.segmentedIndicator,
                        label: classes.segmentedLabel,
                    }}
                />
                <Divider orientation="vertical" h={20} />
                <FilterFacet
                    label={t('myAppsPanel.columns.project')}
                    options={projectOptions}
                    selected={selectedProjectUuids}
                    onChange={setSelectedProjectUuids}
                    tooltipLabel={t('myAppsPanel.filterByProject')}
                    loading={isLoadingProjects}
                />
            </Group>
        ),
        state: {
            isLoading,
            showProgressBars: isFetching,
            showAlertBanner: isError,
        },
    });

    return (
        <SettingsPage
            title={t('myAppsPanel.title')}
            description={t('myAppsPanel.description')}
        >
            <ContentTable table={table} />
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
                    iconPicker={null}
                    onClose={() => setAppToRename(null)}
                    onConfirm={() => setAppToRename(null)}
                />
            )}
        </SettingsPage>
    );
};

export default MyAppsPanel;
