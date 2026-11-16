import { DEFAULT_ANALYTICS_ADOPTION_TEAM_CONFIG } from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Group,
    Menu,
    MultiSelect,
    Pagination,
    Paper,
    ScrollArea,
    SegmentedControl,
    Skeleton,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import classes from './AnalyticsAdoption.module.css';
import {
    ADOPTION_ROW_LIMIT,
    UNGROUPED,
    adoptionActivityQuery,
    adoptionFeatures,
    adoptionGrowth,
    adoptionMembershipQuery,
    adoptionRecency,
    adoptionRoles,
    summarizeAdoption,
    withAdoptionMembers,
} from './analyticsAdoptionData';
import {
    AnalyticsAdoptionDetails,
    type AdoptionColorMode,
} from './AnalyticsAdoptionDetails';
import {
    AnalyticsAdoptionTeams,
    useAnalyticsAdoptionTeams,
} from './AnalyticsAdoptionTeams';
import { formatAnalyticsNumber } from './analyticsOverviewConfig';
import { useAnalyticsQueries } from './useAnalyticsOverviewQuery';

const PAGE_SIZE = 12;
const MAX_MARKS_PER_GROUP = 100;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const countLabel = (count: number) =>
    `${formatAnalyticsNumber(count)} ${count === 1 ? 'member' : 'members'}`;
const categoryLegend = (
    categories: readonly { label: string; color: string }[],
) =>
    categories.map(({ label, color }) => ({
        label,
        color: `var(--mantine-color-${color}-filled)`,
    }));

const legends = {
    role: categoryLegend(adoptionRoles),
    recency: categoryLegend(adoptionRecency),
    growth: categoryLegend(adoptionGrowth),
};

const modes = [
    { label: 'Features', value: 'features' },
    { label: 'Recency', value: 'recency' },
    { label: 'Role', value: 'role' },
    { label: 'Growth', value: 'growth' },
] as const;

type ColorMode = AdoptionColorMode;
type Layout = 'map' | 'waffle';

const featureColor = (count: number, max: number) =>
    count === 0
        ? 'var(--mantine-color-default-border)'
        : `color-mix(in srgb, var(--mantine-primary-color-filled) ${25 + (75 * count) / Math.max(1, max)}%, var(--mantine-color-body))`;

const GroupMap = ({
    name,
    total,
    counts,
    colors,
    max,
    layout,
    zoom,
    onOpen,
}: {
    name: string;
    total: number;
    counts: number[];
    colors: string[];
    max: number;
    layout: Layout;
    zoom: number;
    onOpen: (() => void) | null;
}) => {
    const marks = Math.min(total, MAX_MARKS_PER_GROUP);
    const radius = Math.max(28, 90 * Math.sqrt(total / max));
    const dotRadius = Math.min(8, (radius / Math.sqrt(marks)) * 0.66);
    const marksRadius = radius - dotRadius - 5;
    const columns = Math.ceil(Math.sqrt(marks));
    const rows = Math.ceil(marks / columns);
    const square = Math.min(26, 162 / columns);
    let bucket = 0;
    let end = counts[0];
    const graphic = (
        <Stack align="center" gap={4}>
            <svg
                viewBox="0 0 200 200"
                className={classes.circle}
                aria-hidden="true"
            >
                {layout === 'map' && (
                    <circle
                        cx={100}
                        cy={100}
                        r={radius}
                        fill="var(--mantine-color-default)"
                        stroke="var(--mantine-color-default-border)"
                    />
                )}
                {Array.from({ length: marks }, (_, index) => {
                    const member = ((index + 0.5) * total) / marks;
                    while (member >= end && bucket < counts.length - 1) {
                        bucket += 1;
                        end += counts[bucket];
                    }
                    if (layout === 'waffle') {
                        return (
                            <rect
                                key={index}
                                x={
                                    100 +
                                    ((index % columns) - columns / 2) * square
                                }
                                y={
                                    100 +
                                    (Math.floor(index / columns) - rows / 2) *
                                        square
                                }
                                width={square - 2}
                                height={square - 2}
                                rx={2}
                                fill={colors[bucket]}
                            />
                        );
                    }
                    const distance =
                        marks === 1
                            ? 0
                            : marksRadius * Math.sqrt((index + 0.5) / marks);
                    const angle = GOLDEN_ANGLE * index;
                    return (
                        <circle
                            key={index}
                            cx={100 + distance * Math.cos(angle)}
                            cy={100 + distance * Math.sin(angle)}
                            r={dotRadius}
                            fill={colors[bucket]}
                        />
                    );
                })}
            </svg>
            <Text fw={600} size="sm" ta="center" className={classes.groupLabel}>
                {name}
            </Text>
            <Text c="dimmed" size="xs">
                {countLabel(total)}
            </Text>
        </Stack>
    );
    const width = 200 * zoom;
    return onOpen ? (
        <UnstyledButton
            w={width}
            maw="100%"
            className={classes.groupButton}
            aria-label={`Open ${name} · ${countLabel(total)}`}
            onClick={onOpen}
        >
            {graphic}
        </UnstyledButton>
    ) : (
        <Box w={width} maw="100%">
            {graphic}
        </Box>
    );
};

const AnalyticsAdoption = ({ projectUuid }: { projectUuid: string }) => {
    const teams = useAnalyticsAdoptionTeams(projectUuid);
    const config = teams.data ?? DEFAULT_ANALYTICS_ADOPTION_TEAM_CONFIG;
    const [editTeams, setEditTeams] = useState(false);
    const [membership] = useAnalyticsQueries(
        projectUuid,
        [withAdoptionMembers(adoptionMembershipQuery, config)],
        !teams.isLoading,
    );
    const [activity] = useAnalyticsQueries(
        projectUuid,
        [withAdoptionMembers(adoptionActivityQuery, config)],
        membership.isSuccess &&
            membership.data.length > 0 &&
            membership.data.length < ADOPTION_ROW_LIMIT,
    );
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [preferredColor, setPreferredColor] = useState<ColorMode>('features');
    const [layout, setLayout] = useState<Layout>('map');
    const [featureFilter, setFeatureFilter] = useState<string[]>([
        ...adoptionFeatures,
    ]);
    const [focusedGroup, setFocusedGroup] = useState<string | null>(null);
    const [hideUngrouped, setHideUngrouped] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [page, setPage] = useState(1);
    const members = useMemo(
        () =>
            summarizeAdoption(
                membership.data ?? [],
                adoptionMembershipQuery.exploreName,
                undefined,
                config,
            ),
        [membership.data, config],
    );
    const featureData = useMemo(
        () =>
            activity.data?.length && activity.data.length < ADOPTION_ROW_LIMIT
                ? summarizeAdoption(
                      activity.data,
                      adoptionActivityQuery.exploreName,
                      new Set(featureFilter),
                      config,
                  )
                : null,
        [activity.data, featureFilter, config],
    );

    if (membership.isLoading)
        return <Skeleton h={320} aria-label="Loading adoption map" />;
    if (membership.isError)
        return (
            <Alert
                color="red"
                title="Could not load organization membership."
            />
        );
    if (membership.data.length >= ADOPTION_ROW_LIMIT)
        return (
            <Alert
                color="yellow"
                title="There are too many group combinations to draw a complete map."
            />
        );
    if (members.overall.total === 0)
        return <Text c="dimmed">No current members found.</Text>;

    const color: ColorMode = featureData ? preferredColor : 'role';
    const data = color !== 'role' && featureData ? featureData : members;
    const selectedTeams = selectedGroups.filter((id) =>
        members.groups.some((team) => team.id === id),
    );
    const availableGroups = data.groups.filter(
        ({ id }) =>
            (!hideUngrouped || id !== UNGROUPED) &&
            (selectedTeams.length === 0 || selectedTeams.includes(id)),
    );
    const focused = availableGroups.find(({ id }) => id === focusedGroup);
    const groups = focused ? [focused] : availableGroups;
    const pages = Math.ceil(groups.length / PAGE_SIZE);
    const currentPage = Math.min(page, Math.max(pages, 1));
    const visibleGroups = groups.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
    );
    const max = groups[0]?.total ?? 1;
    const featureColors = Array.from(
        { length: featureFilter.length + 1 },
        (_, index) => featureColor(index, featureFilter.length),
    );
    const colors =
        color === 'features'
            ? featureColors
            : legends[color].map(({ color: swatch }) => swatch);
    const legend =
        color !== 'features'
            ? legends[color]
            : [
                  {
                      label: 'No selected features used',
                      color: featureColors[0],
                  },
                  ...(featureFilter.length > 0
                      ? [
                            {
                                label: 'Fewer selected features',
                                color: featureColors[1],
                            },
                        ]
                      : []),
                  ...(featureFilter.length > 1
                      ? [
                            {
                                label: 'More selected features',
                                color: featureColors[featureFilter.length],
                            },
                        ]
                      : []),
              ];

    return (
        <Stack gap="md">
            <Group justify="space-between" align="flex-end">
                <Box>
                    <Text fw={600}>
                        {countLabel(members.overall.total)} across the
                        organization
                    </Text>
                    <Text c="dimmed" size="sm">
                        Feature usage covers the last 30 complete days across
                        all projects.
                    </Text>
                </Box>
                <Button
                    variant="default"
                    size="xs"
                    disabled={!teams.isSuccess}
                    onClick={() => setEditTeams(true)}
                >
                    Configure teams
                </Button>
            </Group>
            <Paper
                component="section"
                withBorder
                p="md"
                aria-label="Adoption map"
            >
                <Stack gap="md">
                    <Group justify="space-between" align="center">
                        <Group gap={6} aria-label="Team in view">
                            {focused ? (
                                <>
                                    <Button
                                        variant="subtle"
                                        size="compact-xs"
                                        onClick={() => {
                                            setFocusedGroup(null);
                                            setZoom(1);
                                        }}
                                    >
                                        All teams
                                    </Button>
                                    <Text
                                        c="dimmed"
                                        size="xs"
                                        aria-hidden="true"
                                    >
                                        ›
                                    </Text>
                                    <Text fw={600} size="sm">
                                        {focused.name}
                                    </Text>
                                </>
                            ) : (
                                <Text fw={600} size="sm">
                                    All teams
                                </Text>
                            )}
                        </Group>
                        <Group gap="xs" align="center">
                            <MultiSelect
                                size="xs"
                                maw={220}
                                aria-label="Teams shown on the adoption map"
                                placeholder={
                                    config.teams ? 'All teams' : 'All groups'
                                }
                                clearable
                                searchable
                                data={members.groups
                                    .filter(
                                        ({ id }) =>
                                            !hideUngrouped || id !== UNGROUPED,
                                    )
                                    .map(({ id, name }) => ({
                                        value: id,
                                        label: name,
                                    }))}
                                value={selectedTeams}
                                onChange={(next) => {
                                    setSelectedGroups(next);
                                    setFocusedGroup(null);
                                    setPage(1);
                                }}
                            />
                            <SegmentedControl
                                size="xs"
                                aria-label="Layout"
                                value={layout}
                                onChange={(next) => {
                                    setLayout(
                                        next === 'waffle' ? 'waffle' : 'map',
                                    );
                                    setZoom(1);
                                }}
                                data={[
                                    { label: 'Map', value: 'map' },
                                    { label: 'Waffle', value: 'waffle' },
                                ]}
                            />
                            <SegmentedControl
                                size="xs"
                                aria-label="Color adoption map by"
                                value={color}
                                onChange={(next) => {
                                    const mode = modes.find(
                                        ({ value }) => value === next,
                                    );
                                    if (mode) setPreferredColor(mode.value);
                                }}
                                data={modes.map((mode) => ({
                                    ...mode,
                                    disabled:
                                        mode.value !== 'role' && !featureData,
                                }))}
                            />
                            <Menu
                                closeOnItemClick={false}
                                position="bottom-end"
                            >
                                <Menu.Target>
                                    <Button
                                        size="compact-xs"
                                        variant="default"
                                        disabled={!featureData}
                                    >
                                        Choose features
                                    </Button>
                                </Menu.Target>
                                <Menu.Dropdown p="sm">
                                    <Checkbox.Group
                                        value={featureFilter}
                                        onChange={(next) => {
                                            setFeatureFilter(next);
                                            setPreferredColor('features');
                                        }}
                                    >
                                        <Stack gap="xs">
                                            {adoptionFeatures.map((feature) => (
                                                <Checkbox
                                                    key={feature}
                                                    value={feature}
                                                    label={feature}
                                                    size="xs"
                                                />
                                            ))}
                                        </Stack>
                                    </Checkbox.Group>
                                    <Group gap="xs" mt="sm">
                                        <Button
                                            variant="subtle"
                                            size="compact-xs"
                                            onClick={() => {
                                                setFeatureFilter([
                                                    ...adoptionFeatures,
                                                ]);
                                                setPreferredColor('features');
                                            }}
                                        >
                                            Choose all
                                        </Button>
                                        <Button
                                            variant="subtle"
                                            size="compact-xs"
                                            onClick={() => {
                                                setFeatureFilter([]);
                                                setPreferredColor('features');
                                            }}
                                        >
                                            Clear all
                                        </Button>
                                    </Group>
                                </Menu.Dropdown>
                            </Menu>
                            <Menu
                                closeOnItemClick={false}
                                position="bottom-end"
                            >
                                <Menu.Target>
                                    <Button size="compact-xs" variant="default">
                                        Options
                                    </Button>
                                </Menu.Target>
                                <Menu.Dropdown p="sm">
                                    <Checkbox
                                        size="xs"
                                        label={
                                            config.teams
                                                ? 'Hide people without a team'
                                                : 'Hide people not in a group'
                                        }
                                        checked={hideUngrouped}
                                        disabled={
                                            !members.groups.some(
                                                ({ id }) => id === UNGROUPED,
                                            )
                                        }
                                        onChange={(event) => {
                                            const checked =
                                                event.currentTarget.checked;
                                            if (checked)
                                                setSelectedGroups((selected) =>
                                                    selected.filter(
                                                        (id) =>
                                                            id !== UNGROUPED,
                                                    ),
                                                );
                                            setHideUngrouped(checked);
                                            setPage(1);
                                        }}
                                    />
                                </Menu.Dropdown>
                            </Menu>
                        </Group>
                    </Group>
                    {!featureData && (
                        <Text size="sm" c="dimmed" role="status">
                            {activity.isError
                                ? 'Feature usage could not be loaded. The map shows member roles.'
                                : activity.isLoading
                                  ? 'Loading feature usage. The map shows member roles.'
                                  : 'Feature usage is unavailable. The map shows member roles.'}
                        </Text>
                    )}
                    <ScrollArea.Autosize
                        mah={560}
                        className={classes.mapCanvas}
                    >
                        {visibleGroups.length === 0 ? (
                            <Text py="xl" ta="center" c="dimmed" size="sm">
                                No members match these groups.
                            </Text>
                        ) : (
                            <Group
                                justify="center"
                                align="flex-start"
                                gap="md"
                                py="md"
                            >
                                {visibleGroups.map((group) => (
                                    <GroupMap
                                        key={group.id}
                                        name={group.name}
                                        total={group.total}
                                        counts={
                                            color === 'features'
                                                ? group.featuresPerPerson
                                                : color === 'role'
                                                  ? group.roles
                                                  : group[color]
                                        }
                                        colors={colors}
                                        max={max}
                                        layout={layout}
                                        zoom={zoom}
                                        onOpen={
                                            focused
                                                ? null
                                                : () => {
                                                      setFocusedGroup(group.id);
                                                      setZoom(1);
                                                  }
                                        }
                                    />
                                ))}
                            </Group>
                        )}
                    </ScrollArea.Autosize>
                    {layout === 'map' && visibleGroups.length > 0 && (
                        <Group gap={4} aria-label="Map zoom">
                            <Button
                                variant="default"
                                size="compact-xs"
                                aria-label="Zoom in"
                                disabled={zoom >= 2}
                                onClick={() =>
                                    setZoom((value) =>
                                        Math.min(2, value + 0.25),
                                    )
                                }
                            >
                                +
                            </Button>
                            <Button
                                variant="default"
                                size="compact-xs"
                                aria-label="Zoom out"
                                disabled={zoom <= 0.75}
                                onClick={() =>
                                    setZoom((value) =>
                                        Math.max(0.75, value - 0.25),
                                    )
                                }
                            >
                                −
                            </Button>
                            <Button
                                variant="default"
                                size="compact-xs"
                                disabled={zoom === 1}
                                onClick={() => setZoom(1)}
                            >
                                Reset view
                            </Button>
                        </Group>
                    )}
                    {color === 'growth' && (
                        <Text size="xs" c="dimmed">
                            Compares feature usage in the last 28 complete days
                            with the previous 28 days.
                        </Text>
                    )}
                    {pages > 1 && (
                        <Pagination
                            total={pages}
                            value={currentPage}
                            onChange={setPage}
                        />
                    )}
                    <Group gap="sm" aria-label="Map legend">
                        {legend.map(({ label, color: swatch }) => (
                            <Group key={label} gap={5} wrap="nowrap">
                                <span
                                    className={classes.legendDot}
                                    style={{ background: swatch }}
                                />
                                <Text size="xs" c="dimmed">
                                    {label}
                                </Text>
                            </Group>
                        ))}
                    </Group>
                    <Text size="xs" c="dimmed">
                        People can belong to more than one group. Larger groups
                        use one mark for several members.
                    </Text>
                </Stack>
            </Paper>
            <AnalyticsAdoptionDetails
                mode={preferredColor}
                data={preferredColor === 'role' ? members : featureData}
                teams={
                    preferredColor === 'role' || featureData
                        ? visibleGroups
                        : []
                }
                includeOverall={
                    !focused && selectedTeams.length === 0 && !hideUngrouped
                }
                loading={preferredColor !== 'role' && activity.isLoading}
            />
            {teams.isError && (
                <Alert color="yellow">
                    Saved teams could not be loaded. Showing organization
                    groups.
                    <Button
                        variant="subtle"
                        size="compact-xs"
                        onClick={() => void teams.refetch()}
                    >
                        Retry
                    </Button>
                </Alert>
            )}
            {editTeams && (
                <AnalyticsAdoptionTeams
                    projectUuid={projectUuid}
                    config={config}
                    groups={summarizeAdoption(
                        membership.data,
                        adoptionMembershipQuery.exploreName,
                    )
                        .groups.filter(({ id }) => id !== UNGROUPED)
                        .map(({ id, name }) => ({ value: id, label: name }))}
                    onClose={() => setEditTeams(false)}
                />
            )}
        </Stack>
    );
};

export default AnalyticsAdoption;
