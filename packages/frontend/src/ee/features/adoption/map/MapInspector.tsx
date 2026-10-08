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
    Progress,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import { getDepartmentPath } from '../utils/adoptionNav';
import { formatCount } from '../utils/format';
import {
    getDirectBreakdown,
    type CoverageRow,
    type PeopleBreakdown,
} from '../utils/peopleBreakdown';
import styles from './AdoptionMap.module.css';
import { formatMemberActivity, formatPct } from './mapView';

type Props = {
    // The focused department, or null at the top of the organization
    department: DepartmentWithMetrics | null;
    // The focused department's parent, or null for a top-level department
    parentName: string | null;
    // Everyone the panel is about, counted as the legend under the map counts them
    breakdown: PeopleBreakdown;
    // The departments one level down, which is what the map is showing, lowest coverage first
    rows: CoverageRow[];
    member: DepartmentMember | null;
    canManage: boolean;
    onDepartmentClick: (departmentUuid: string) => void;
    onClearMember: () => void;
    onEdit: (department: DepartmentWithMetrics) => void;
};

type Part = keyof PeopleBreakdown;

const LEGEND: { part: Part; label: string }[] = [
    { part: 'active', label: 'Active' },
    { part: 'onLightdashNotActive', label: 'On Lightdash, not active' },
    { part: 'noAccount', label: 'No account' },
];

// The share of the whole bar a part takes; the whole is everyone the breakdown counts
const getShare = (breakdown: PeopleBreakdown, part: Part): number => {
    const total =
        breakdown.active + breakdown.onLightdashNotActive + breakdown.noAccount;
    return total > 0 ? (100 * breakdown[part]) / total : 0;
};

// Active, then on Lightdash but not active, over a track that stands for the people without an account
const BreakdownBar: FC<{ breakdown: PeopleBreakdown; size: 'md' | 'lg' }> = ({
    breakdown,
    size,
}) => (
    <Progress.Root size={size} radius={size === 'lg' ? 'sm' : 'xs'} aria-hidden>
        {(['active', 'onLightdashNotActive'] as const).map((part) => (
            <Progress.Section
                key={part}
                className={styles.segment}
                data-part={part}
                value={getShare(breakdown, part)}
                withAria={false}
            />
        ))}
    </Progress.Root>
);

const BreakdownLegend: FC<{ breakdown: PeopleBreakdown }> = ({ breakdown }) => (
    <ul className={styles.legend}>
        {LEGEND.map(({ part, label }) => (
            <li key={part} className={styles.legendItem}>
                <span className={styles.swatch} data-part={part} aria-hidden />
                <Text fz="xs" className={styles.count}>
                    {`${label} ${formatCount(breakdown[part])}`}
                </Text>
            </li>
        ))}
    </ul>
);

export const MapInspector: FC<Props> = ({
    department,
    parentName,
    breakdown,
    rows,
    member,
    canManage,
    onDepartmentClick,
    onClearMember,
    onEdit,
}) => {
    const subtitle =
        department === null ? 'All departments' : (parentName ?? 'Department');
    // The people directly in a department beside its sub-departments, counted on their own as on the map
    const direct =
        department !== null &&
        rows.length > 0 &&
        department.directMetrics.memberCount > 0
            ? {
                  name: `Directly in ${department.name}`,
                  count: ` · ${formatCount(department.directMetrics.memberCount)}`,
                  breakdown: getDirectBreakdown(department),
              }
            : null;
    return (
        <Paper p="md" component="aside" aria-label="Details">
            <Stack gap="lg" h="100%">
                <Group
                    justify="space-between"
                    align="baseline"
                    gap="sm"
                    wrap="nowrap"
                >
                    <Title order={5} size="h4" className={styles.title}>
                        {department?.name ?? 'Organization'}
                    </Title>
                    <Text
                        fz="xs"
                        c="dimmed"
                        truncate
                        title={subtitle}
                        className={styles.subtitle}
                    >
                        {subtitle}
                    </Text>
                </Group>
                <Stack gap="xs">
                    <BreakdownBar breakdown={breakdown} size="lg" />
                    <BreakdownLegend breakdown={breakdown} />
                </Stack>
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
                {rows.length > 0 && (
                    <Stack gap={6}>
                        <Text fz="xs" c="dimmed">
                            {department === null
                                ? 'Departments'
                                : 'Sub-departments'}
                        </Text>
                        <Box className={styles.rows}>
                            {rows.map((row) => (
                                <button
                                    key={row.department.departmentUuid}
                                    type="button"
                                    className={styles.row}
                                    onClick={() =>
                                        onDepartmentClick(
                                            row.department.departmentUuid,
                                        )
                                    }
                                >
                                    <Text
                                        component="span"
                                        fz="sm"
                                        truncate
                                        title={row.department.name}
                                    >
                                        {row.department.name}
                                    </Text>
                                    <BreakdownBar
                                        breakdown={row.breakdown}
                                        size="md"
                                    />
                                    {row.coveragePct === null ? (
                                        <Text
                                            component="span"
                                            fz="xs"
                                            c="dimmed"
                                            ta="right"
                                            className={styles.rowEnd}
                                        >
                                            Add headcount
                                        </Text>
                                    ) : (
                                        <Text
                                            component="span"
                                            fz="sm"
                                            fw={600}
                                            ta="right"
                                            className={`${styles.rowEnd} ${styles.count}`}
                                        >
                                            {formatPct(
                                                row.coveragePct,
                                                row.department.metrics
                                                    .memberCount,
                                            )}
                                        </Text>
                                    )}
                                </button>
                            ))}
                            {/* Nothing to open: the department is already open, so the row is plain */}
                            {direct !== null && (
                                <div
                                    className={`${styles.row} ${styles.directRow}`}
                                >
                                    <span
                                        className={styles.directLabel}
                                        title={`${direct.name}${direct.count}`}
                                    >
                                        <Text component="span" fz="sm" truncate>
                                            {direct.name}
                                        </Text>
                                        <Text
                                            component="span"
                                            fz="sm"
                                            className={styles.directCount}
                                        >
                                            {direct.count}
                                        </Text>
                                    </span>
                                    <BreakdownBar
                                        breakdown={direct.breakdown}
                                        size="md"
                                    />
                                    <span />
                                </div>
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
