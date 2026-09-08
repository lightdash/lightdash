import {
    type RoadmapItem,
    type RoadmapProjectGroup,
    RoadmapItemPriority,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Checkbox,
    Group,
    Paper,
    Progress,
    SegmentedControl,
    Table,
    Stack,
    Text,
    TextInput,
    ThemeIcon,
    Title,
    UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconArrowLeft,
    IconCircleCheck,
    IconCircleDashed,
    IconCircleDotted,
    IconCircleHalf2,
    IconCircleX,
    IconPlayerPause,
    IconEye,
    IconRoad,
    IconSearch,
    IconTicket,
    IconLayoutKanban,
    IconTable,
} from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import MantineIcon from '../../../components/common/MantineIcon';
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
        id: 'backlog',
        label: 'Backlog',
        icon: IconCircleDotted,
        color: 'dimmed',
    },
    {
        id: 'planned',
        label: 'Planned',
        icon: IconCircleDashed,
        color: 'dimmed',
    },
    {
        id: 'started',
        label: 'In progress',
        icon: IconCircleHalf2,
        color: 'yellow.6',
    },
    { id: 'paused', label: 'Paused', icon: IconPlayerPause, color: 'orange.6' },
    { id: 'completed', label: 'Done', icon: IconCircleCheck, color: 'green.6' },
    { id: 'canceled', label: 'Canceled', icon: IconCircleX, color: 'dimmed' },
] as const;

function Board({
    entries,
    projectBoard,
}: {
    entries: { id: string; stage: RoadmapBoardStage; card: ReactNode }[];
    projectBoard: boolean;
}) {
    const visibleColumns = columns.filter((column) =>
        projectBoard
            ? ['backlog', 'started', 'completed', 'canceled'].includes(
                  column.id,
              )
            : ['backlog', 'planned', 'started', 'paused'].includes(column.id) ||
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
                        </Group>
                        <Stack gap="sm" className={classes.columnCards}>
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
                    Overall progress
                </Text>
            )}
            <Text className={classes.progressValue} fz="xs">
                {label}
            </Text>
            {value !== null && (
                <Progress
                    className={classes.progress}
                    value={value}
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
                    <MantineIcon icon={IconTicket} size="sm" color="dimmed" />
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
            minWidth={840}
            className={classes.tableContainer}
        >
            <Table
                verticalSpacing="md"
                horizontalSpacing="md"
                highlightOnHover
                aria-label="Roadmap items"
            >
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Type / ID</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Priority</Table.Th>
                        <Table.Th>Overall progress</Table.Th>
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

export function RoadmapProjects({
    cacheKey,
    showDesignPartnerPreview = false,
    preview = false,
}: {
    cacheKey: string;
    showDesignPartnerPreview?: boolean;
    preview?: boolean;
}) {
    const [view, setView] = useState('board');
    const [onlyInterested, setOnlyInterested] = useState(false);
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
    const [interestProject, setInterestProject] = useState<string | null>(null);
    const projectsQuery = useRoadmapProjects(
        { pageSize: 10, search: debouncedMainSearch, onlyInterested },
        cacheKey,
    );
    const ticketsQuery = useRoadmapRequests(
        {
            groupId: selectedProjectId ?? 'other',
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
        setInterestProject(null);
    };
    const entries: RoadmapEntry[] = [
        ...(!projectBoard
            ? projects.map((group): RoadmapEntry => {
                  const metadata = group.project ?? defaultProjectPresentation;
                  const onOpen = () => {
                      setSelectedProjectId(group.project.projectId);
                      setProjectSearch('');
                  };
                  return {
                      id: `project-${group.project.projectId}`,
                      title: group.project.title,
                      type: 'project',
                      icon: IconTicket,
                      projectIcon: metadata.icon,
                      stage: metadata.stage,
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
                stage: ticketStage(ticket.status),
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
        <Stack className={classes.page} gap={0}>
            <Group
                className={classes.pageHeader}
                justify="space-between"
                gap="md"
            >
                <Group gap="sm">
                    {projectBoard ? (
                        <Button
                            leftSection={
                                <MantineIcon icon={IconArrowLeft} size="sm" />
                            }
                            variant="subtle"
                            size="xs"
                            onClick={back}
                        >
                            Back to roadmap
                        </Button>
                    ) : (
                        <ThemeIcon variant="default" size="lg">
                            <MantineIcon icon={IconRoad} />
                        </ThemeIcon>
                    )}
                    {projectBoard && !failed && selectedProject && (
                        <ProjectIcon icon={presentation.icon} />
                    )}
                    <Title order={4}>
                        {projectBoard
                            ? !failed && selectedProject
                                ? selectedProject.project.title
                                : 'Project board'
                            : 'Roadmap'}
                    </Title>
                    {!projectBoard && preview && (
                        <Badge size="sm" variant="light">
                            Preview
                        </Badge>
                    )}
                </Group>
                {projectBoard && !failed && selectedProject ? (
                    <Group gap="md">
                        <Text fz="xs" c="dimmed">
                            Overall progress
                        </Text>
                        <ProjectProgress value={presentation.progress} />
                        {showDesignPartnerPreview && (
                            <Button
                                size="xs"
                                variant="default"
                                onClick={() =>
                                    setInterestProject(selectedProjectId)
                                }
                            >
                                Become a design partner
                            </Button>
                        )}
                    </Group>
                ) : (
                    !projectBoard && (
                        <Text fz="sm" c="dimmed">
                            Shared projects and your organization’s requests
                        </Text>
                    )
                )}
            </Group>
            <Group
                className={classes.boardToolbar}
                justify="space-between"
                gap="sm"
            >
                <Group gap="sm">
                    <Text fz="sm" fw={500}>
                        {projectBoard
                            ? 'Tickets your organization follows'
                            : 'Projects & tickets'}
                    </Text>
                    {!failed && !loading && (
                        <Text fz="xs" c="dimmed">
                            {projectBoard
                                ? `${ticketsQuery.data?.pages[0].pagination.totalResults ?? 0} tickets`
                                : `${projectsQuery.data?.pages[0].pagination.totalResults ?? 0} projects · ${ticketsQuery.data?.pages[0].pagination.totalResults ?? 0} loose tickets`}
                        </Text>
                    )}
                </Group>
                <Group gap="md" className={classes.viewControls}>
                    {!projectBoard && (
                        <Checkbox
                            size="xs"
                            label="Only our interests"
                            checked={onlyInterested}
                            onChange={(event) =>
                                setOnlyInterested(event.currentTarget.checked)
                            }
                        />
                    )}
                    <TextInput
                        className={classes.search}
                        size="xs"
                        aria-label={
                            projectBoard
                                ? 'Search project tickets'
                                : 'Search roadmap'
                        }
                        placeholder={
                            projectBoard
                                ? 'Search tickets you follow…'
                                : 'Search projects or tickets…'
                        }
                        leftSection={
                            <MantineIcon icon={IconSearch} size="sm" />
                        }
                        value={projectBoard ? projectSearch : mainSearch}
                        onChange={(event) =>
                            projectBoard
                                ? setProjectSearch(event.currentTarget.value)
                                : setMainSearch(event.currentTarget.value)
                        }
                    />
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
            {interestProject !== null && !failed && (
                <Text fz="xs" c="dimmed" px="xl" py="sm" role="status">
                    Preview only — no interest has been submitted.
                </Text>
            )}
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
                        action={
                            <Button variant="default" onClick={back}>
                                Back to roadmap
                            </Button>
                        }
                    />
                </Box>
            ) : !entries.length ? (
                <Box p="xl">
                    <Paper variant="dotted" p="xl">
                        <SuboptimalState
                            icon={IconSearch}
                            title={
                                projectBoard
                                    ? projectSearch
                                        ? 'No matching tickets'
                                        : 'No followed tickets in this project'
                                    : mainSearch
                                      ? 'No matching projects or tickets'
                                      : 'No roadmap items yet'
                            }
                            description={
                                projectBoard
                                    ? 'Only your organization’s visible requests in this project appear here.'
                                    : 'Projects and tickets you follow will appear here.'
                            }
                            action={
                                (projectBoard ? projectSearch : mainSearch) ? (
                                    <Button
                                        variant="default"
                                        onClick={() =>
                                            projectBoard
                                                ? setProjectSearch('')
                                                : setMainSearch('')
                                        }
                                    >
                                        Clear search
                                    </Button>
                                ) : undefined
                            }
                        />
                    </Paper>
                </Box>
            ) : (
                <>
                    {view === 'board' ? (
                        <Board entries={entries} projectBoard={projectBoard} />
                    ) : (
                        <RoadmapTable entries={entries} />
                    )}
                    <Group justify="center" gap="sm" p="md">
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
                </>
            )}
            <RoadmapRequestDetails
                item={failed ? null : selectedTicket}
                onClose={() => setSelectedTicket(null)}
            />
        </Stack>
    );
}
