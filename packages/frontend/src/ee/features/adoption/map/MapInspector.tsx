import {
    OrganizationMemberRoleLabels,
    type DepartmentMember,
    type DepartmentWithMetrics,
} from '@lightdash/common';
import {
    Box,
    Button,
    CloseButton,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import { getDepartmentPath } from '../utils/adoptionNav';
import { formatOwners, sortByCoverage } from '../utils/departmentRows';
import styles from './AdoptionMap.module.css';
import {
    formatCount,
    formatMemberActivity,
    formatPct,
    type ViewTotals,
} from './mapView';

type Props = {
    // The focused department, or null at the top of the organization
    department: DepartmentWithMetrics | null;
    // The departments one level down, which is what the map is showing
    subDepartments: DepartmentWithMetrics[];
    totals: ViewTotals;
    member: DepartmentMember | null;
    canManage: boolean;
    onDepartmentClick: (departmentUuid: string) => void;
    onClearMember: () => void;
    onEdit: (department: DepartmentWithMetrics) => void;
};

type TileProps = { label: string; value: number; note: string | null };

const Tile: FC<TileProps> = ({ label, value, note }) => (
    <Box className={styles.tile}>
        <Text fz="xs" c="dimmed">
            {label}
        </Text>
        <Group gap={6} align="baseline" wrap="nowrap">
            <Text fz="xl" fw={600} lh={1.3}>
                {formatCount(value)}
            </Text>
            {note !== null && (
                <Text fz="xs" c="dimmed">
                    {note}
                </Text>
            )}
        </Group>
    </Box>
);

const getDepartmentTiles = (department: DepartmentWithMetrics): TileProps[] => {
    const { metrics, effectiveHeadcount, targetActiveUsers } = department;
    const remaining =
        targetActiveUsers === null
            ? 0
            : Math.max(targetActiveUsers - metrics.activeCount30d, 0);
    return [
        {
            label: 'On Lightdash',
            value: metrics.memberCount,
            note:
                effectiveHeadcount === null
                    ? 'no headcount'
                    : `of ${formatCount(effectiveHeadcount)}`,
        },
        {
            label: 'Active in 30 days',
            value: metrics.activeCount30d,
            note: formatPct(metrics.activePct, metrics.activeCount30d),
        },
        ...(effectiveHeadcount === null
            ? []
            : [
                  {
                      label: 'No account',
                      value: Math.max(
                          effectiveHeadcount - metrics.memberCount,
                          0,
                      ),
                      note: null,
                  },
              ]),
        ...(targetActiveUsers === null
            ? []
            : [
                  {
                      label: 'Target',
                      value: targetActiveUsers,
                      note:
                          remaining === 0
                              ? 'met'
                              : `${formatCount(remaining)} to go`,
                  },
              ]),
    ];
};

const getOrganizationTiles = (totals: ViewTotals): TileProps[] => [
    {
        label: 'On Lightdash',
        value: totals.members,
        note: `of ${formatCount(totals.people)}`,
    },
    { label: 'Active in 30 days', value: totals.active, note: null },
    {
        label: 'No account',
        value: Math.max(totals.people - totals.members, 0),
        note: null,
    },
];

const countOf = (count: number, singular: string): string =>
    `${formatCount(count)} ${singular}${count === 1 ? '' : 's'}`;

const getSummaryLine = (
    department: DepartmentWithMetrics | null,
    subDepartmentCount: number,
): string | null => {
    const parts = [
        department !== null && department.owners.length > 0
            ? `Owner ${formatOwners(department.owners)}`
            : null,
        subDepartmentCount > 0
            ? countOf(
                  subDepartmentCount,
                  department === null ? 'department' : 'sub-department',
              )
            : null,
        department !== null && department.linkedGroups.length > 0
            ? countOf(department.linkedGroups.length, 'group')
            : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(' · ') : null;
};

export const MapInspector: FC<Props> = ({
    department,
    subDepartments,
    totals,
    member,
    canManage,
    onDepartmentClick,
    onClearMember,
    onEdit,
}) => {
    const summaryLine = getSummaryLine(department, subDepartments.length);
    const tiles =
        department === null
            ? getOrganizationTiles(totals)
            : getDepartmentTiles(department);
    return (
        <Paper p="md" component="aside" aria-label="Details">
            <Stack gap="md" h="100%">
                <Stack gap={2}>
                    <Text fz="xs" c="dimmed">
                        {department === null ? 'Organization' : 'Department'}
                    </Text>
                    <Title order={5}>
                        {department?.name ?? 'All departments'}
                    </Title>
                    {summaryLine !== null && (
                        <Text fz="xs" c="dimmed">
                            {summaryLine}
                        </Text>
                    )}
                </Stack>
                <SimpleGrid cols={2} spacing="xs">
                    {tiles.map((tile) => (
                        <Tile key={tile.label} {...tile} />
                    ))}
                </SimpleGrid>
                {department?.headcountBelowChildren && (
                    <Text fz="xs" c="dimmed">
                        Headcount is lower than the total of its sub-departments
                    </Text>
                )}
                {member !== null && (
                    <Stack gap={6}>
                        <Text fz="xs" c="dimmed">
                            Selected
                        </Text>
                        <Group
                            className={styles.selected}
                            justify="space-between"
                            align="flex-start"
                            wrap="nowrap"
                        >
                            <Stack gap={2} miw={0}>
                                <Text fz="sm" fw={500} truncate>
                                    {`${member.firstName} ${member.lastName}`.trim() ||
                                        member.email}
                                </Text>
                                <Text fz="xs" c="dimmed" truncate>
                                    {member.email}
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    {OrganizationMemberRoleLabels[member.role]}{' '}
                                    · {member.departmentName}
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    {formatMemberActivity(member.lastActiveAt)}
                                </Text>
                            </Stack>
                            <CloseButton
                                size="sm"
                                aria-label="Clear selected person"
                                onClick={onClearMember}
                            />
                        </Group>
                    </Stack>
                )}
                {subDepartments.length > 0 && (
                    <Stack gap={6}>
                        <Text fz="xs" c="dimmed">
                            {department === null
                                ? 'Departments, lowest coverage first'
                                : 'Sub-departments, lowest coverage first'}
                        </Text>
                        <Box className={styles.rows}>
                            {sortByCoverage(subDepartments).map((child) => (
                                <button
                                    key={child.departmentUuid}
                                    type="button"
                                    className={styles.row}
                                    onClick={() =>
                                        onDepartmentClick(child.departmentUuid)
                                    }
                                >
                                    <Text fz="sm" truncate>
                                        {child.name}
                                    </Text>
                                    <Text
                                        fz="xs"
                                        c="dimmed"
                                        className={styles.count}
                                    >
                                        {child.effectiveHeadcount === null
                                            ? `${formatCount(child.metrics.memberCount)} on Lightdash`
                                            : `${formatCount(child.metrics.memberCount)} of ${formatCount(child.effectiveHeadcount)}`}
                                    </Text>
                                    <Text
                                        fz="sm"
                                        fw={500}
                                        ta="right"
                                        className={styles.count}
                                    >
                                        {formatPct(
                                            child.metrics.coveragePct,
                                            child.metrics.memberCount,
                                        ) ?? '–'}
                                    </Text>
                                </button>
                            ))}
                        </Box>
                    </Stack>
                )}
                {department !== null && (
                    <Stack gap="xs" className={styles.actions}>
                        <Button
                            component={Link}
                            to={getDepartmentPath(department.departmentUuid)}
                        >
                            Open {department.name}
                        </Button>
                        {canManage && (
                            <Button
                                variant="default"
                                onClick={() => onEdit(department)}
                            >
                                Edit department
                            </Button>
                        )}
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
};
