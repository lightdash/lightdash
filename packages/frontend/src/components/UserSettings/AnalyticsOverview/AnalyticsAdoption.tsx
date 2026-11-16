import {
    Alert,
    Box,
    Group,
    MultiSelect,
    Pagination,
    Paper,
    ScrollArea,
    SegmentedControl,
    SimpleGrid,
    Skeleton,
    Stack,
    Table,
    Text,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import classes from './AnalyticsAdoption.module.css';
import {
    ADOPTION_ROW_LIMIT,
    adoptionActivityQuery,
    adoptionFeatures,
    adoptionMembershipQuery,
    adoptionRoles,
    summarizeAdoption,
} from './analyticsAdoptionData';
import { formatAnalyticsNumber } from './analyticsOverviewConfig';
import { useAnalyticsQueries } from './useAnalyticsOverviewQuery';

const PAGE_SIZE = 12;
const MAX_MARKS_PER_GROUP = 100;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const countLabel = (count: number) =>
    `${formatAnalyticsNumber(count)} ${count === 1 ? 'member' : 'members'}`;
const roleColors = adoptionRoles.map(
    ({ color }) => `var(--mantine-color-${color}-filled)`,
);
const featureColor = (count: number) =>
    count === 0
        ? 'var(--mantine-color-default-border)'
        : `color-mix(in srgb, var(--mantine-primary-color-filled) ${25 + (75 * count) / adoptionFeatures.length}%, var(--mantine-color-body))`;
const featureColors = Array.from(
    { length: adoptionFeatures.length + 1 },
    (_, index) => featureColor(index),
);

type AdoptionData = ReturnType<typeof summarizeAdoption>;

const GroupMap = ({
    name,
    total,
    counts,
    colors,
    max,
}: {
    name: string;
    total: number;
    counts: number[];
    colors: string[];
    max: number;
}) => {
    const marks = Math.min(total, MAX_MARKS_PER_GROUP);
    const radius = Math.max(26, 96 * Math.sqrt(total / max));
    const dotRadius = Math.min(7, (radius / Math.sqrt(marks)) * 0.66);
    const marksRadius = radius - dotRadius - 4;
    let bucket = 0;
    let end = counts[0];
    return (
        <Stack align="center" gap={4}>
            <svg
                viewBox="0 0 200 200"
                className={classes.circle}
                aria-hidden="true"
            >
                <circle
                    cx={100}
                    cy={100}
                    r={radius}
                    fill="var(--mantine-color-default)"
                    stroke="var(--mantine-color-default-border)"
                />
                {Array.from({ length: marks }, (_, index) => {
                    const member = ((index + 0.5) * total) / marks;
                    while (member >= end && bucket < counts.length - 1) {
                        bucket += 1;
                        end += counts[bucket];
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
};

const Fingerprint = ({
    data,
    groups,
}: {
    data: AdoptionData;
    groups: AdoptionData['groups'];
}) => {
    const [expanded, setExpanded] = useState(false);
    const rows = [
        { id: 'everyone', name: 'Everyone', ...data.overall },
        ...groups,
    ];
    return (
        <Paper withBorder p="md">
            <details
                className={classes.fingerprint}
                onToggle={(event) => setExpanded(event.currentTarget.open)}
            >
                <Text component="summary" fw={600} size="sm">
                    Feature fingerprint
                </Text>
                {expanded && (
                    <ScrollArea>
                        <Table withRowBorders highlightOnHover miw={730}>
                            <Table.Caption>
                                Share of members who used each feature in the
                                last 30 complete days.
                            </Table.Caption>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Group</Table.Th>
                                    {adoptionFeatures.map((feature) => (
                                        <Table.Th key={feature}>
                                            {feature}
                                        </Table.Th>
                                    ))}
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {rows.map(
                                    ({ id, name, total, featureCounts }) => (
                                        <Table.Tr key={id}>
                                            <Table.Th scope="row">
                                                <Text size="sm" fw={600}>
                                                    {name}
                                                </Text>
                                                <Text c="dimmed" size="xs">
                                                    {countLabel(total)}
                                                </Text>
                                            </Table.Th>
                                            {featureCounts.map(
                                                (count, index) => (
                                                    <Table.Td
                                                        key={
                                                            adoptionFeatures[
                                                                index
                                                            ]
                                                        }
                                                    >
                                                        {Math.round(
                                                            (100 * count) /
                                                                total,
                                                        )}
                                                        %
                                                    </Table.Td>
                                                ),
                                            )}
                                        </Table.Tr>
                                    ),
                                )}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea>
                )}
            </details>
        </Paper>
    );
};

const AnalyticsAdoption = ({ projectUuid }: { projectUuid: string }) => {
    const [membership] = useAnalyticsQueries(projectUuid, [
        adoptionMembershipQuery,
    ]);
    const [activity] = useAnalyticsQueries(
        projectUuid,
        [adoptionActivityQuery],
        membership.isSuccess &&
            membership.data.length > 0 &&
            membership.data.length < ADOPTION_ROW_LIMIT,
    );
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [preferredColor, setPreferredColor] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const members = useMemo(
        () =>
            summarizeAdoption(
                membership.data ?? [],
                adoptionMembershipQuery.exploreName,
            ),
        [membership.data],
    );
    const featureData = useMemo(
        () =>
            activity.data?.length && activity.data.length < ADOPTION_ROW_LIMIT
                ? summarizeAdoption(
                      activity.data,
                      adoptionActivityQuery.exploreName,
                  )
                : null,
        [activity.data],
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

    const color =
        featureData && preferredColor !== 'role' ? 'features' : 'role';
    const data = color === 'features' && featureData ? featureData : members;
    const filterGroups = (groups: AdoptionData['groups']) =>
        selectedGroups.length
            ? groups.filter(({ id }) => selectedGroups.includes(id))
            : groups;
    const groups = filterGroups(data.groups);
    const pages = Math.ceil(groups.length / PAGE_SIZE);
    const currentPage = Math.min(page, Math.max(pages, 1));
    const visibleGroups = groups.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
    );
    const max = groups[0]?.total ?? 1;
    const colors = color === 'features' ? featureColors : roleColors;
    const legend =
        color === 'features'
            ? [
                  { label: 'No features', color: featureColors[0] },
                  { label: '1 feature', color: featureColors[1] },
                  {
                      label: `${adoptionFeatures.length} features`,
                      color: featureColors.at(-1),
                  },
              ]
            : adoptionRoles.map(({ label }, index) => ({
                  label,
                  color: roleColors[index],
              }));

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
                <Group align="flex-end">
                    <MultiSelect
                        aria-label="Groups shown on the adoption map"
                        placeholder="All groups"
                        clearable
                        searchable
                        data={members.groups.map(({ id, name }) => ({
                            value: id,
                            label: name,
                        }))}
                        value={selectedGroups}
                        onChange={(next) => {
                            setSelectedGroups(next);
                            setPage(1);
                        }}
                        maw={280}
                    />
                    <SegmentedControl
                        size="xs"
                        aria-label="Color adoption map by"
                        value={color}
                        onChange={setPreferredColor}
                        data={[
                            {
                                label: 'Features',
                                value: 'features',
                                disabled: !featureData,
                            },
                            { label: 'Role', value: 'role' },
                        ]}
                    />
                </Group>
            </Group>
            <Paper
                component="section"
                withBorder
                p="md"
                aria-label="Adoption map"
            >
                <Stack gap="md">
                    {!featureData && (
                        <Text size="sm" c="dimmed" role="status">
                            {activity.isError
                                ? 'Feature usage could not be loaded. The map shows member roles.'
                                : activity.isLoading
                                  ? 'Loading feature usage. The map shows member roles.'
                                  : 'Feature usage is unavailable. The map shows member roles.'}
                        </Text>
                    )}
                    <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, lg: 4 }}>
                        {visibleGroups.map((group) => (
                            <GroupMap
                                key={group.id}
                                name={group.name}
                                total={group.total}
                                counts={
                                    color === 'features'
                                        ? group.featuresPerPerson
                                        : group.roles
                                }
                                colors={colors}
                                max={max}
                            />
                        ))}
                    </SimpleGrid>
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
            {featureData && featureData.overall.total > 0 && (
                <Fingerprint
                    data={featureData}
                    groups={featureData.groups.filter(({ id }) =>
                        visibleGroups.some((group) => group.id === id),
                    )}
                />
            )}
        </Stack>
    );
};

export default AnalyticsAdoption;
