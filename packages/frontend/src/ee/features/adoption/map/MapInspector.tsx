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
import { formatOwners, formatRoleSplit } from '../utils/departmentRows';
import {
    DEPARTMENTS,
    formatCount,
    formatQuantity,
    SUB_DEPARTMENTS,
    type Noun,
} from '../utils/format';
import styles from './AdoptionMap.module.css';
import {
    describeOrganizationOverview,
    formatDirectPeople,
    formatMemberActivity,
    formatPct,
    sortForInspector,
    type OrganizationOverview,
    type ViewTotals,
} from './mapView';

type Props = {
    // The focused department, or null at the top of the organization
    department: DepartmentWithMetrics | null;
    // The departments one level down, which is what the map is showing
    subDepartments: DepartmentWithMetrics[];
    totals: ViewTotals;
    // The whole organization's numbers, shown when no department is focused
    overview: OrganizationOverview | null;
    member: DepartmentMember | null;
    canManage: boolean;
    onDepartmentClick: (departmentUuid: string) => void;
    onClearMember: () => void;
    onEdit: (department: DepartmentWithMetrics) => void;
};

const GROUPS: Noun = { one: 'group', other: 'groups' };

type TileProps = {
    label: string;
    value: number;
    note: string | null;
};

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

// Summed over the circles in view, exactly as the legend counts its "No account" dots
const countWithoutAccount = (totals: ViewTotals): number =>
    Math.max(totals.people - totals.members, 0);

const getDepartmentTiles = (
    department: DepartmentWithMetrics,
    totals: ViewTotals,
): TileProps[] => {
    const { metrics, effectiveHeadcount, hasHeadcount } = department;
    return [
        {
            label: 'On Lightdash',
            value: metrics.memberCount,
            note: hasHeadcount
                ? `of ${formatCount(effectiveHeadcount)}`
                : 'no headcount',
        },
        {
            label: 'Active in 30 days',
            value: metrics.activeCount30d,
            note: formatPct(metrics.activePct, metrics.activeCount30d),
        },
        ...(!hasHeadcount
            ? []
            : [
                  {
                      label: 'No account',
                      value: countWithoutAccount(totals),
                      note: null,
                  },
              ]),
    ];
};

// The organization's own numbers, for everyone on Lightdash
const getOrganizationTiles = (
    overview: OrganizationOverview | null,
): TileProps[] =>
    overview === null
        ? []
        : [
              {
                  label: 'On Lightdash',
                  value: overview.onLightdash,
                  note: null,
              },
              {
                  label: 'Active in 30 days',
                  value: overview.active30d,
                  note: null,
              },
          ];

const getSummaryLine = (
    department: DepartmentWithMetrics | null,
    subDepartmentCount: number,
): string | null => {
    const parts = [
        department !== null && department.owners.length > 0
            ? `Owner ${formatOwners(department.owners)}`
            : null,
        subDepartmentCount > 0
            ? formatQuantity(
                  subDepartmentCount,
                  department === null ? DEPARTMENTS : SUB_DEPARTMENTS,
              )
            : null,
        department !== null && department.linkedGroups.length > 0
            ? formatQuantity(department.linkedGroups.length, GROUPS)
            : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(' · ') : null;
};

export const MapInspector: FC<Props> = ({
    department,
    subDepartments,
    totals,
    overview,
    member,
    canManage,
    onDepartmentClick,
    onClearMember,
    onEdit,
}) => {
    const summaryLine = getSummaryLine(department, subDepartments.length);
    // People still waiting for a department are on Lightdash but not on the map, so both are given
    const overviewCopy =
        department === null && overview !== null
            ? describeOrganizationOverview(overview)
            : null;
    const tiles =
        department === null
            ? getOrganizationTiles(overview)
            : getDepartmentTiles(department, totals);
    // The people directly in a department beside its sub-departments, counted on their own as on the map
    const direct =
        department !== null &&
        subDepartments.length > 0 &&
        department.directMetrics.memberCount > 0
            ? department.directMetrics
            : null;
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
                {department !== null && department.metrics.memberCount > 0 && (
                    <Text fz="xs" c="dimmed">
                        {formatRoleSplit(department.metrics.roleSplit)}
                    </Text>
                )}
                {overviewCopy !== null && (
                    <Stack gap={4}>
                        <Text fz="sm">{overviewCopy.placed}</Text>
                        {overviewCopy.withoutAccount !== null && (
                            <Text fz="sm">{overviewCopy.withoutAccount}</Text>
                        )}
                        {overviewCopy.captions.map((caption) => (
                            <Text key={caption} fz="xs" c="dimmed">
                                {caption}
                            </Text>
                        ))}
                    </Stack>
                )}
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
                            {sortForInspector(subDepartments).map((child) => (
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
                                        {child.hasHeadcount
                                            ? `${formatCount(child.metrics.memberCount)} of ${formatCount(child.effectiveHeadcount)}`
                                            : `${formatCount(child.metrics.memberCount)} on Lightdash`}
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
                            {/* Nothing to open: the department is already open, so the row is plain */}
                            {department !== null && direct !== null && (
                                <Box
                                    className={`${styles.row} ${styles.directRow}`}
                                >
                                    <Text fz="sm" truncate>
                                        {`Directly in ${department.name}`}
                                    </Text>
                                    <Text
                                        fz="xs"
                                        c="dimmed"
                                        className={styles.count}
                                    >
                                        {formatDirectPeople(
                                            direct.memberCount,
                                            direct.activeCount30d,
                                        )}
                                    </Text>
                                    <Text
                                        fz="sm"
                                        fw={500}
                                        ta="right"
                                        className={styles.count}
                                    >
                                        –
                                    </Text>
                                </Box>
                            )}
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
