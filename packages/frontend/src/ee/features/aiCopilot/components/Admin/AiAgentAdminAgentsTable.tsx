import { type AiAgentSummary } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Divider,
    Group,
    Menu,
    Paper,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconBox,
    IconClock,
    IconDots,
    IconMessageCircle,
    IconPuzzle,
    IconRobotFace,
    IconSettings,
    IconTag,
    IconTrash,
    IconUser,
    IconUsers,
} from '@tabler/icons-react';
import {
    MantineReactTable,
    useMantineReactTable,
    type MRT_ColumnDef,
} from 'mantine-react-table';
import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    useGetSlack,
    useSlackChannels,
} from '../../../../../hooks/slack/useSlack';
import { useIsTruncated } from '../../../../../hooks/useIsTruncated';
import { useProjects } from '../../../../../hooks/useProjects';
import SlackSvg from '../../../../../svgs/slack.svg?react';
import { useAiAgentAdminAgents } from '../../hooks/useAiAgentAdmin';
import ProjectsFilter from './ProjectsFilter';
import { SearchFilter } from './SearchFilter';

const AiAgentAdminAgentsTable = () => {
    const theme = useMantineTheme();
    const navigate = useNavigate();
    const { data: agents, isLoading } = useAiAgentAdminAgents();
    const { data: projects } = useProjects();

    const [search, setSearch] = useState<string | undefined>(undefined);
    const [selectedProjectUuids, setSelectedProjectUuids] = useState<string[]>(
        [],
    );

    const {
        data: slackInstallation,
        isInitialLoading: isLoadingSlackInstallation,
    } = useGetSlack();

    // Include all channel IDs used by agents to ensure they're in the response
    const includeChannelIds = useMemo(() => {
        if (!agents) return undefined;
        const ids = agents.flatMap((agent) =>
            agent.integrations
                .filter((i) => i.type === 'slack' && i.channelId)
                .map((i) => i.channelId),
        );
        return ids.length > 0 ? ids : undefined;
    }, [agents]);

    const { data: slackChannels } = useSlackChannels(
        '',
        {
            excludeArchived: true,
            excludeDms: true,
            excludeGroups: true,
            includeChannelIds,
        },
        {
            enabled:
                !!slackInstallation?.organizationUuid &&
                !!agents &&
                !isLoadingSlackInstallation,
        },
    );

    const deferredSearch = useDeferredValue(search);

    const projectsMap = useMemo(() => {
        if (!projects) return new Map();
        return new Map(projects.map((p) => [p.projectUuid, p]));
    }, [projects]);

    // Filter agents based on search and project selection
    const filteredAgents = useMemo(() => {
        if (!agents) return [];

        let filtered = agents;

        // Filter by project
        if (selectedProjectUuids.length > 0) {
            filtered = filtered.filter((agent) =>
                selectedProjectUuids.includes(agent.projectUuid),
            );
        }

        // Filter by search
        if (deferredSearch) {
            const searchLower = deferredSearch.toLowerCase();
            filtered = filtered.filter((agent) => {
                const nameMatch = agent.name
                    .toLowerCase()
                    .includes(searchLower);
                const projectName =
                    projectsMap.get(agent.projectUuid)?.name || '';
                const projectMatch = projectName
                    .toLowerCase()
                    .includes(searchLower);
                const tagsMatch =
                    agent.tags?.some((tag) =>
                        tag.toLowerCase().includes(searchLower),
                    ) || false;
                return nameMatch || projectMatch || tagsMatch;
            });
        }

        return filtered;
    }, [agents, selectedProjectUuids, deferredSearch, projectsMap]);

    const hasActiveFilters =
        (search !== undefined && search !== '') ||
        selectedProjectUuids.length > 0;

    const handleClearFilters = () => {
        setSearch(undefined);
        setSelectedProjectUuids([]);
    };

    const columns: MRT_ColumnDef<AiAgentSummary>[] = useMemo(
        () => [
            {
                accessorKey: 'name',
                header: 'Agent Name',
                enableSorting: false,
                size: 250,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconRobotFace} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const agent = row.original;
                    return (
                        <Paper px="xs" w="fit-content">
                            <Group gap="two" wrap="nowrap">
                                <LightdashUserAvatar
                                    size={16}
                                    name={agent.name}
                                    src={agent.imageUrl}
                                />
                                <Text fz="sm" fw={600} c="ldGray.9" truncate>
                                    {agent.name}
                                </Text>
                            </Group>
                        </Paper>
                    );
                },
            },
            {
                accessorKey: 'projectUuid',
                header: 'Project',
                enableSorting: true,
                size: 200,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconBox} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const project = projectsMap.get(row.original.projectUuid);
                    return (
                        <Text c="ldGray.9" fz="sm" fw={400}>
                            {project?.name ?? 'Unknown Project'}
                        </Text>
                    );
                },
            },
            {
                accessorKey: 'tags',
                header: 'Tags',
                enableSorting: false,
                size: 150,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconTag} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const agent = row.original;
                    if (!agent.tags || agent.tags.length === 0) {
                        return (
                            <Text c="ldGray.5" fz="xs" fs="italic">
                                No tags
                            </Text>
                        );
                    }
                    return (
                        <Group gap="xs">
                            {agent.tags.slice(0, 3).map((tag) => (
                                <Badge
                                    key={tag}
                                    variant="light"
                                    color="indigo"
                                    size="sm"
                                    radius="sm"
                                    tt="none"
                                >
                                    {tag}
                                </Badge>
                            ))}
                            {agent.tags.length > 3 && (
                                <Text c="ldGray.6" fz="xs">
                                    +{agent.tags.length - 3} more
                                </Text>
                            )}
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'integrations',
                header: 'Integrations',
                enableSorting: false,
                size: 150,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconPuzzle} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const agent = row.original;

                    const isTruncated = useIsTruncated<HTMLDivElement>();

                    if (agent.integrations.length === 0) {
                        return (
                            <Text c="ldGray.5" fz="xs" fs="italic">
                                None
                            </Text>
                        );
                    }
                    return (
                        <Group gap="xs">
                            {agent.integrations.map((integration, idx) => (
                                <Box key={idx}>
                                    <Tooltip
                                        withinPortal
                                        variant="xs"
                                        label={
                                            integration.type ||
                                            'Untitled Integration'
                                        }
                                        disabled={!isTruncated.isTruncated}
                                        multiline
                                        maw={300}
                                    >
                                        <Paper w="fit-content">
                                            {integration.type === 'slack' && (
                                                <Group
                                                    gap="two"
                                                    px="xs"
                                                    wrap="nowrap"
                                                >
                                                    <SlackSvg
                                                        style={{
                                                            width: '12px',
                                                            height: '12px',
                                                        }}
                                                    />
                                                    <Text
                                                        fz="xs"
                                                        c="ldGray.7"
                                                        fw={500}
                                                        truncate
                                                        ref={isTruncated.ref}
                                                    >
                                                        {
                                                            slackChannels?.find(
                                                                (channel) =>
                                                                    channel.id ===
                                                                    integration.channelId,
                                                            )?.name
                                                        }
                                                    </Text>
                                                </Group>
                                            )}
                                        </Paper>
                                    </Tooltip>
                                </Box>
                            ))}
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'groupAccess',
                header: 'Access',
                enableSorting: false,
                size: 120,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconUsers} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const agent = row.original;
                    const groupCount = agent.groupAccess?.length ?? 0;
                    const userCount = agent.userAccess?.length ?? 0;
                    const totalCount = groupCount + userCount;

                    if (totalCount === 0) {
                        return (
                            <Text c="ldGray.5" fz="xs" fs="italic">
                                No restrictions
                            </Text>
                        );
                    }

                    return (
                        <Group gap="two">
                            {groupCount > 0 && (
                                <Badge
                                    variant="subtle"
                                    color="dark"
                                    size="sm"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconUsers}
                                            size={12}
                                        />
                                    }
                                    radius="sm"
                                    tt="none"
                                >
                                    {groupCount}
                                </Badge>
                            )}
                            {userCount > 0 && (
                                <Badge
                                    variant="subtle"
                                    color="dark"
                                    size="sm"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconUser}
                                            size={12}
                                        />
                                    }
                                    radius="sm"
                                    tt="none"
                                >
                                    {userCount}
                                </Badge>
                            )}
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'createdAt',
                header: 'Created',
                enableSorting: false,
                size: 150,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const agent = row.original;
                    return (
                        <Text fz="sm" c="ldGray.7">
                            {new Date(agent.createdAt).toLocaleDateString()}
                        </Text>
                    );
                },
            },
            {
                accessorKey: 'updatedAt',
                header: '',
                enableSorting: false,
                size: 80,

                Cell: ({ row }) => {
                    const agent = row.original;

                    return (
                        <Menu
                            position="bottom-end"
                            withArrow
                            withinPortal
                            shadow="md"
                            width={200}
                        >
                            {' '}
                            <Menu.Target>
                                <ActionIcon variant="subtle" color="gray">
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconSettings} />
                                    }
                                    onClick={() => {
                                        void navigate(
                                            `/projects/${agent.projectUuid}/ai-agents/${agent.uuid}/edit`,
                                        );
                                    }}
                                >
                                    Edit
                                </Menu.Item>
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconMessageCircle} />
                                    }
                                    onClick={() => {
                                        void navigate(
                                            `/projects/${agent.projectUuid}/ai-agents/${agent.uuid}`,
                                        );
                                    }}
                                >
                                    Chat
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    );
                },
            },
        ],
        [projectsMap, slackChannels, navigate],
    );

    const table = useMantineReactTable({
        columns,
        data: filteredAgents,
        enableColumnResizing: false,
        enableRowNumbers: false,
        enablePagination: false,
        enableFilters: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableGlobalFilterModes: false,
        enableSorting: true,
        enableTopToolbar: true,
        enableBottomToolbar: false,
        mantinePaperProps: {
            shadow: undefined,
            style: {
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm,
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        mantineTableContainerProps: {
            style: {
                maxHeight: 'calc(100dvh - 350px)',
                minHeight: '600px',
                display: 'flex',
                flexDirection: 'column',
            },
        },

        mantineTableHeadRowProps: {
            style: {
                boxShadow: 'none',
            },
        },
        mantineTableBodyCellProps: {
            h: 72,
            style: {
                padding: `${theme.spacing.md} ${theme.spacing.xl}`,
                borderRight: 'none',
                borderLeft: 'none',
                borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                borderTop: 'none',
            },
        },
        renderTopToolbar: () => (
            <Box>
                <Group
                    p={`${theme.spacing.lg} ${theme.spacing.xl}`}
                    justify="space-between"
                >
                    <Group gap="xs">
                        <SearchFilter
                            search={search}
                            setSearch={setSearch}
                            placeholder="Search agents"
                        />

                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            style={{
                                alignSelf: 'center',
                            }}
                        />
                        <ProjectsFilter
                            selectedProjectUuids={selectedProjectUuids}
                            setSelectedProjectUuids={setSelectedProjectUuids}
                            tooltipLabel="Filter agents by project"
                        />

                        {hasActiveFilters && (
                            <>
                                <Divider
                                    orientation="vertical"
                                    w={1}
                                    h={20}
                                    style={{
                                        alignSelf: 'center',
                                    }}
                                />
                                <Button
                                    variant="subtle"
                                    size="xs"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconTrash}
                                            size="sm"
                                        />
                                    }
                                    onClick={handleClearFilters}
                                >
                                    Clear all filters
                                </Button>
                            </>
                        )}
                    </Group>

                    <Group gap="xs">
                        <Box
                            bg="ldGray.1"
                            c="ldGray.9"
                            style={{
                                borderRadius: 6,
                                padding: `${theme.spacing.sm} ${theme.spacing.xs}`,
                                height: 32,
                                display: 'flex',
                                alignItems: 'center',
                            }}
                        >
                            <Text fz="sm" fw={500}>
                                {isLoading
                                    ? 'Loading...'
                                    : `${filteredAgents.length} ${
                                          filteredAgents.length === 1
                                              ? 'agent'
                                              : 'agents'
                                      }`}
                            </Text>
                        </Box>
                    </Group>
                </Group>
                <Divider color="ldGray.2" />
            </Box>
        ),
        state: {
            showProgressBars: false,
            showSkeletons: isLoading,
            density: 'md',
        },
        mantineLoadingOverlayProps: {
            loaderProps: {
                color: 'violet',
            },
        },
    });

    return (
        <Box>
            <MantineReactTable table={table} />
        </Box>
    );
};

export default AiAgentAdminAgentsTable;
