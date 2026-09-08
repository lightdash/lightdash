import { type RoadmapItem, type RoadmapProjectGroup } from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Drawer,
    Group,
    Pagination,
    Paper,
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
    IconArrowRight,
    IconCircleDashed,
    IconCircleDotted,
    IconCircleHalf2,
    IconPlayerPause,
    IconMessageCircle2,
    IconRoad,
    IconSearch,
    IconStack2,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { getStatusColor } from '../../pages/roadmapUtils';
import classes from './RoadmapProjects.module.css';
import { RoadmapRequestDetails } from './RoadmapRequestDetails';
import {
    useRoadmapExpiry,
    useRoadmapProjects,
    useRoadmapRequests,
} from './useRoadmapProjects';

export type RoadmapBoardStage = 'backlog' | 'planned' | 'started' | 'paused';
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
] as const;
function RequestGroup({
    groupId,
    search,
    cacheKey,
    onSelect,
}: {
    groupId: string;
    search: string;
    cacheKey: string;
    onSelect: (item: RoadmapItem) => void;
}) {
    const [page, setPage] = useState(1);
    const query = useRoadmapRequests(
        { groupId, search, page, pageSize: 10 },
        cacheKey,
        true,
    );
    const expired = useRoadmapExpiry(query.data?.expiresAt);
    const { refetch } = query;
    useEffect(() => {
        if (expired) void refetch();
    }, [expired, refetch]);
    if (query.isInitialLoading || (expired && query.isFetching))
        return <EmptyStateLoader title="Loading your requests" />;
    if (query.isError || expired)
        return (
            <Stack gap="sm">
                <Text fz="sm">Could not load your requests.</Text>
                <Button
                    variant="default"
                    size="xs"
                    onClick={() => void query.refetch()}
                >
                    Try again
                </Button>
            </Stack>
        );
    if (!query.data?.requests.length)
        return (
            <Text fz="sm" c="dimmed">
                {search
                    ? 'No matching requests from your organization.'
                    : 'No requests from your organization are linked to this project.'}
            </Text>
        );
    return (
        <Stack gap="xs">
            {query.data.requests.map(({ request }) => (
                <UnstyledButton
                    key={request.ticketId}
                    className={classes.request}
                    onClick={() => onSelect(request)}
                >
                    <Group justify="space-between" wrap="wrap" gap="sm">
                        <Text fz="sm">{request.title}</Text>
                        <Group gap="sm">
                            <Text fz="xs" c="dimmed">
                                {request.ticketId}
                            </Text>
                            <Badge
                                size="sm"
                                color={
                                    getStatusColor(request.status) === 'ldGray'
                                        ? 'gray'
                                        : getStatusColor(request.status)
                                }
                            >
                                {request.status}
                            </Badge>
                        </Group>
                    </Group>
                </UnstyledButton>
            ))}
            {query.data.pagination.totalPages > 1 && (
                <Pagination
                    size="sm"
                    value={page}
                    onChange={setPage}
                    total={query.data.pagination.totalPages}
                    aria-label="Request pages"
                />
            )}
        </Stack>
    );
}

function ProjectCard({
    group,
    onClick,
}: {
    group: RoadmapProjectGroup;
    onClick: () => void;
}) {
    return (
        <UnstyledButton
            className={classes.projectCard}
            onClick={onClick}
            aria-label={`Open ${group.project.title}`}
        >
            <Text className={classes.projectTitle}>{group.project.title}</Text>
            <Group
                justify="space-between"
                gap="xs"
                className={classes.cardFooter}
            >
                {group.ownRequestCount > 0 ? (
                    <Group gap={4}>
                        <MantineIcon
                            icon={IconMessageCircle2}
                            size="sm"
                            color="dimmed"
                        />
                        <Text fz="xs" c="dimmed">
                            {group.ownRequestCount} of your requests
                        </Text>
                    </Group>
                ) : (
                    <Text fz="xs" c="dimmed">
                        {group.hasDirectNeed
                            ? 'Your organization is interested'
                            : 'Shared project'}
                    </Text>
                )}
                {group.hasDirectNeed && group.ownRequestCount > 0 && (
                    <Badge size="xs" variant="light">
                        Requested
                    </Badge>
                )}
            </Group>
        </UnstyledButton>
    );
}

export function RoadmapProjects({
    cacheKey,
    projectStages,
    showDesignPartnerPreview = false,
}: {
    cacheKey: string;
    projectStages: Record<string, RoadmapBoardStage>;
    showDesignPartnerPreview?: boolean;
}) {
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search.trim(), 300);
    const [page, setPage] = useState(1);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [selected, setSelected] = useState<RoadmapItem | null>(null);
    const [interestProject, setInterestProject] = useState<string | null>(null);
    const query = useRoadmapProjects(
        { page, pageSize: 10, search: debouncedSearch },
        cacheKey,
    );
    const expired = useRoadmapExpiry(query.data?.expiresAt);
    const { refetch } = query;
    useEffect(() => {
        if (expired) {
            setSelected(null);
            setSelectedGroupId(null);
            void refetch();
        }
    }, [expired, refetch]);
    const data = expired ? undefined : query.data;
    const unavailable = query.error?.error?.statusCode === 403;
    const loading = query.isInitialLoading || (expired && query.isFetching);
    const selectedGroup = data?.projects.find(
        (group) => group.project.projectId === selectedGroupId,
    );
    const selectedColumn = columns.find(
        (column) =>
            column.id === (projectStages[selectedGroupId ?? ''] ?? 'backlog'),
    );
    const closeGroup = () => {
        setSelectedGroupId(null);
        setInterestProject(null);
    };
    return (
        <Stack className={classes.page} gap={0}>
            <Group
                className={classes.pageHeader}
                justify="space-between"
                gap="md"
            >
                <Group gap="sm">
                    <ThemeIcon variant="default" size="lg">
                        <MantineIcon icon={IconRoad} />
                    </ThemeIcon>
                    <Title order={4}>Roadmap</Title>
                    <Badge size="sm" variant="light">
                        Preview
                    </Badge>
                </Group>
                <Text fz="sm" c="dimmed">
                    Built with our customers
                </Text>
            </Group>
            <Group
                className={classes.boardToolbar}
                justify="space-between"
                gap="sm"
            >
                <Group gap="lg">
                    <Group gap="xs">
                        <MantineIcon
                            icon={IconStack2}
                            size="sm"
                            color="dimmed"
                        />
                        <Text fz="sm" fw={500}>
                            Projects
                        </Text>
                        {data && (
                            <Text c="dimmed" fz="xs">
                                {data.pagination.totalResults}
                            </Text>
                        )}
                    </Group>
                    <Text fz="xs" c="dimmed">
                        Explore the roadmap. See where your requests fit.
                    </Text>
                </Group>
                <TextInput
                    className={classes.search}
                    size="xs"
                    aria-label="Search roadmap"
                    placeholder="Search projects or your requests…"
                    leftSection={<MantineIcon icon={IconSearch} size="sm" />}
                    value={search}
                    onChange={(event) => {
                        setSearch(event.currentTarget.value);
                        setPage(1);
                        closeGroup();
                    }}
                />
            </Group>
            {loading ? (
                <Box p="xl">
                    <EmptyStateLoader title="Loading roadmap" />
                </Box>
            ) : unavailable ? (
                <Box p="xl">
                    <SuboptimalState
                        icon={IconRoad}
                        title="Your roadmap isn't set up yet"
                        description="Reach out to your Lightdash contact to get it switched on."
                    />
                </Box>
            ) : query.isError || expired ? (
                <Box p="xl">
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title="Could not load the roadmap"
                        description="We couldn't refresh the project list. Please try again."
                        action={
                            <Button
                                variant="default"
                                onClick={() => void refetch()}
                            >
                                Try again
                            </Button>
                        }
                    />
                </Box>
            ) : (
                data && (
                    <>
                        {!data.projects.length && !data.otherRequestCount ? (
                            <Box p="xl">
                                <Paper variant="dotted" p="xl">
                                    <SuboptimalState
                                        icon={search ? IconSearch : IconRoad}
                                        title={
                                            search
                                                ? 'No matching projects or requests'
                                                : 'No roadmap projects yet'
                                        }
                                        description={
                                            search
                                                ? 'Try another search or clear it to see all projects.'
                                                : 'Projects will appear here as customer requests are connected to our roadmap.'
                                        }
                                        action={
                                            search ? (
                                                <Button
                                                    variant="default"
                                                    onClick={() => {
                                                        setSearch('');
                                                        setPage(1);
                                                    }}
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
                                <Box className={classes.board}>
                                    {columns.map((column) => {
                                        const groups = data.projects.filter(
                                            (group) =>
                                                (projectStages[
                                                    group.project.projectId
                                                ] ?? 'backlog') === column.id,
                                        );
                                        return (
                                            <section
                                                className={classes.column}
                                                key={column.id}
                                                aria-label={`${column.label} projects`}
                                            >
                                                <Group
                                                    className={
                                                        classes.columnHeader
                                                    }
                                                    gap="xs"
                                                >
                                                    <MantineIcon
                                                        icon={column.icon}
                                                        size="sm"
                                                        color={column.color}
                                                    />
                                                    <Text fz="sm" fw={500}>
                                                        {column.label}
                                                    </Text>
                                                    <Text fz="xs" c="dimmed">
                                                        {groups.length}
                                                    </Text>
                                                </Group>
                                                <Stack
                                                    gap="sm"
                                                    className={
                                                        classes.columnCards
                                                    }
                                                >
                                                    {groups.map((group) => (
                                                        <ProjectCard
                                                            key={
                                                                group.project
                                                                    .projectId
                                                            }
                                                            group={group}
                                                            onClick={() =>
                                                                setSelectedGroupId(
                                                                    group
                                                                        .project
                                                                        .projectId,
                                                                )
                                                            }
                                                        />
                                                    ))}
                                                    {!groups.length && (
                                                        <Text
                                                            className={
                                                                classes.emptyColumn
                                                            }
                                                            fz="xs"
                                                            c="dimmed"
                                                        >
                                                            No projects
                                                        </Text>
                                                    )}
                                                </Stack>
                                            </section>
                                        );
                                    })}
                                </Box>
                                {data.otherRequestCount > 0 &&
                                    page >=
                                        Math.max(
                                            1,
                                            data.pagination.totalPages,
                                        ) && (
                                        <Box className={classes.otherSection}>
                                            <UnstyledButton
                                                className={
                                                    classes.otherRequests
                                                }
                                                onClick={() =>
                                                    setSelectedGroupId('other')
                                                }
                                            >
                                                <Group
                                                    justify="space-between"
                                                    gap="sm"
                                                >
                                                    <Group gap="sm">
                                                        <MantineIcon
                                                            icon={
                                                                IconMessageCircle2
                                                            }
                                                            color="dimmed"
                                                        />
                                                        <Stack gap={4}>
                                                            <Group gap="xs">
                                                                <Text
                                                                    fz="sm"
                                                                    fw={500}
                                                                >
                                                                    Other
                                                                    requests
                                                                </Text>
                                                                <Badge
                                                                    size="xs"
                                                                    variant="light"
                                                                >
                                                                    {
                                                                        data.otherRequestCount
                                                                    }
                                                                </Badge>
                                                            </Group>
                                                            <Text
                                                                fz="xs"
                                                                c="dimmed"
                                                            >
                                                                Your requests
                                                                that aren't
                                                                linked to a
                                                                roadmap project.
                                                            </Text>
                                                        </Stack>
                                                    </Group>
                                                    <MantineIcon
                                                        icon={IconArrowRight}
                                                        color="dimmed"
                                                    />
                                                </Group>
                                            </UnstyledButton>
                                        </Box>
                                    )}
                            </>
                        )}
                        {data.pagination.totalPages > 1 && (
                            <Group justify="center" p="md">
                                <Pagination
                                    value={page}
                                    total={data.pagination.totalPages}
                                    onChange={(value) => {
                                        setPage(value);
                                        closeGroup();
                                    }}
                                    aria-label="Project pages"
                                />
                            </Group>
                        )}
                    </>
                )
            )}
            <Drawer
                opened={
                    !expired &&
                    (selectedGroup !== undefined ||
                        (selectedGroupId === 'other' &&
                            !!data?.otherRequestCount))
                }
                onClose={closeGroup}
                position="right"
                size="lg"
                closeButtonProps={{ 'aria-label': 'Close project' }}
                title={
                    selectedGroupId === 'other' ? 'Other requests' : 'Project'
                }
            >
                {(selectedGroup || selectedGroupId === 'other') && (
                    <Stack gap="xl">
                        <Stack gap="md">
                            <Title order={3}>
                                {selectedGroup?.project.title ??
                                    'Other requests'}
                            </Title>
                            {selectedGroup && selectedColumn && (
                                <Group gap="xs">
                                    <MantineIcon
                                        icon={selectedColumn.icon}
                                        color={selectedColumn.color}
                                        size="sm"
                                    />
                                    <Text fz="sm" c="dimmed">
                                        {selectedColumn.label}
                                    </Text>
                                </Group>
                            )}
                            {selectedGroup?.hasDirectNeed && (
                                <Paper variant="dotted" p="md">
                                    <Text fz="sm">
                                        Your organization has requested this
                                        project.
                                    </Text>
                                </Paper>
                            )}
                        </Stack>
                        <Stack gap="sm">
                            <Group justify="space-between">
                                <Text fz="sm" fw={500}>
                                    Your organization's requests
                                </Text>
                                <Badge variant="light" size="sm">
                                    {selectedGroup?.ownRequestCount ??
                                        data?.otherRequestCount ??
                                        0}
                                </Badge>
                            </Group>
                            <Text fz="xs" c="dimmed">
                                Only requests from your organization are shown
                                here.
                            </Text>
                            {selectedGroupId && (
                                <RequestGroup
                                    key={`${selectedGroupId}:${debouncedSearch}`}
                                    groupId={selectedGroupId}
                                    search={debouncedSearch}
                                    cacheKey={cacheKey}
                                    onSelect={setSelected}
                                />
                            )}
                        </Stack>
                        {showDesignPartnerPreview && selectedGroup && (
                            <Paper p="md">
                                <Stack gap="sm">
                                    <Text fz="sm" fw={500}>
                                        Help shape this project
                                    </Text>
                                    <Text fz="sm" c="dimmed">
                                        Work with the Lightdash team to share
                                        feedback and try new capabilities early.
                                    </Text>
                                    <Group>
                                        <Button
                                            size="sm"
                                            variant="default"
                                            onClick={() =>
                                                setInterestProject(
                                                    selectedGroup.project
                                                        .projectId,
                                                )
                                            }
                                        >
                                            Become a design partner
                                        </Button>
                                    </Group>
                                    {interestProject ===
                                        selectedGroup.project.projectId && (
                                        <Text fz="xs" c="dimmed" role="status">
                                            Preview only — no interest has been
                                            submitted.
                                        </Text>
                                    )}
                                </Stack>
                            </Paper>
                        )}
                    </Stack>
                )}
            </Drawer>
            <RoadmapRequestDetails
                item={selected}
                onClose={() => setSelected(null)}
            />
        </Stack>
    );
}
