import {
    assertUnreachable,
    ROADMAP_DEFAULT_PAGE_SIZE,
    type RoadmapItem,
    type RoadmapProjectGroup,
    type RoadmapProject,
    type RoadmapProjectQuery,
    type RoadmapQuery,
    RoadmapItemPriority,
    RoadmapItemStatus,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Group,
    Paper,
    RingProgress,
    SegmentedControl,
    Table,
    Stack,
    Text,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconArrowUpRight,
    IconCircleCheck,
    IconCircleDashed,
    IconCircleHalf2,
    IconCircleX,
    IconEye,
    IconFlag,
    IconFilter,
    IconRoad,
    IconSearch,
    IconTicket,
    IconLayoutKanban,
    IconTable,
} from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { ContentTableSearchInput } from '../../../components/common/ContentTable';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import FilterFacet from '../../../components/common/FilterFacet';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    PriorityBars,
    type PriorityLevel,
} from '../../../components/common/PriorityBars';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import i18n from '../../../i18n/i18n';
import {
    FollowProjectButton,
    type FollowProjectAction,
} from './FollowProjectButton';
import { FollowProjectModal } from './FollowProjectModal';
import {
    defaultProjectPresentation,
    getProjectPresentation,
    getRoadmapPriorityLabel,
    ticketStage,
    type RoadmapBoardStage,
    type RoadmapProjectPresentation,
} from './roadmapPresentation';
import { RoadmapProjectDetails } from './RoadmapProjectDetails';
import classes from './RoadmapProjects.module.css';
import { RoadmapRequestDetails } from './RoadmapRequestDetails';
import { RoadmapSlackThreads } from './RoadmapSlackThreads';
import { useFollowRoadmapProject } from './useFollowRoadmapProject';
import { useRoadmapBoard } from './useRoadmapBoard';
import { useRoadmapProjects, useRoadmapRequests } from './useRoadmapProjects';

const columns = [
    {
        id: 'planned',
        get label() {
            return i18n.t('roadmap.columns.backlog', { ns: 'eeMisc' });
        },
        icon: IconCircleDashed,
        color: 'dimmed',
        ticketStatus: RoadmapItemStatus.BACKLOG,
    },
    {
        id: 'started',
        get label() {
            return i18n.t('roadmap.columns.inProgress', { ns: 'eeMisc' });
        },
        icon: IconCircleHalf2,
        color: 'yellow.6',
        ticketStatus: RoadmapItemStatus.BUILDING,
    },
    {
        id: 'completed',
        get label() {
            return i18n.t('roadmap.columns.done', { ns: 'eeMisc' });
        },
        icon: IconCircleCheck,
        color: 'green.6',
        ticketStatus: RoadmapItemStatus.SHIPPED,
    },
    {
        id: 'canceled',
        get label() {
            return i18n.t('roadmap.columns.canceled', { ns: 'eeMisc' });
        },
        icon: IconCircleX,
        color: 'dimmed',
        ticketStatus: RoadmapItemStatus.CANCELED,
    },
] as const;

const COLUMN_PREVIEW_LIMIT = 20;

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
    columnQueries,
    projectStatusCounts,
}: {
    entries: { id: string; stage: RoadmapBoardStage; card: ReactNode }[];
    projectBoard: boolean;
    statuses: string[];
    columnQueries: ReturnType<typeof useRoadmapBoard>;
    projectStatusCounts: RoadmapProject['issueStatusCounts'] | null;
}) {
    const { t } = useTranslation('eeMisc');
    const [expandedColumns, setExpandedColumns] = useState<string[]>([]);
    const visibleColumns = columns.filter((column) =>
        statuses.length
            ? statuses.includes(column.id)
            : projectBoard
              ? ['planned', 'started', 'completed', 'canceled'].includes(
                    column.id,
                )
              : ['planned', 'started'].includes(column.id) ||
                columnQueries.some(
                    (query) => query.id === column.id && query.total > 0,
                ),
    );
    return (
        <Box className={classes.board}>
            {visibleColumns.map((column) => {
                const cards = entries.filter(
                    (entry) => entry.stage === column.id,
                );
                const query = columnQueries.find(
                    (query) => query.id === column.id,
                )!;
                const isCollapsed =
                    query.total > COLUMN_PREVIEW_LIMIT &&
                    !expandedColumns.includes(column.id);
                const visibleCards = isCollapsed
                    ? cards.slice(0, COLUMN_PREVIEW_LIMIT)
                    : cards;
                const columnTotal =
                    projectStatusCounts?.[column.ticketStatus] ?? query.total;
                const remainingTicketCount = projectStatusCounts
                    ? Math.max(
                          0,
                          projectStatusCounts[column.ticketStatus] -
                              query.total,
                      )
                    : 0;
                return (
                    <section
                        className={classes.column}
                        key={column.id}
                        aria-label={
                            projectBoard
                                ? t('roadmap.board.columnTickets', {
                                      column: column.label,
                                  })
                                : t('roadmap.board.columnItems', {
                                      column: column.label,
                                  })
                        }
                    >
                        <Group
                            className={classes.columnHeader}
                            gap="xs"
                            align="baseline"
                        >
                            <MantineIcon
                                className={classes.columnIcon}
                                icon={column.icon}
                                size="sm"
                                color={column.color}
                            />
                            <Text fz="sm" fw={500}>
                                {column.label}
                            </Text>
                            <Badge
                                size="sm"
                                className={classes.columnCount}
                                aria-label={
                                    projectBoard
                                        ? t('roadmap.board.totalTickets', {
                                              count: columnTotal,
                                          })
                                        : undefined
                                }
                            >
                                {columnTotal}
                            </Badge>
                            {(column.id === 'completed' ||
                                column.id === 'canceled') && (
                                <Text fz="xs" c="dimmed">
                                    {t('roadmap.board.thisMonth')}
                                </Text>
                            )}
                        </Group>
                        <Stack gap="xs" className={classes.columnCards}>
                            {remainingTicketCount > 0 && (
                                <Box
                                    className={classes.ticketStack}
                                    data-stacked={
                                        remainingTicketCount > 1 || undefined
                                    }
                                >
                                    <Box className={classes.ticketStackCard}>
                                        <Group
                                            gap="xs"
                                            wrap="nowrap"
                                            align="center"
                                        >
                                            <MantineIcon
                                                icon={IconTicket}
                                                size="sm"
                                                className={classes.ticketIcon}
                                            />
                                            <Tooltip
                                                label={t(
                                                    'roadmap.board.onlyFollowedShown',
                                                )}
                                                events={{
                                                    hover: true,
                                                    focus: true,
                                                    touch: false,
                                                }}
                                            >
                                                <Text
                                                    className={
                                                        classes.ticketTitle
                                                    }
                                                    tabIndex={0}
                                                >
                                                    {t(
                                                        'roadmap.board.otherTickets',
                                                        {
                                                            count: remainingTicketCount,
                                                        },
                                                    )}
                                                </Text>
                                            </Tooltip>
                                        </Group>
                                    </Box>
                                </Box>
                            )}
                            {visibleCards.map((entry) => (
                                <div key={entry.id}>{entry.card}</div>
                            ))}
                            {query.total > COLUMN_PREVIEW_LIMIT &&
                                (isCollapsed || query.hasNextPage) && (
                                    <Button
                                        variant="subtle"
                                        size="xs"
                                        color="gray"
                                        fullWidth
                                        loading={query.fetchingMore}
                                        onClick={() => {
                                            setExpandedColumns((expanded) => [
                                                ...expanded,
                                                column.id,
                                            ]);
                                            void query.fetchAll();
                                        }}
                                    >
                                        {t('roadmap.board.showAll', {
                                            count: query.total,
                                        })}
                                    </Button>
                                )}
                            {!cards.length && !remainingTicketCount && (
                                <Text
                                    className={classes.emptyColumn}
                                    fz="xs"
                                    c="dimmed"
                                >
                                    {t('roadmap.board.noItems')}
                                </Text>
                            )}
                        </Stack>
                    </section>
                );
            })}
        </Box>
    );
}

function ProjectProgress({ value }: { value: number | null }) {
    const { t } = useTranslation('eeMisc');
    return (
        <Group
            gap={6}
            wrap="nowrap"
            role="img"
            aria-label={
                value === null
                    ? t('roadmap.progress.unavailableAria')
                    : t('roadmap.progress.aria', { value })
            }
        >
            {value !== null && (
                <RingProgress
                    size={18}
                    thickness={3}
                    rootColor="ldGray.2"
                    sections={[{ value, color: 'ldGray.7' }]}
                />
            )}
            <Text className={classes.progressValue} fz="xs" c="dimmed">
                {value === null
                    ? t('roadmap.progress.unavailable')
                    : t('roadmap.progress.percent', { value })}
            </Text>
        </Group>
    );
}

function priorityLevel(priority: RoadmapItemPriority): PriorityLevel {
    switch (priority) {
        case RoadmapItemPriority.URGENT:
            return 'urgent';
        case RoadmapItemPriority.HIGH:
            return 'high';
        case RoadmapItemPriority.MEDIUM:
            return 'medium';
        case RoadmapItemPriority.LOW:
            return 'low';
        case RoadmapItemPriority.NO_PRIORITY:
            return 'none';
        default:
            return assertUnreachable(
                priority,
                `Unknown roadmap priority ${priority}`,
            );
    }
}

function ItemPriority({
    priority,
    withLabel = false,
}: {
    priority: RoadmapItemPriority;
    withLabel?: boolean;
}) {
    const { t } = useTranslation('eeMisc');
    const level = priorityLevel(priority);
    const label = getRoadmapPriorityLabel(priority);
    const glyph = (
        <Group
            gap={6}
            wrap="nowrap"
            role="img"
            aria-label={t('roadmap.priorityAria', { priority: label })}
            className={
                level === 'none' && !withLabel
                    ? classes.priorityNone
                    : undefined
            }
        >
            <PriorityBars priority={level} />
            {withLabel && <Text fz="sm">{label}</Text>}
        </Group>
    );
    if (withLabel) return glyph;
    return (
        <Tooltip label={label} openDelay={300}>
            {glyph}
        </Tooltip>
    );
}

function ProjectCard({
    group,
    presentation,
    onClick,
    onOpenBoard,
    followAction,
}: {
    group: RoadmapProjectGroup;
    presentation: RoadmapProjectPresentation;
    onClick: () => void;
    onOpenBoard: (() => void) | null;
    followAction: FollowProjectAction;
}) {
    const { t } = useTranslation('eeMisc');
    return (
        <Box className={classes.projectCard}>
            <Box className={classes.projectCardBody}>
                <UnstyledButton
                    className={classes.cardOpen}
                    onClick={onClick}
                    aria-label={t('roadmap.open', {
                        title: group.project.title,
                    })}
                >
                    <Title order={5} className={classes.projectTitle}>
                        {group.project.title}
                    </Title>
                    {group.project.description.trim() && (
                        <Text fz="xs" c="dimmed">
                            {group.project.description}
                        </Text>
                    )}
                </UnstyledButton>
                <Group
                    justify="space-between"
                    gap="xs"
                    className={classes.cardMetadata}
                >
                    <Group gap="sm" wrap="nowrap">
                        <ProjectProgress value={presentation.progress} />
                        <ItemPriority priority={presentation.priority} />
                        <Box className={classes.slackControl}>
                            <RoadmapSlackThreads urls={group.slackThreadUrls} />
                        </Box>
                    </Group>
                    {group.ownRequestCount === 0 && group.hasDirectNeed && (
                        <Text fz="xs" c="dimmed">
                            {t('roadmap.interested')}
                        </Text>
                    )}
                    {group.ownRequestCount > 0 && (
                        <Group gap={4} wrap="nowrap">
                            <MantineIcon
                                icon={IconEye}
                                size="sm"
                                color="dimmed"
                            />
                            <Text fz="xs" c="dimmed">
                                {t('roadmap.ticketsFollowed', {
                                    count: group.ownRequestCount,
                                })}
                            </Text>
                        </Group>
                    )}
                </Group>
            </Box>
            <FollowProjectButton
                compact
                className={classes.projectFollowAction}
                item={group}
                {...followAction}
            />
            {onOpenBoard && (
                <UnstyledButton
                    className={classes.projectCardFooter}
                    onClick={onOpenBoard}
                    aria-label={t('roadmap.openBoardFor', {
                        title: group.project.title,
                    })}
                >
                    <Group gap={6}>
                        <MantineIcon icon={IconLayoutKanban} size={14} />
                        <Text fz="xs">{t('roadmap.details.openBoard')}</Text>
                    </Group>
                    <MantineIcon icon={IconArrowUpRight} size={14} />
                </UnstyledButton>
            )}
        </Box>
    );
}

function TicketCard({
    ticket,
    onClick,
}: {
    ticket: RoadmapItem;
    onClick: () => void;
}) {
    const { t } = useTranslation('eeMisc');
    return (
        <Box className={classes.ticketCard}>
            <Stack gap="xs">
                <UnstyledButton
                    className={classes.cardOpen}
                    onClick={onClick}
                    aria-label={t('roadmap.openTicket', {
                        title: ticket.title,
                    })}
                >
                    <Text className={classes.ticketTitle}>{ticket.title}</Text>
                </UnstyledButton>
                <Group gap={6} wrap="nowrap" className={classes.ticketStub}>
                    <Text fz="xs" c="ldGray.5" className={classes.ticketId}>
                        {ticket.ticketId}
                    </Text>
                    <ItemPriority priority={ticket.priority} />
                    <Box className={classes.slackControl}>
                        <RoadmapSlackThreads urls={ticket.slackThreadUrls} />
                    </Box>
                </Group>
            </Stack>
        </Box>
    );
}

type RoadmapEntry = {
    id: string;
    title: string;
    description: string | null;
    type: 'project' | 'ticket';
    stage: RoadmapBoardStage;
    priority: RoadmapItemPriority;
    progress: number | null;
    following: number | null;
    slackThreadUrls: string[];
    hasDirectNeed?: boolean;
    ticketId?: string;
    onOpen: () => void;
    onOpenBoard: (() => void) | null;
    card: ReactNode;
};

function RoadmapTable({ entries }: { entries: RoadmapEntry[] }) {
    const { t } = useTranslation('eeMisc');
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
                aria-label={t('roadmap.table.label')}
            >
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>{t('roadmap.table.name')}</Table.Th>
                        <Table.Th>{t('roadmap.table.typeId')}</Table.Th>
                        <Table.Th>{t('roadmap.details.status')}</Table.Th>
                        <Table.Th>{t('roadmap.details.priority')}</Table.Th>
                        <Table.Th>{t('roadmap.details.progress')}</Table.Th>
                        <Table.Th>{t('roadmap.details.following')}</Table.Th>
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
                                    <Group gap="xs" wrap="nowrap">
                                        <UnstyledButton
                                            className={classes.tableTitle}
                                            onClick={entry.onOpen}
                                            aria-label={
                                                entry.type === 'ticket'
                                                    ? t('roadmap.openTicket', {
                                                          title: entry.title,
                                                      })
                                                    : t('roadmap.open', {
                                                          title: entry.title,
                                                      })
                                            }
                                        >
                                            {entry.type === 'ticket' && (
                                                <MantineIcon
                                                    icon={IconTicket}
                                                    className={
                                                        classes.ticketIcon
                                                    }
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
                                        <RoadmapSlackThreads
                                            urls={entry.slackThreadUrls}
                                        />
                                    </Group>
                                    {entry.description?.trim() && (
                                        <Text fz="xs" c="dimmed">
                                            {entry.description}
                                        </Text>
                                    )}
                                </Table.Td>
                                <Table.Td>
                                    <Text fz="xs" c="dimmed">
                                        {entry.ticketId ??
                                            t('roadmap.table.project')}
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
                                    <ItemPriority
                                        priority={entry.priority}
                                        withLabel
                                    />
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
                                            ? t('roadmap.details.ticketCount', {
                                                  count: entry.following,
                                              })
                                            : entry.type === 'ticket'
                                              ? t('roadmap.details.following')
                                              : entry.hasDirectNeed
                                                ? t('roadmap.interested')
                                                : ''}
                                    </Text>
                                    {entry.onOpenBoard && (
                                        <Button
                                            variant="subtle"
                                            size="compact-xs"
                                            onClick={entry.onOpenBoard}
                                            aria-label={t(
                                                'roadmap.openBoardFor',
                                                { title: entry.title },
                                            )}
                                        >
                                            {t('roadmap.details.openBoard')}
                                        </Button>
                                    )}
                                </Table.Td>
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    );
}

function BoardError({ roadmapUnreachable }: { roadmapUnreachable: boolean }) {
    const { t } = useTranslation('eeMisc');
    return (
        <Box p="xl" role="alert">
            <SuboptimalState
                icon={IconAlertCircle}
                title={
                    roadmapUnreachable
                        ? t('roadmap.error.unreachableTitle')
                        : t('roadmap.error.loadTitle')
                }
                description={
                    roadmapUnreachable
                        ? t('roadmap.error.unreachableDescription')
                        : t('roadmap.error.unavailable')
                }
                action={
                    roadmapUnreachable ? (
                        <Button
                            component="a"
                            variant="default"
                            href="https://docs.lightdash.com/self-host/customize-deployment/organization-roadmap#network-egress"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {t('roadmap.error.egressGuidance')}
                        </Button>
                    ) : undefined
                }
            />
        </Box>
    );
}

export function RoadmapProjects({
    cacheKey,
    canFollow,
}: {
    cacheKey: string;
    canFollow: boolean;
}) {
    const { t } = useTranslation('eeMisc');
    const { follow, submittedProjectIds, pendingProjectIds } =
        useFollowRoadmapProject(cacheKey);
    const [projectToFollow, setProjectToFollow] =
        useState<RoadmapProjectGroup | null>(null);
    const followAction = (
        group: RoadmapProjectGroup | null,
    ): FollowProjectAction => ({
        canFollow,
        isSubmitted:
            group !== null &&
            submittedProjectIds.includes(group.project.projectId),
        isLoading:
            group !== null &&
            pendingProjectIds.includes(group.project.projectId),
        onFollow: () => setProjectToFollow(group),
    });
    const { pathname } = useLocation();
    const [view, setView] = useState('board');
    const [itemTypes, setItemTypes] = useState<string[]>([]);
    const itemType = itemTypes.length === 1 ? itemTypes[0] : 'all';
    const [onlyInterested, setOnlyInterested] = useState<boolean | null>(null);
    const initializingInterest = onlyInterested === null;
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
    const [selectedProject, setSelectedProject] =
        useState<RoadmapProjectGroup | null>(null);
    const [projectDetailsSelection, setProjectDetails] =
        useState<RoadmapProjectGroup | null>(null);
    const selectedProjectId = selectedProject?.project.projectId ?? null;
    const [selectedTicket, setSelectedTicket] = useState<RoadmapItem | null>(
        null,
    );
    const projectBoard = selectedProjectId !== null;
    const showProjects = !projectBoard && itemType !== 'tickets';
    const showTickets = projectBoard || itemType !== 'projects';
    const projectQuery: RoadmapProjectQuery = {
        pageSize: ROADMAP_DEFAULT_PAGE_SIZE,
        search: initializingInterest ? '' : debouncedMainSearch,
        onlyInterested: onlyInterested ?? true,
        statuses: initializingInterest ? '' : statusQuery(mainStatuses),
        priorities: initializingInterest ? '' : mainPriorities.join(','),
    };
    const projectsQuery = useRoadmapProjects(
        projectQuery,
        cacheKey,
        initializingInterest || view === 'table',
    );
    useEffect(() => {
        const firstPage = projectsQuery.data?.pages[0];
        if (initializingInterest && firstPage) {
            setOnlyInterested(
                firstPage.pagination.totalResults > 0 ||
                    firstPage.otherRequestCount > 0,
            );
        }
    }, [initializingInterest, projectsQuery.data]);
    const requestQuery: RoadmapQuery = {
        projectId:
            selectedProjectId ?? (itemType === 'tickets' ? undefined : 'null'),
        statuses: statusQuery(
            selectedProjectId ? projectStatuses : mainStatuses,
        ),
        priorities: (selectedProjectId
            ? projectPriorities
            : mainPriorities
        ).join(','),
        pageSize: COLUMN_PREVIEW_LIMIT,
        search: selectedProjectId
            ? debouncedProjectSearch
            : debouncedMainSearch,
    };
    const ticketsQuery = useRoadmapRequests(
        requestQuery,
        cacheKey,
        view === 'table' &&
            !initializingInterest &&
            projectsQuery.isSuccess &&
            showTickets,
    );
    const boardQueries = useRoadmapBoard({
        projectQuery,
        requestQuery,
        cacheKey,
        showProjects,
        showTickets,
        enabled: view === 'board' && !initializingInterest,
        statuses: projectBoard ? projectStatuses : mainStatuses,
    });
    const projects = (
        view === 'board'
            ? boardQueries.flatMap(
                  (column) => column.projects.data?.pages ?? [],
              )
            : (projectsQuery.data?.pages ?? [])
    ).flatMap((page) => page.projects);
    const projectDetails =
        projects.find(
            (group) =>
                group.project.projectId ===
                projectDetailsSelection?.project.projectId,
        ) ?? projectDetailsSelection;
    const tickets = (
        view === 'board'
            ? boardQueries.flatMap((column) => column.tickets.data?.pages ?? [])
            : (ticketsQuery.data?.pages ?? [])
    ).flatMap((page) => page.data);
    const presentation = getProjectPresentation(
        selectedProject?.project ?? defaultProjectPresentation,
    );
    const statuses = projectBoard ? projectStatuses : mainStatuses;
    const priorities = projectBoard ? projectPriorities : mainPriorities;
    const setStatuses = projectBoard ? setProjectStatuses : setMainStatuses;
    const setPriorities = projectBoard
        ? setProjectPriorities
        : setMainPriorities;
    const hasFilters =
        (!projectBoard && itemTypes.length > 0) ||
        statuses.length > 0 ||
        priorities.length > 0 ||
        (projectBoard ? projectSearch : mainSearch) !== '';
    const clearFilters = () => {
        setStatuses([]);
        setPriorities([]);
        if (!projectBoard) setItemTypes([]);
        (projectBoard ? setProjectSearch : setMainSearch)('');
    };
    const loading =
        initializingInterest ||
        (view === 'board'
            ? boardQueries.some((column) => column.loading)
            : projectsQuery.isInitialLoading ||
              (showTickets && ticketsQuery.isInitialLoading));
    const projectErrors =
        initializingInterest || view === 'table'
            ? [projectsQuery.error]
            : boardQueries.map((column) => column.projectError);
    const requestErrors =
        initializingInterest || view === 'table'
            ? [showTickets ? ticketsQuery.error : null]
            : boardQueries.map((column) => column.requestError);
    const isForbidden = (error: (typeof projectErrors)[number]) =>
        error?.error?.statusCode === 403;
    const unavailable = projectErrors.some(isForbidden);
    const requestsForbidden = requestErrors.some(isForbidden);
    const failed =
        projectErrors.some(Boolean) ||
        requestErrors.some((error) => Boolean(error) && !isForbidden(error));
    const roadmapUnreachable = [...projectErrors, ...requestErrors].some(
        (error) =>
            error?.error?.name === 'UnexpectedServerError' &&
            error.error.data?.code === 'ROADMAP_UNREACHABLE',
    );
    const back = () => {
        setSelectedProject(null);
        setProjectSearch('');
        setSelectedTicket(null);
    };
    const openProjectBoard = (group: RoadmapProjectGroup) => {
        setProjectDetails(null);
        setSelectedProject(group);
        setProjectSearch('');
        setProjectStatuses([]);
        setProjectPriorities([]);
    };
    const entries: RoadmapEntry[] = [
        ...(showProjects
            ? projects.map((group): RoadmapEntry => {
                  const metadata = getProjectPresentation(group.project);
                  const onOpen = () => setProjectDetails(group);
                  const onOpenBoard =
                      group.ownRequestCount > 0
                          ? () => openProjectBoard(group)
                          : null;
                  return {
                      id: `project-${group.project.projectId}`,
                      title: group.project.title,
                      description: group.project.description,
                      type: 'project',
                      stage: customerStage(metadata.stage),
                      priority: metadata.priority,
                      progress: metadata.progress,
                      following: group.ownRequestCount,
                      slackThreadUrls: group.slackThreadUrls,
                      hasDirectNeed: group.hasDirectNeed,
                      onOpen,
                      onOpenBoard,
                      card: (
                          <ProjectCard
                              group={group}
                              followAction={followAction(group)}
                              presentation={metadata}
                              onClick={onOpen}
                              onOpenBoard={onOpenBoard}
                          />
                      ),
                  };
              })
            : []),
        ...(showTickets ? tickets : []).map(
            (ticket): RoadmapEntry => ({
                id: `ticket-${ticket.ticketId}`,
                title: ticket.title,
                description: null,
                type: 'ticket',
                stage: customerStage(ticketStage(ticket.status)),
                priority: ticket.priority,
                progress: null,
                following: null,
                slackThreadUrls: ticket.slackThreadUrls,
                ticketId: ticket.ticketId,
                onOpen: () => setSelectedTicket(ticket),
                onOpenBoard: null,
                card: (
                    <TicketCard
                        ticket={ticket}
                        onClick={() => setSelectedTicket(ticket)}
                    />
                ),
            }),
        ),
    ];
    const pagination = ((showProjects && projectsQuery.hasNextPage) ||
        (showTickets && ticketsQuery.hasNextPage)) && (
        <Group justify="center" gap="sm" className={classes.pagination}>
            {showProjects && projectsQuery.hasNextPage && (
                <Button
                    variant="default"
                    size="xs"
                    loading={projectsQuery.isFetchingNextPage}
                    onClick={() => void projectsQuery.fetchNextPage()}
                >
                    {t('roadmap.loadMoreProjects')}
                </Button>
            )}
            {showTickets && ticketsQuery.hasNextPage && (
                <Button
                    variant="default"
                    size="xs"
                    loading={ticketsQuery.isFetchingNextPage}
                    onClick={() => void ticketsQuery.fetchNextPage()}
                >
                    {t('roadmap.loadMoreTickets')}
                </Button>
            )}
        </Group>
    );
    return (
        <SettingsPage
            fillHeight
            title={
                projectBoard
                    ? !failed && selectedProject
                        ? selectedProject.project.title
                        : t('roadmap.page.projectBoard')
                    : t('roadmap.page.title')
            }
            breadcrumbs={
                projectBoard
                    ? [
                          {
                              title: t('roadmap.page.title'),
                              to: pathname,
                              onClick: back,
                          },
                      ]
                    : undefined
            }
            description={
                projectBoard
                    ? selectedProject?.project.description.trim() ||
                      t('roadmap.page.projectBoardDescription')
                    : t('roadmap.page.description')
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
                        tooltipLabel={t('roadmap.toolbar.searchTooltip')}
                        aria-label={
                            projectBoard
                                ? t('roadmap.toolbar.searchProjectTickets')
                                : t('roadmap.toolbar.searchRoadmap')
                        }
                        placeholder={
                            projectBoard
                                ? t('roadmap.toolbar.searchProjectTickets')
                                : t('roadmap.toolbar.searchRoadmap')
                        }
                        collapsedWidth={340}
                        expandedWidth={340}
                        value={projectBoard ? projectSearch : mainSearch}
                        onChange={
                            projectBoard ? setProjectSearch : setMainSearch
                        }
                    />
                    {!projectBoard && (
                        <SegmentedControl
                            aria-label={t('roadmap.toolbar.interest')}
                            size="xs"
                            disabled={initializingInterest}
                            value={
                                onlyInterested === false ? 'all' : 'following'
                            }
                            onChange={(value) =>
                                setOnlyInterested(value === 'following')
                            }
                            data={[
                                {
                                    value: 'following',
                                    label: t('roadmap.details.following'),
                                },
                                {
                                    value: 'all',
                                    label: t('roadmap.toolbar.all'),
                                },
                            ]}
                        />
                    )}
                    {!projectBoard && (
                        <FilterFacet
                            label={t('roadmap.toolbar.type')}
                            icon={IconFilter}
                            selected={itemTypes}
                            onChange={setItemTypes}
                            options={[
                                {
                                    value: 'projects',
                                    label: t('roadmap.toolbar.projects'),
                                },
                                {
                                    value: 'tickets',
                                    label: t('roadmap.toolbar.tickets'),
                                },
                            ]}
                            tooltipLabel={t('roadmap.toolbar.filterByType')}
                        />
                    )}
                    <FilterFacet
                        label={t('roadmap.details.status')}
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
                        tooltipLabel={t('roadmap.toolbar.filterByStatus')}
                    />
                    <FilterFacet
                        label={t('roadmap.details.priority')}
                        icon={IconFlag}
                        selected={priorities}
                        onChange={setPriorities}
                        options={Object.values(RoadmapItemPriority).map(
                            (priority) => ({
                                value: priority,
                                label: getRoadmapPriorityLabel(priority),
                            }),
                        )}
                        tooltipLabel={t('roadmap.toolbar.filterByPriority')}
                    />
                </Group>
                <Group gap="md" className={classes.viewControls}>
                    <SegmentedControl
                        aria-label={t('roadmap.toolbar.view')}
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
                                        {t('roadmap.toolbar.board')}
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
                                        {t('roadmap.toolbar.table')}
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
                        title={t('roadmap.page.notSetUpTitle')}
                        description={t('roadmap.page.notSetUpDescription')}
                    />
                </Box>
            ) : failed ? (
                <BoardError roadmapUnreachable={roadmapUnreachable} />
            ) : loading ? (
                <Box p="xl">
                    <EmptyStateLoader
                        title={
                            projectBoard
                                ? t('roadmap.page.loadingProjectTickets')
                                : t('roadmap.page.loading')
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
                                    ? hasFilters
                                        ? t('roadmap.empty.noMatchingTickets')
                                        : t('roadmap.empty.noFollowedTickets')
                                    : requestsForbidden && !showProjects
                                      ? t('roadmap.empty.noRequests')
                                      : hasFilters
                                        ? t('roadmap.empty.noMatchingItems')
                                        : t('roadmap.empty.noItems')
                            }
                            description={
                                projectBoard
                                    ? t('roadmap.empty.projectDescription')
                                    : requestsForbidden && !showProjects
                                      ? t('roadmap.empty.noRequestsDescription')
                                      : t('roadmap.empty.followDescription')
                            }
                            action={
                                hasFilters ? (
                                    <Button
                                        variant="default"
                                        onClick={clearFilters}
                                    >
                                        {t('roadmap.empty.clearFilters')}
                                    </Button>
                                ) : undefined
                            }
                        />
                    </Paper>
                </Box>
            ) : (
                <>
                    {requestsForbidden && showTickets && (
                        <Text fz="xs" c="dimmed" px="xl" pt="md">
                            {t('roadmap.empty.noRequestsDescription')}
                        </Text>
                    )}
                    {view === 'board' ? (
                        <Board
                            key={selectedProjectId ?? 'roadmap'}
                            entries={entries}
                            projectBoard={projectBoard}
                            statuses={statuses}
                            columnQueries={boardQueries}
                            projectStatusCounts={
                                selectedProject?.project.issueStatusCounts ??
                                null
                            }
                        />
                    ) : (
                        <RoadmapTable entries={entries} />
                    )}
                    {view === 'table' && pagination}
                </>
            )}
            <RoadmapProjectDetails
                followAction={followAction(projectDetails)}
                item={failed ? null : projectDetails}
                status={
                    columns.find(
                        (column) =>
                            column.id ===
                            customerStage(
                                projectDetails?.project.stage ?? 'planned',
                            ),
                    )!
                }
                onClose={() => setProjectDetails(null)}
                onOpenBoard={
                    projectDetails && projectDetails.ownRequestCount > 0
                        ? () => openProjectBoard(projectDetails)
                        : null
                }
            />
            <RoadmapRequestDetails
                item={failed ? null : selectedTicket}
                onClose={() => setSelectedTicket(null)}
            />
            {!failed && projectToFollow && (
                <FollowProjectModal
                    key={projectToFollow.project.projectId}
                    projectTitle={projectToFollow.project.title}
                    isLoading={pendingProjectIds.includes(
                        projectToFollow.project.projectId,
                    )}
                    onSubmit={(note) =>
                        follow({
                            projectId: projectToFollow.project.projectId,
                            note,
                        })
                    }
                    onClose={() => setProjectToFollow(null)}
                />
            )}
        </SettingsPage>
    );
}
