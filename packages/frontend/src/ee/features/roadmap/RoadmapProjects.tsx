import {
    type RoadmapItem,
    type RoadmapProjectGroup,
    RoadmapItemPriority,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Group,
    Paper,
    Progress,
    SegmentedControl,
    Table,
    Stack,
    Text,
    ThemeIcon,
    Title,
    UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconCircleCheck,
    IconCircleDashed,
    IconCircleHalf2,
    IconCircleX,
    IconEye,
    IconFlag,
    IconRoad,
    IconSearch,
    IconTicket,
    IconLayoutKanban,
    IconTable,
} from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { ContentTableSearchInput } from '../../../components/common/ContentTable';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import FilterFacet from '../../../components/common/FilterFacet';
import MantineIcon from '../../../components/common/MantineIcon';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { getPriorityColor } from '../../pages/roadmapUtils';
import {
    defaultProjectPresentation,
    projectIcons,
    ticketStage,
    type RoadmapBoardStage,
    type RoadmapProjectPresentation,
} from './roadmapPresentation';
import classes from './RoadmapProjects.module.css';
import { RoadmapRequestDetails } from './RoadmapRequestDetails';
import {
    useRoadmapExpiry,
    useRoadmapProjects,
    useRoadmapRequests,
} from './useRoadmapProjects';

const columns = [
    {
        id: 'planned',
        label: 'Backlog',
        icon: IconCircleDashed,
        color: 'dimmed',
    },
    {
        id: 'started',
        label: 'In progress',
        icon: IconCircleHalf2,
        color: 'yellow.6',
    },
    { id: 'completed', label: 'Done', icon: IconCircleCheck, color: 'green.6' },
    { id: 'canceled', label: 'Canceled', icon: IconCircleX, color: 'dimmed' },
] as const;

function customerStage(stage: RoadmapBoardStage): RoadmapBoardStage {
    if (stage === 'backlog') return 'planned';
    if (stage === 'paused') return 'started';
    return stage;
}

function statusQuery(statuses: string[]): string {
    return statuses
        .flatMap((status) => {
            if (status === 'planned') return ['backlog', 'planned'];
            if (status === 'started') return ['started', 'paused'];
            return [status];
        })
        .join(',');
}

function Board({
    entries,
    projectBoard,
    statuses,
}: {
    entries: { id: string; stage: RoadmapBoardStage; card: ReactNode }[];
    projectBoard: boolean;
    statuses: string[];
}) {
    const visibleColumns = columns.filter((column) =>
        statuses.length
            ? statuses.includes(column.id)
            : projectBoard
              ? ['planned', 'started', 'completed', 'canceled'].includes(
                    column.id,
                )
              : ['planned', 'started'].includes(column.id) ||
                entries.some((entry) => entry.stage === column.id),
    );
    return (
        <Box className={classes.board}>
            {visibleColumns.map((column) => {
                const cards = entries.filter(
                    (entry) => entry.stage === column.id,
                );
                return (
                    <section
                        className={classes.column}
                        key={column.id}
                        aria-label={`${column.label} ${projectBoard ? 'tickets' : 'roadmap items'}`}
                    >
                        <Group className={classes.columnHeader} gap="xs">
                            <MantineIcon
                                icon={column.icon}
                                size="sm"
                                color={column.color}
                            />
                            <Text fz="sm" fw={500}>
                                {column.label}
                            </Text>
                            <Text fz="xs" c="dimmed">
                                {cards.length}
                            </Text>
                            {column.id === 'completed' && (
                                <Text fz="xs" c="dimmed">
                                    this month
                                </Text>
                            )}
                        </Group>
                        <Stack gap="xs" className={classes.columnCards}>
                            {cards.map((entry) => (
                                <div key={entry.id}>{entry.card}</div>
                            ))}
                            {!cards.length && (
                                <Text
                                    className={classes.emptyColumn}
                                    fz="xs"
                                    c="dimmed"
                                >
                                    {projectBoard ? 'No tickets' : 'No items'}
                                </Text>
                            )}
                        </Stack>
                    </section>
                );
            })}
        </Box>
    );
}

function ProjectProgress({
    value,
    expanded = false,
}: {
    value: number | null;
    expanded?: boolean;
}) {
    const label = value === null ? 'Progress unavailable' : `${value}%`;
    return (
        <Box
            className={expanded ? classes.cardProgress : classes.inlineProgress}
            aria-label={
                value === null
                    ? 'Overall project progress unavailable'
                    : `${value}% overall project progress`
            }
        >
            {expanded && (
                <Text fz="xs" c="dimmed">
                    Progress
                </Text>
            )}
            <Text className={classes.progressValue} fz="xs">
                {label}
            </Text>
            {value !== null && (
                <Progress
                    className={classes.progress}
                    value={value}
                    color="indigo"
                    size="xs"
                    aria-label="Overall project completion"
                />
            )}
        </Box>
    );
}

function ProjectIcon({ icon }: { icon: string | null }) {
    if (icon && /\p{Extended_Pictographic}/u.test(icon)) {
        return (
            <Text
                component="span"
                aria-hidden="true"
                className={classes.projectIcon}
            >
                {icon}
            </Text>
        );
    }
    const key = icon?.replace(/^Icon/, '').toLowerCase();
    const glyph =
        projectIcons[key as keyof typeof projectIcons] ?? projectIcons.folder;
    return <MantineIcon icon={glyph} className={classes.projectIcon} />;
}

function ProjectCard({
    group,
    presentation,
    onClick,
}: {
    group: RoadmapProjectGroup;
    presentation: RoadmapProjectPresentation;
    onClick: () => void;
}) {
    return (
        <UnstyledButton
            className={classes.projectCard}
            onClick={onClick}
            aria-label={`Open ${group.project.title}`}
        >
            <Group gap="sm" align="flex-start" wrap="nowrap">
                <ThemeIcon
                    variant="light"
                    color="indigo"
                    size="md"
                    className={classes.projectIcon}
                >
                    <ProjectIcon icon={presentation.icon} />
                </ThemeIcon>
                <Title order={5} className={classes.projectTitle}>
                    {group.project.title}
                </Title>
            </Group>
            <Group justify="space-between" gap="xs">
                <PriorityBadge priority={presentation.priority} />
                {group.ownRequestCount === 0 && group.hasDirectNeed && (
                    <Text fz="xs" c="dimmed">
                        Interested
                    </Text>
                )}
                {group.ownRequestCount > 0 && (
                    <Group gap={4} wrap="nowrap">
                        <MantineIcon icon={IconEye} size="sm" color="dimmed" />
                        <Text fz="xs" c="dimmed">
                            {group.ownRequestCount}{' '}
                            {group.ownRequestCount === 1 ? 'ticket' : 'tickets'}{' '}
                            followed
                        </Text>
                    </Group>
                )}
            </Group>
            <ProjectProgress value={presentation.progress} expanded />
        </UnstyledButton>
    );
}

function TicketCard({
    ticket,
    onClick,
}: {
    ticket: RoadmapItem;
    onClick: () => void;
}) {
    return (
        <UnstyledButton
            className={classes.ticketCard}
            onClick={onClick}
            aria-label={`Open ticket ${ticket.title}`}
        >
            <Group justify="space-between" gap="xs">
                <Group gap={4}>
                    <MantineIcon
                        icon={IconTicket}
                        size="sm"
                        className={classes.projectIcon}
                    />
                    <Text fz="xs" c="dimmed">
                        Ticket
                    </Text>
                </Group>
                <Text className={classes.ticketId} fz="xs" c="dimmed">
                    {ticket.ticketId}
                </Text>
            </Group>
            <Text className={classes.ticketTitle}>{ticket.title}</Text>
            <PriorityBadge priority={ticket.priority} />
        </UnstyledButton>
    );
}

function PriorityBadge({ priority }: { priority: RoadmapItemPriority }) {
    return (
        <Badge
            size="xs"
            variant="light"
            color={
                priority === RoadmapItemPriority.NO_PRIORITY
                    ? 'gray'
                    : getPriorityColor(priority)
            }
        >
            {priority}
        </Badge>
    );
}

type RoadmapEntry = {
    id: string;
    title: string;
    type: 'project' | 'ticket';
    icon: typeof IconTicket;
    projectIcon?: string | null;
    stage: RoadmapBoardStage;
    priority: RoadmapItemPriority;
    progress: number | null;
    following: number | null;
    hasDirectNeed?: boolean;
    ticketId?: string;
    onOpen: () => void;
    card: ReactNode;
};

function RoadmapTable({ entries }: { entries: RoadmapEntry[] }) {
    return (
        <Table.ScrollContainer
            type="native"
            minWidth={840}
            className={classes.tableContainer}
        >
            <Table
                stickyHeader
                verticalSpacing="md"
                horizontalSpacing="md"
                highlightOnHover
                className={classes.table}
                aria-label="Roadmap items"
            >
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Type / ID</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Priority</Table.Th>
                        <Table.Th>Progress</Table.Th>
                        <Table.Th>Following</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {entries.map((entry) => {
                        const status = columns.find(
                            (column) => column.id === entry.stage,
                        )!;
                        return (
                            <Table.Tr key={entry.id}>
                                <Table.Td className={classes.nameCell}>
                                    <UnstyledButton
                                        className={classes.tableTitle}
                                        onClick={entry.onOpen}
                                        aria-label={`Open ${entry.type === 'ticket' ? 'ticket ' : ''}${entry.title}`}
                                    >
                                        {entry.type === 'project' ? (
                                            <ProjectIcon
                                                icon={entry.projectIcon ?? null}
                                            />
                                        ) : (
                                            <MantineIcon
                                                icon={entry.icon}
                                                className={classes.projectIcon}
                                            />
                                        )}
                                        <Text
                                            fz="sm"
                                            fw={
                                                entry.type === 'project'
                                                    ? 600
                                                    : 400
                                            }
                                        >
                                            {entry.title}
                                        </Text>
                                    </UnstyledButton>
                                </Table.Td>
                                <Table.Td>
                                    <Text fz="xs" c="dimmed">
                                        {entry.ticketId ?? 'Project'}
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap="xs" wrap="nowrap">
                                        <MantineIcon
                                            icon={status.icon}
                                            color={status.color}
                                            size="sm"
                                        />
                                        <Text fz="sm">{status.label}</Text>
                                    </Group>
                                </Table.Td>
                                <Table.Td>
                                    <PriorityBadge priority={entry.priority} />
                                </Table.Td>
                                <Table.Td>
                                    {entry.type === 'project' ? (
                                        <ProjectProgress
                                            value={entry.progress}
                                        />
                                    ) : (
                                        <Text c="dimmed" fz="xs">
                                            —
                                        </Text>
                                    )}
                                </Table.Td>
                                <Table.Td>
                                    <Text fz="xs" c="dimmed">
                                        {entry.following
                                            ? `${entry.following} ${entry.following === 1 ? 'ticket' : 'tickets'}`
                                            : entry.type === 'ticket'
                                              ? 'Following'
                                              : entry.hasDirectNeed
                                                ? 'Interested'
                                                : ''}
                                    </Text>
                                </Table.Td>
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    );
}

function BoardError({
    retry,
    message = 'Could not load the roadmap',
}: {
    retry: () => void;
    message?: string;
}) {
    return (
        <Box p="xl">
            <SuboptimalState
                icon={IconAlertCircle}
                title={message}
                description="We couldn't refresh the board. Please try again."
                action={
                    <Button variant="default" onClick={retry}>
                        Try again
                    </Button>
                }
            />
        </Box>
    );
}

export function RoadmapProjects({ cacheKey }: { cacheKey: string }) {
    const { pathname } = useLocation();
    const [view, setView] = useState('board');
    const [onlyInterested, setOnlyInterested] = useState(false);
    const [mainStatuses, setMainStatuses] = useState<string[]>([]);
    const [mainPriorities, setMainPriorities] = useState<string[]>([]);
    const [projectStatuses, setProjectStatuses] = useState<string[]>([]);
    const [projectPriorities, setProjectPriorities] = useState<string[]>([]);
    const [mainSearch, setMainSearch] = useState('');
    const [projectSearch, setProjectSearch] = useState('');
    const [debouncedMainSearch] = useDebouncedValue(mainSearch.trim(), 300);
    const [debouncedProjectSearch] = useDebouncedValue(
        projectSearch.trim(),
        300,
    );
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
        null,
    );
    const [selectedTicket, setSelectedTicket] = useState<RoadmapItem | null>(
        null,
    );
    const projectsQuery = useRoadmapProjects(
        {
            pageSize: 10,
            search: debouncedMainSearch,
            onlyInterested,
            statuses: statusQuery(mainStatuses),
            priorities: mainPriorities.join(','),
        },
        cacheKey,
    );
    const ticketsQuery = useRoadmapRequests(
        {
            groupId: selectedProjectId ?? 'other',
            statuses: statusQuery(
                selectedProjectId ? projectStatuses : mainStatuses,
            ),
            priorities: (selectedProjectId
                ? projectPriorities
                : mainPriorities
            ).join(','),
            pageSize: 10,
            search: selectedProjectId
                ? debouncedProjectSearch
                : debouncedMainSearch,
        },
        cacheKey,
        projectsQuery.isSuccess,
    );
    const projects =
        projectsQuery.data?.pages.flatMap((page) => page.projects) ?? [];
    const tickets =
        ticketsQuery.data?.pages.flatMap((page) =>
            page.requests.map((item) => item.request),
        ) ?? [];
    const expiresAt = [
        ...(projectsQuery.data?.pages ?? []),
        ...(ticketsQuery.data?.pages ?? []),
    ]
        .map((page) => page.expiresAt)
        .sort()[0];
    const expired = useRoadmapExpiry(expiresAt);
    const { refetch: refetchProjects } = projectsQuery;
    const { refetch: refetchTickets } = ticketsQuery;
    useEffect(() => {
        if (expired) {
            setSelectedTicket(null);
            void refetchProjects();
            void refetchTickets();
        }
    }, [expired, refetchProjects, refetchTickets]);
    const selectedProject = projects.find(
        (group) => group.project.projectId === selectedProjectId,
    );
    const presentation = selectedProject?.project ?? defaultProjectPresentation;
    const projectBoard = selectedProjectId !== null;
    const statuses = projectBoard ? projectStatuses : mainStatuses;
    const priorities = projectBoard ? projectPriorities : mainPriorities;
    const setStatuses = projectBoard ? setProjectStatuses : setMainStatuses;
    const setPriorities = projectBoard
        ? setProjectPriorities
        : setMainPriorities;
    const hasFilters =
        statuses.length > 0 ||
        priorities.length > 0 ||
        (projectBoard ? projectSearch : mainSearch) !== '';
    const clearFilters = () => {
        setStatuses([]);
        setPriorities([]);
        (projectBoard ? setProjectSearch : setMainSearch)('');
    };
    const loading =
        projectsQuery.isInitialLoading ||
        ticketsQuery.isInitialLoading ||
        (expired && (projectsQuery.isFetching || ticketsQuery.isFetching));
    const unavailable =
        projectsQuery.error?.error?.statusCode === 403 ||
        ticketsQuery.error?.error?.statusCode === 403;
    const failed = projectsQuery.isError || ticketsQuery.isError || expired;
    const retry = () => {
        void refetchProjects();
        if (projectsQuery.isSuccess) void refetchTickets();
    };
    const back = () => {
        setSelectedProjectId(null);
        setProjectSearch('');
        setSelectedTicket(null);
    };
    const entries: RoadmapEntry[] = [
        ...(!projectBoard
            ? projects.map((group): RoadmapEntry => {
                  const metadata = group.project ?? defaultProjectPresentation;
                  const onOpen = () => {
                      setSelectedProjectId(group.project.projectId);
                      setProjectSearch('');
                      setProjectStatuses([]);
                      setProjectPriorities([]);
                  };
                  return {
                      id: `project-${group.project.projectId}`,
                      title: group.project.title,
                      type: 'project',
                      icon: IconTicket,
                      projectIcon: metadata.icon,
                      stage: customerStage(metadata.stage),
                      priority: metadata.priority,
                      progress: metadata.progress,
                      following: group.ownRequestCount,
                      hasDirectNeed: group.hasDirectNeed,
                      onOpen,
                      card: (
                          <ProjectCard
                              group={group}
                              presentation={metadata}
                              onClick={onOpen}
                          />
                      ),
                  };
              })
            : []),
        ...tickets.map(
            (ticket): RoadmapEntry => ({
                id: `ticket-${ticket.ticketId}`,
                title: ticket.title,
                type: 'ticket',
                icon: IconTicket,
                stage: customerStage(ticketStage(ticket.status)),
                priority: ticket.priority,
                progress: null,
                following: null,
                ticketId: ticket.ticketId,
                onOpen: () => setSelectedTicket(ticket),
                card: (
                    <TicketCard
                        ticket={ticket}
                        onClick={() => setSelectedTicket(ticket)}
                    />
                ),
            }),
        ),
    ];
    return (
        <SettingsPage
            fillHeight
            title={
                projectBoard
                    ? !failed && selectedProject
                        ? selectedProject.project.title
                        : 'Project board'
                    : 'Roadmap'
            }
            breadcrumbs={
                projectBoard
                    ? [{ title: 'Roadmap', to: pathname, onClick: back }]
                    : undefined
            }
            description={
                projectBoard
                    ? 'Tickets your organization follows in this project.'
                    : 'Explore the Lightdash roadmap and track your organization’s feature requests.'
            }
            actions={
                projectBoard && !failed && selectedProject ? (
                    <ProjectProgress value={presentation.progress} />
                ) : undefined
            }
        >
            <Group
                justify="space-between"
                gap="sm"
                wrap="wrap"
                className={classes.toolbar}
            >
                <Group gap="sm">
                    <ContentTableSearchInput
                        tooltipLabel={
                            projectBoard
                                ? 'Search project tickets'
                                : 'Search roadmap'
                        }
                        aria-label={
                            projectBoard
                                ? 'Search project tickets'
                                : 'Search roadmap'
                        }
                        placeholder={
                            projectBoard
                                ? 'Search project tickets'
                                : 'Search roadmap'
                        }
                        collapsedWidth={340}
                        expandedWidth={340}
                        value={projectBoard ? projectSearch : mainSearch}
                        onChange={
                            projectBoard ? setProjectSearch : setMainSearch
                        }
                    />
                    <FilterFacet
                        label="Status"
                        icon={IconRoad}
                        selected={statuses}
                        onChange={setStatuses}
                        options={columns
                            .filter(
                                (column) =>
                                    !projectBoard ||
                                    [
                                        'planned',
                                        'started',
                                        'completed',
                                        'canceled',
                                    ].includes(column.id),
                            )
                            .map((column) => ({
                                value: column.id,
                                label: column.label,
                            }))}
                        tooltipLabel="Filter by status"
                    />
                    <FilterFacet
                        label="Priority"
                        icon={IconFlag}
                        selected={priorities}
                        onChange={setPriorities}
                        options={Object.values(RoadmapItemPriority).map(
                            (priority) => ({
                                value: priority,
                                label: priority,
                            }),
                        )}
                        tooltipLabel="Filter by priority"
                    />
                    {!projectBoard && (
                        <FilterFacet
                            label="Interest"
                            showSelectionCount={false}
                            icon={IconEye}
                            mode="single"
                            selected={onlyInterested ? ['following'] : ['all']}
                            onChange={(selected) =>
                                setOnlyInterested(
                                    selected.includes('following'),
                                )
                            }
                            options={[
                                {
                                    value: 'following',
                                    label: 'Following',
                                },
                                {
                                    value: 'all',
                                    label: 'All',
                                },
                            ]}
                            tooltipLabel="Filter by your organization’s interests"
                        />
                    )}
                </Group>
                <Group gap="md" className={classes.viewControls}>
                    <SegmentedControl
                        aria-label="Roadmap view"
                        size="xs"
                        value={view}
                        onChange={setView}
                        data={[
                            {
                                value: 'board',
                                label: (
                                    <Group gap="xs" wrap="nowrap">
                                        <MantineIcon
                                            icon={IconLayoutKanban}
                                            size="sm"
                                        />
                                        Board
                                    </Group>
                                ),
                            },
                            {
                                value: 'table',
                                label: (
                                    <Group gap="xs" wrap="nowrap">
                                        <MantineIcon
                                            icon={IconTable}
                                            size="sm"
                                        />
                                        Table
                                    </Group>
                                ),
                            },
                        ]}
                    />
                </Group>
            </Group>
            {unavailable ? (
                <Box p="xl">
                    <SuboptimalState
                        icon={IconRoad}
                        title="Your roadmap isn't set up yet"
                        description="Reach out to your Lightdash contact to get it switched on."
                    />
                </Box>
            ) : projectsQuery.isError ? (
                <BoardError retry={retry} />
            ) : loading ? (
                <Box p="xl">
                    <EmptyStateLoader
                        title={
                            projectBoard
                                ? 'Loading project tickets'
                                : 'Loading roadmap'
                        }
                    />
                </Box>
            ) : failed ? (
                <BoardError retry={retry} />
            ) : projectBoard && !selectedProject ? (
                <Box p="xl">
                    <SuboptimalState
                        icon={IconRoad}
                        title="This project is no longer on the roadmap"
                        description="You can still find eligible tickets you follow on the main board."
                    />
                </Box>
            ) : !entries.length ? (
                <Box p="xl">
                    <Paper variant="dotted" p="xl">
                        <SuboptimalState
                            icon={IconSearch}
                            title={
                                projectBoard
                                    ? hasFilters
                                        ? 'No matching tickets'
                                        : 'No followed tickets in this project'
                                    : hasFilters
                                      ? 'No matching projects or tickets'
                                      : 'No roadmap items yet'
                            }
                            description={
                                projectBoard
                                    ? 'Only your organization’s visible requests in this project appear here.'
                                    : 'Projects and tickets you follow will appear here.'
                            }
                            action={
                                hasFilters ? (
                                    <Button
                                        variant="default"
                                        onClick={clearFilters}
                                    >
                                        Clear filters
                                    </Button>
                                ) : undefined
                            }
                        />
                    </Paper>
                </Box>
            ) : (
                <>
                    {view === 'board' ? (
                        <Board
                            entries={entries}
                            projectBoard={projectBoard}
                            statuses={statuses}
                        />
                    ) : (
                        <RoadmapTable entries={entries} />
                    )}
                    {((!projectBoard && projectsQuery.hasNextPage) ||
                        ticketsQuery.hasNextPage) && (
                        <Group
                            justify="center"
                            gap="sm"
                            className={classes.pagination}
                        >
                            {!projectBoard && projectsQuery.hasNextPage && (
                                <Button
                                    variant="default"
                                    size="xs"
                                    loading={projectsQuery.isFetchingNextPage}
                                    onClick={() =>
                                        void projectsQuery.fetchNextPage()
                                    }
                                >
                                    Load more projects
                                </Button>
                            )}
                            {ticketsQuery.hasNextPage && (
                                <Button
                                    variant="default"
                                    size="xs"
                                    loading={ticketsQuery.isFetchingNextPage}
                                    onClick={() =>
                                        void ticketsQuery.fetchNextPage()
                                    }
                                >
                                    Load more tickets
                                </Button>
                            )}
                        </Group>
                    )}
                </>
            )}
            <RoadmapRequestDetails
                item={failed ? null : selectedTicket}
                onClose={() => setSelectedTicket(null)}
            />
        </SettingsPage>
    );
}
