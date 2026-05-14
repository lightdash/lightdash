import { subject } from '@casl/ability';
import {
    assertUnreachable,
    ProjectType,
    WarehouseTypes,
    type OrganizationProject,
} from '@lightdash/common';
import {
    ActionIcon,
    Avatar,
    Badge,
    Box,
    Button,
    Center,
    Checkbox,
    Code,
    CopyButton,
    Divider,
    Group,
    Menu,
    Popover,
    ScrollArea,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
    UnstyledButton,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconCalendarTime,
    IconCheck,
    IconClock,
    IconCopy,
    IconDatabase,
    IconDots,
    IconFilter,
    IconSearch,
    IconSettings,
    IconTerminal2,
    IconTextCaption,
    IconTrash,
    IconUser,
    IconX,
} from '@tabler/icons-react';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
} from 'mantine-react-table';
import { useCallback, useMemo, useState, type FC } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import {
    useActiveProject,
    useUpdateActiveProjectMutation,
} from '../../../hooks/useActiveProject';
import { useProjects } from '../../../hooks/useProjects';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import {
    getWarehouseIcon,
    getWarehouseLabel,
} from '../../ProjectConnection/ProjectConnectFlow/utils';
import { ProjectDeleteModal } from '../DeleteProjectPanel/DeleteProjectModal';
import { ProjectDeleteInBulkModal } from '../DeleteProjectPanel/ProjectDeleteInBulkModal';
import classes from './ProjectManagementPanel.module.css';

enum ProjectTypeFilter {
    ALL = 'all',
    DEFAULT = 'default',
    PREVIEW = 'preview',
}

const WAREHOUSE_LABELS: Record<WarehouseTypes, string> = {
    [WarehouseTypes.BIGQUERY]: 'BigQuery',
    [WarehouseTypes.POSTGRES]: 'PostgreSQL',
    [WarehouseTypes.REDSHIFT]: 'Redshift',
    [WarehouseTypes.SNOWFLAKE]: 'Snowflake',
    [WarehouseTypes.DATABRICKS]: 'Databricks',
    [WarehouseTypes.TRINO]: 'Trino',
    [WarehouseTypes.CLICKHOUSE]: 'ClickHouse',
    [WarehouseTypes.ATHENA]: 'Athena',
    [WarehouseTypes.DUCKDB]: 'MotherDuck',
};

const CopyableCommand: FC<{ label: string; command: string }> = ({
    label,
    command,
}) => (
    <Stack gap={4}>
        <Text fz="xs" fw={600} c="ldGray.7">
            {label}
        </Text>
        <CopyButton value={command}>
            {({ copied, copy }) => (
                <Tooltip label={copied ? 'Copied!' : 'Click to copy'}>
                    <UnstyledButton onClick={copy}>
                        <Code
                            block
                            fz="xs"
                            p="xs"
                            className={
                                copied
                                    ? classes.copyFlashActive
                                    : classes.copyFlash
                            }
                            style={{
                                cursor: 'pointer',
                                wordBreak: 'break-all',
                            }}
                        >
                            <Group
                                gap="xs"
                                justify="space-between"
                                wrap="nowrap"
                            >
                                <Text fz="xs" ff="monospace" span>
                                    {command}
                                </Text>
                                <MantineIcon
                                    icon={copied ? IconCheck : IconCopy}
                                    size="sm"
                                    color={copied ? 'teal.6' : 'ldGray.5'}
                                />
                            </Group>
                        </Code>
                    </UnstyledButton>
                </Tooltip>
            )}
        </CopyButton>
    </Stack>
);

const ProjectManagementPanel: FC = () => {
    const theme = useMantineTheme();
    const { user } = useApp();
    const navigate = useNavigate();

    const { data: projects = [], isInitialLoading: isLoadingProjects } =
        useProjects();
    const { data: lastProjectUuid, isInitialLoading: isLoadingLastProject } =
        useActiveProject();

    const { mutateAsync: updateActiveProjectMutation } =
        useUpdateActiveProjectMutation();

    const [deletingProjectUuid, setDeletingProjectUuid] = useState<string>();
    const [deletingProjectInBulk, setDeletingProjectInBulk] = useState(false);
    const [cliProject, setCliProject] = useState<OrganizationProject>();

    const [activeFilter, setActiveFilter] = useState<ProjectTypeFilter>(
        ProjectTypeFilter.ALL,
    );
    const [search, setSearch] = useState('');
    const [selectedWarehouses, setSelectedWarehouses] = useState<
        WarehouseTypes[]
    >([]);
    const [selectedCreators, setSelectedCreators] = useState<string[]>([]);
    const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

    const handleFilterChange = useCallback((value: string) => {
        setSelectedProjects([]);
        setActiveFilter(value as ProjectTypeFilter);
    }, []);

    const handleSelect = useCallback(
        (projectUuid: string, isSelected: boolean) => {
            setSelectedProjects((prev) =>
                isSelected
                    ? [...prev, projectUuid]
                    : prev.filter((uuid) => uuid !== projectUuid),
            );
        },
        [],
    );

    // Derive available warehouses and creators from project data
    const availableWarehouses = useMemo(() => {
        const types = new Set<WarehouseTypes>();
        projects.forEach((p) => {
            if (p.warehouseType) types.add(p.warehouseType);
        });
        return Array.from(types).sort();
    }, [projects]);

    const availableCreators = useMemo(() => {
        const creators = new Map<string, string>();
        projects.forEach((p) => {
            if (p.createdByUserName && p.createdByUserUuid) {
                creators.set(p.createdByUserUuid, p.createdByUserName);
            }
        });
        return Array.from(creators.entries()).map(([uuid, name]) => ({
            uuid,
            name,
        }));
    }, [projects]);

    const filteredProjects = useMemo(() => {
        return projects.filter((project) => {
            const matchesSearch =
                !search ||
                project.name.toLowerCase().includes(search.toLowerCase());

            const matchesType = (() => {
                switch (activeFilter) {
                    case ProjectTypeFilter.DEFAULT:
                        return project.type === ProjectType.DEFAULT;
                    case ProjectTypeFilter.PREVIEW:
                        return project.type === ProjectType.PREVIEW;
                    case ProjectTypeFilter.ALL:
                        return true;
                    default:
                        return assertUnreachable(
                            activeFilter,
                            `Unknown filter: ${activeFilter}`,
                        );
                }
            })();

            const matchesWarehouse =
                selectedWarehouses.length === 0 ||
                (project.warehouseType &&
                    selectedWarehouses.includes(project.warehouseType));

            const matchesCreator =
                selectedCreators.length === 0 ||
                (project.createdByUserUuid &&
                    selectedCreators.includes(project.createdByUserUuid));

            return (
                matchesSearch &&
                matchesType &&
                matchesWarehouse &&
                matchesCreator
            );
        });
    }, [projects, activeFilter, search, selectedWarehouses, selectedCreators]);

    const allSelectedProjects = useMemo(() => {
        return selectedProjects
            .map((uuid) => projects.find((p) => p.projectUuid === uuid))
            .filter((p): p is OrganizationProject => !!p);
    }, [projects, selectedProjects]);

    const handleSelectAll = useCallback(() => {
        setSelectedProjects(
            filteredProjects.map((project) => project.projectUuid),
        );
    }, [filteredProjects]);

    const handleDeleteInBulk = useCallback(() => {
        setDeletingProjectInBulk(true);
    }, []);

    const handleCloseDeleteInBulk = useCallback(() => {
        setSelectedProjects([]);
        setDeletingProjectInBulk(false);
    }, []);

    const handleProjectSettingsClick = useCallback(
        async (projectUuid: string) => {
            const isCurrentProject = lastProjectUuid === projectUuid;
            if (!isCurrentProject) {
                await updateActiveProjectMutation(projectUuid);
            }
            setTimeout(() => {
                void navigate(
                    `/generalSettings/projectManagement/${projectUuid}/settings`,
                    { replace: true },
                );
            }, 0);
        },
        [lastProjectUuid, navigate, updateActiveProjectMutation],
    );

    const columns: MRT_ColumnDef<OrganizationProject>[] = useMemo(
        () => [
            {
                id: 'select',
                header: '',
                size: 40,
                enableSorting: false,
                Header: () =>
                    activeFilter === ProjectTypeFilter.PREVIEW ? (
                        <Button
                            variant="subtle"
                            size="compact-xs"
                            onClick={handleSelectAll}
                        >
                            Select all
                        </Button>
                    ) : null,
                Cell: ({ row }) => {
                    const project = row.original;
                    const canDelete = user.data?.ability.can(
                        'delete',
                        subject('Project', {
                            type: project.type,
                            projectUuid: project.projectUuid,
                            organizationUuid: user.data?.organizationUuid,
                            createdByUserUuid: project.createdByUserUuid,
                        }),
                    );
                    return (
                        <Center>
                            <Checkbox
                                checked={selectedProjects.includes(
                                    project.projectUuid,
                                )}
                                disabled={!canDelete}
                                onChange={(e) =>
                                    handleSelect(
                                        project.projectUuid,
                                        e.target.checked,
                                    )
                                }
                            />
                        </Center>
                    );
                },
            },
            {
                accessorKey: 'name',
                header: 'Name',
                enableSorting: true,
                size: 200,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconTextCaption} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const project = row.original;
                    const isCurrentProject =
                        lastProjectUuid === project.projectUuid;
                    return (
                        <Group gap="xs" wrap="nowrap">
                            <Text fz="sm" fw={500} truncate="end">
                                {project.name}
                            </Text>
                            {isCurrentProject && (
                                <Badge variant="light" size="xs">
                                    Current
                                </Badge>
                            )}
                            {project.type === ProjectType.PREVIEW && (
                                <Badge size="xs" variant="light">
                                    Preview
                                </Badge>
                            )}
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'warehouseType',
                header: 'Warehouse',
                enableSorting: true,
                size: 140,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconDatabase} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const wt = row.original.warehouseType;
                    if (!wt) {
                        return (
                            <Text fz="sm" c="ldGray.5">
                                {'\u2014'}
                            </Text>
                        );
                    }
                    const label =
                        getWarehouseLabel(wt) ?? WAREHOUSE_LABELS[wt] ?? wt;
                    const icon = getWarehouseIcon(wt, 'xs');
                    return (
                        <Group gap="xs" wrap="nowrap">
                            {icon ?? (
                                <Avatar size="xs" radius="xl" bg="ldGray.1">
                                    <MantineIcon
                                        icon={IconDatabase}
                                        size="xs"
                                        color="ldGray.6"
                                    />
                                </Avatar>
                            )}
                            <Text fz="sm" c="ldGray.7">
                                {label}
                            </Text>
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'createdByUserName',
                header: 'Created by',
                enableSorting: true,
                size: 150,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconUser} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text fz="sm" c="ldGray.7">
                        {row.original.createdByUserName ?? '\u2014'}
                    </Text>
                ),
            },
            {
                accessorKey: 'createdAt',
                header: 'Created',
                enableSorting: true,
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
                accessorKey: 'expiresAt',
                header: 'Expires',
                enableSorting: true,
                sortUndefined: 1,
                size: 120,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconCalendarTime} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const { expiresAt } = row.original;
                    if (!expiresAt) {
                        return (
                            <Text fz="sm" c="ldGray.5">
                                {'—'}
                            </Text>
                        );
                    }
                    return (
                        <Text fz="sm" c="ldGray.7">
                            {new Date(expiresAt).toLocaleDateString()}
                        </Text>
                    );
                },
            },
            {
                id: 'actions',
                header: '',
                enableSorting: false,
                size: 60,
                mantineTableHeadCellProps: { align: 'right' },
                mantineTableBodyCellProps: { align: 'right' },
                Cell: ({ row }) => {
                    const project = row.original;
                    const canUpdate = user.data?.ability.can(
                        'update',
                        subject('Project', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid: project.projectUuid,
                        }),
                    );
                    const canDelete = user.data?.ability.can(
                        'delete',
                        subject('Project', {
                            type: project.type,
                            projectUuid: project.projectUuid,
                            organizationUuid: user.data?.organizationUuid,
                            createdByUserUuid: project.createdByUserUuid,
                        }),
                    );

                    return (
                        <Menu
                            withinPortal
                            position="bottom-end"
                            withArrow
                            arrowPosition="center"
                            shadow="md"
                        >
                            <Menu.Target>
                                <ActionIcon variant="subtle" color="gray">
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                {canUpdate && (
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon icon={IconSettings} />
                                        }
                                        onClick={() =>
                                            void handleProjectSettingsClick(
                                                project.projectUuid,
                                            )
                                        }
                                    >
                                        Settings
                                    </Menu.Item>
                                )}
                                <CopyButton value={project.projectUuid}>
                                    {({ copied, copy }) => (
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon
                                                    icon={
                                                        copied
                                                            ? IconCheck
                                                            : IconCopy
                                                    }
                                                    color={
                                                        copied
                                                            ? 'teal.6'
                                                            : undefined
                                                    }
                                                />
                                            }
                                            onClick={copy}
                                        >
                                            {copied
                                                ? 'Copied!'
                                                : 'Copy project UUID'}
                                        </Menu.Item>
                                    )}
                                </CopyButton>
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconTerminal2} />
                                    }
                                    onClick={() => setCliProject(project)}
                                >
                                    CLI reference
                                </Menu.Item>
                                {canDelete && <Menu.Divider />}
                                {canDelete && (
                                    <Menu.Item
                                        color="red"
                                        leftSection={
                                            <MantineIcon icon={IconTrash} />
                                        }
                                        onClick={() =>
                                            setDeletingProjectUuid(
                                                project.projectUuid,
                                            )
                                        }
                                    >
                                        Delete
                                    </Menu.Item>
                                )}
                            </Menu.Dropdown>
                        </Menu>
                    );
                },
            },
        ],
        [
            activeFilter,
            handleProjectSettingsClick,
            handleSelect,
            handleSelectAll,
            lastProjectUuid,
            selectedProjects,
            user.data?.ability,
            user.data?.organizationUuid,
        ],
    );

    const hasActiveFilters =
        selectedWarehouses.length > 0 || selectedCreators.length > 0;

    const table = useMantineReactTable({
        columns,
        data: filteredProjects,
        enableColumnActions: false,
        enableColumnFilters: false,
        enablePagination: false,
        enableSorting: true,
        enableTopToolbar: true,
        enableBottomToolbar: false,
        enableGlobalFilter: false,
        mantinePaperProps: {
            shadow: undefined,
            style: {
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.radius.md,
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column' as const,
                overflow: 'hidden',
            },
        },
        mantineTableHeadRowProps: {
            sx: {
                boxShadow: 'none',
            },
        },
        mantineTableHeadCellProps: {
            bg: 'ldGray.0',
            style: {
                userSelect: 'none',
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                borderTop: `1px solid ${theme.colors.ldGray[2]}`,
                borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
            },
        },
        mantineTableBodyCellProps: {
            style: {
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                borderTop: 'none',
            },
        },
        mantineTableProps: {
            highlightOnHover: true,
        },
        renderEmptyRowsFallback: () => (
            <Center className={classes.emptyState}>
                <MantineIcon
                    icon={search ? IconSearch : IconFilter}
                    size="xl"
                    color="ldGray.4"
                    className={classes.emptyStateIcon}
                />
                <Text fz="sm" fw={500} c="ldGray.6">
                    {search
                        ? `No projects matching "${search}"`
                        : 'No projects match the current filters'}
                </Text>
                <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => {
                        setSearch('');
                        setSelectedWarehouses([]);
                        setSelectedCreators([]);
                        setActiveFilter(ProjectTypeFilter.ALL);
                    }}
                >
                    Clear all filters
                </Button>
            </Center>
        ),
        state: {
            isLoading: isLoadingProjects || isLoadingLastProject,
        },
        renderTopToolbar: () => (
            <Group
                justify="space-between"
                p={`${theme.spacing.sm} ${theme.spacing.md}`}
                wrap="nowrap"
            >
                <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <Tooltip
                        withinPortal
                        variant="xs"
                        label="Search by project name"
                    >
                        <TextInput
                            size="xs"
                            radius="md"
                            type="search"
                            variant="default"
                            placeholder="Search projects..."
                            value={search}
                            classNames={{
                                input: search
                                    ? classes.searchInputWithValue
                                    : classes.searchInput,
                            }}
                            leftSection={
                                <MantineIcon
                                    size="md"
                                    color="ldGray.6"
                                    icon={IconSearch}
                                />
                            }
                            onChange={(e) => setSearch(e.target.value)}
                            rightSection={
                                search && (
                                    <ActionIcon
                                        onClick={() => setSearch('')}
                                        variant="transparent"
                                        size="xs"
                                        color="ldGray.5"
                                    >
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                )
                            }
                        />
                    </Tooltip>

                    <Divider
                        orientation="vertical"
                        w={1}
                        h={20}
                        style={{ alignSelf: 'center' }}
                    />

                    <SegmentedControl
                        size="xs"
                        radius="md"
                        value={activeFilter}
                        onChange={handleFilterChange}
                        classNames={{
                            root: classes.segmentedControl,
                            indicator: classes.segmentedIndicator,
                            label: classes.segmentedLabel,
                        }}
                        data={[
                            {
                                value: ProjectTypeFilter.ALL,
                                label: (
                                    <Tooltip
                                        label="Show all projects"
                                        withinPortal
                                    >
                                        <Box>
                                            <Text fz="xs" fw={500}>
                                                All
                                            </Text>
                                        </Box>
                                    </Tooltip>
                                ),
                            },
                            {
                                value: ProjectTypeFilter.DEFAULT,
                                label: (
                                    <Tooltip
                                        label="Show only standard projects"
                                        withinPortal
                                    >
                                        <Box>
                                            <Text fz="xs" fw={500}>
                                                Projects
                                            </Text>
                                        </Box>
                                    </Tooltip>
                                ),
                            },
                            {
                                value: ProjectTypeFilter.PREVIEW,
                                label: (
                                    <Tooltip
                                        label="Show only preview projects"
                                        withinPortal
                                    >
                                        <Box>
                                            <Text fz="xs" fw={500}>
                                                Preview
                                            </Text>
                                        </Box>
                                    </Tooltip>
                                ),
                            },
                        ]}
                    />

                    <Divider
                        orientation="vertical"
                        w={1}
                        h={20}
                        style={{ alignSelf: 'center' }}
                    />

                    {/* Warehouse filter */}
                    <Popover width={220} position="bottom-start">
                        <Popover.Target>
                            <Tooltip
                                withinPortal
                                variant="xs"
                                label="Filter by warehouse"
                            >
                                <Button
                                    h={32}
                                    c="foreground"
                                    fw={500}
                                    fz="sm"
                                    variant="default"
                                    radius="md"
                                    px="sm"
                                    className={
                                        selectedWarehouses.length > 0
                                            ? classes.filterButtonSelected
                                            : classes.filterButton
                                    }
                                    classNames={{
                                        label: classes.buttonLabel,
                                    }}
                                    rightSection={
                                        selectedWarehouses.length > 0 ? (
                                            <Badge
                                                size="xs"
                                                variant="filled"
                                                color="indigo.6"
                                                circle
                                                styles={{
                                                    root: {
                                                        minWidth: 18,
                                                        height: 18,
                                                        padding: '0 4px',
                                                    },
                                                }}
                                            >
                                                {selectedWarehouses.length}
                                            </Badge>
                                        ) : null
                                    }
                                >
                                    Warehouse
                                </Button>
                            </Tooltip>
                        </Popover.Target>
                        <Popover.Dropdown p="sm">
                            <Stack gap={4}>
                                <Text fz="xs" c="ldGray.9" fw={600}>
                                    Filter by warehouse:
                                </Text>
                                <ScrollArea.Autosize
                                    mah={200}
                                    type="always"
                                    scrollbars="y"
                                >
                                    <Stack gap="xs">
                                        {availableWarehouses.map((wt) => (
                                            <Checkbox
                                                key={wt}
                                                label={
                                                    WAREHOUSE_LABELS[wt] ?? wt
                                                }
                                                checked={selectedWarehouses.includes(
                                                    wt,
                                                )}
                                                size="xs"
                                                classNames={{
                                                    body: classes.checkboxBody,
                                                    input: classes.checkboxInput,
                                                    label: classes.checkboxLabel,
                                                }}
                                                onChange={() => {
                                                    if (
                                                        selectedWarehouses.includes(
                                                            wt,
                                                        )
                                                    ) {
                                                        setSelectedWarehouses(
                                                            selectedWarehouses.filter(
                                                                (w) => w !== wt,
                                                            ),
                                                        );
                                                    } else {
                                                        setSelectedWarehouses([
                                                            ...selectedWarehouses,
                                                            wt,
                                                        ]);
                                                    }
                                                }}
                                            />
                                        ))}
                                    </Stack>
                                </ScrollArea.Autosize>
                            </Stack>
                        </Popover.Dropdown>
                    </Popover>

                    {/* Created by filter */}
                    {availableCreators.length > 0 && (
                        <Popover width={250} position="bottom-start">
                            <Popover.Target>
                                <Tooltip
                                    withinPortal
                                    variant="xs"
                                    label="Filter by creator"
                                >
                                    <Button
                                        h={32}
                                        c="foreground"
                                        fw={500}
                                        fz="sm"
                                        variant="default"
                                        radius="md"
                                        px="sm"
                                        className={
                                            selectedCreators.length > 0
                                                ? classes.filterButtonSelected
                                                : classes.filterButton
                                        }
                                        classNames={{
                                            label: classes.buttonLabel,
                                        }}
                                        rightSection={
                                            selectedCreators.length > 0 ? (
                                                <Badge
                                                    size="xs"
                                                    variant="filled"
                                                    color="indigo.6"
                                                    circle
                                                    styles={{
                                                        root: {
                                                            minWidth: 18,
                                                            height: 18,
                                                            padding: '0 4px',
                                                        },
                                                    }}
                                                >
                                                    {selectedCreators.length}
                                                </Badge>
                                            ) : null
                                        }
                                    >
                                        Created by
                                    </Button>
                                </Tooltip>
                            </Popover.Target>
                            <Popover.Dropdown p="sm">
                                <Stack gap={4}>
                                    <Text fz="xs" c="ldGray.9" fw={600}>
                                        Filter by creator:
                                    </Text>
                                    <ScrollArea.Autosize
                                        mah={200}
                                        type="always"
                                        scrollbars="y"
                                    >
                                        <Stack gap="xs">
                                            {availableCreators.map(
                                                (creator) => (
                                                    <Checkbox
                                                        key={creator.uuid}
                                                        label={creator.name}
                                                        checked={selectedCreators.includes(
                                                            creator.uuid,
                                                        )}
                                                        size="xs"
                                                        classNames={{
                                                            body: classes.checkboxBody,
                                                            input: classes.checkboxInput,
                                                            label: classes.checkboxLabel,
                                                        }}
                                                        onChange={() => {
                                                            if (
                                                                selectedCreators.includes(
                                                                    creator.uuid,
                                                                )
                                                            ) {
                                                                setSelectedCreators(
                                                                    selectedCreators.filter(
                                                                        (c) =>
                                                                            c !==
                                                                            creator.uuid,
                                                                    ),
                                                                );
                                                            } else {
                                                                setSelectedCreators(
                                                                    [
                                                                        ...selectedCreators,
                                                                        creator.uuid,
                                                                    ],
                                                                );
                                                            }
                                                        }}
                                                    />
                                                ),
                                            )}
                                        </Stack>
                                    </ScrollArea.Autosize>
                                </Stack>
                            </Popover.Dropdown>
                        </Popover>
                    )}
                </Group>

                <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
                    {hasActiveFilters && (
                        <Tooltip label="Clear all filters">
                            <ActionIcon
                                variant="subtle"
                                size="sm"
                                color="gray"
                                onClick={() => {
                                    setSelectedWarehouses([]);
                                    setSelectedCreators([]);
                                }}
                            >
                                <MantineIcon icon={IconTrash} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                    {selectedProjects.length > 0 && (
                        <>
                            <Text size="sm" c="dimmed">
                                {selectedProjects.length} selected
                            </Text>
                            <Button
                                size="xs"
                                color="red"
                                variant="light"
                                leftSection={<MantineIcon icon={IconTrash} />}
                                onClick={handleDeleteInBulk}
                            >
                                Delete
                            </Button>
                        </>
                    )}
                </Group>
            </Group>
        ),
    });

    if (isLoadingProjects || isLoadingLastProject) return null;

    if (projects.length === 0) {
        return <Navigate to="/createProject" />;
    }

    return (
        <Stack mb="lg">
            <Group justify="space-between">
                <Title order={5}>Project Management</Title>

                {user.data?.ability.can(
                    'create',
                    subject('Project', {
                        organizationUuid: user.data?.organizationUuid,
                    }),
                ) && (
                    <Button component={Link} to="/createProject">
                        Create new
                    </Button>
                )}
            </Group>

            <MantineReactTable table={table} />

            {deletingProjectUuid ? (
                <ProjectDeleteModal
                    opened={deletingProjectUuid !== undefined}
                    onClose={() => setDeletingProjectUuid(undefined)}
                    isCurrentProject={deletingProjectUuid === lastProjectUuid}
                    projectUuid={deletingProjectUuid}
                />
            ) : null}

            {deletingProjectInBulk && (
                <ProjectDeleteInBulkModal
                    currentProjectUuid={lastProjectUuid ?? null}
                    opened={selectedProjects.length > 0}
                    onClose={handleCloseDeleteInBulk}
                    projects={allSelectedProjects}
                />
            )}

            <MantineModal
                opened={cliProject !== undefined}
                onClose={() => setCliProject(undefined)}
                title={`CLI reference: ${cliProject?.name ?? ''}`}
                icon={IconTerminal2}
                size="lg"
            >
                {cliProject && (
                    <Stack gap="md">
                        <CopyableCommand
                            label="Set as active project"
                            command={`lightdash config set-project --uuid ${cliProject.projectUuid}`}
                        />
                        <CopyableCommand
                            label="Deploy to this project"
                            command={`lightdash deploy --project ${cliProject.projectUuid}`}
                        />
                        <CopyableCommand
                            label="Start a preview from this project"
                            command={`lightdash start-preview --project ${cliProject.projectUuid}`}
                        />
                        <CopyableCommand
                            label="Validate this project"
                            command={`lightdash validate --project ${cliProject.projectUuid}`}
                        />
                        <CopyableCommand
                            label="Project UUID"
                            command={cliProject.projectUuid}
                        />
                    </Stack>
                )}
            </MantineModal>
        </Stack>
    );
};

export default ProjectManagementPanel;
