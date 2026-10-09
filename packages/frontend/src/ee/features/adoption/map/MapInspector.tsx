import {
    assertUnreachable,
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
import { getMissingHeadcountWord } from '../utils/departmentRows';
import { formatCount } from '../utils/format';
import {
    getDirectRow,
    hasHeadcountInView,
    type CoverageReading,
    type CoverageRow,
    type PeopleBreakdown,
} from '../utils/peopleBreakdown';
import styles from './AdoptionMap.module.css';
import { type ColourBy } from './geometry';
import { DotSwatch } from './MapLegend';
import { DOT_LABELS } from './mapStyles';
import { formatMemberActivity, formatPct } from './mapView';

type Props = {
    // The focused department, or null at the top of the organization
    department: DepartmentWithMetrics | null;
    // The focused department's parent, or null for a top-level department
    parentName: string | null;
    // Everyone the panel is about, counted as the legend under the map counts them
    breakdown: PeopleBreakdown;
    colourBy: ColourBy;
    // The departments one level down, which is what the map is showing, lowest coverage first
    rows: CoverageRow[];
    member: DepartmentMember | null;
    canManage: boolean;
    onDepartmentClick: (departmentUuid: string) => void;
    onClearMember: () => void;
    onEdit: (department: DepartmentWithMetrics) => void;
};

// The parts of the people on Lightdash, as the map colours them, over a track that stands for the people
// without an account; the whole bar is everyone the breakdown counts
const BreakdownBar: FC<{ breakdown: PeopleBreakdown; size: 'md' | 'lg' }> = ({
    breakdown,
    size,
}) => {
    const total = breakdown.reduce((sum, part) => sum + part.count, 0);
    return (
        <Progress.Root
            size={size}
            radius={size === 'lg' ? 'sm' : 'xs'}
            className={styles.track}
            aria-hidden
        >
            {breakdown
                .filter((part) => part.kind !== 'noAccount')
                .map((part) => (
                    <Progress.Section
                        key={part.kind}
                        className={styles.segment}
                        data-part={part.kind}
                        value={total > 0 ? (100 * part.count) / total : 0}
                        withAria={false}
                    />
                ))}
        </Progress.Root>
    );
};

const RowWord: FC<{ children: string }> = ({ children }) => (
    <Text
        component="span"
        fz="xs"
        c="dimmed"
        ta="right"
        className={styles.rowEnd}
    >
        {children}
    </Text>
);

// A row's last column: its coverage, or a word where there is no share to give
const RowEnd: FC<{
    reading: CoverageReading;
    memberCount: number;
    canManage: boolean;
}> = ({ reading, memberCount, canManage }) => {
    switch (reading.kind) {
        case 'coverage':
            return (
                <Text
                    component="span"
                    fz="sm"
                    fw={600}
                    ta="right"
                    className={`${styles.rowEnd} ${styles.count}`}
                >
                    {formatPct(reading.pct, memberCount)}
                </Text>
            );
        case 'noHeadcount':
            return <RowWord>{getMissingHeadcountWord(canManage)}</RowWord>;
        case 'nobody':
            return <RowWord>Nobody yet</RowWord>;
        default:
            return assertUnreachable(reading, 'Unknown coverage reading');
    }
};

// Each part keyed with the dot the map draws for those people. Without a headcount anywhere, nobody can be
// counted as having no account, so that count gives way to a request
const BreakdownLegend: FC<{
    breakdown: PeopleBreakdown;
    hasHeadcount: boolean;
}> = ({ breakdown, hasHeadcount }) => (
    <ul className={styles.legend}>
        {breakdown.map(({ kind, count }) =>
            kind === 'noAccount' && !hasHeadcount ? (
                <li key={kind} className={styles.legendItem}>
                    <Text fz="xs" c="dimmed">
                        Add headcounts to see coverage
                    </Text>
                </li>
            ) : (
                <li key={kind} className={styles.legendItem}>
                    <DotSwatch kind={kind} />
                    <Text fz="xs" className={styles.count}>
                        {`${DOT_LABELS[kind]} ${formatCount(count)}`}
                    </Text>
                </li>
            ),
        )}
    </ul>
);

export const MapInspector: FC<Props> = ({
    department,
    parentName,
    breakdown,
    colourBy,
    rows,
    member,
    canManage,
    onDepartmentClick,
    onClearMember,
    onEdit,
}) => {
    const subtitle =
        department === null ? 'All departments' : (parentName ?? 'Department');
    const hasHeadcount = hasHeadcountInView(
        department,
        rows.map((row) => row.department),
    );
    // The people directly in a department beside its sub-departments, as the map draws them
    const direct =
        department === null
            ? null
            : getDirectRow(
                  department,
                  rows.map((row) => row.department),
                  colourBy,
              );
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
                    <BreakdownLegend
                        breakdown={breakdown}
                        hasHeadcount={hasHeadcount}
                    />
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
                        <Box>
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
                                    <RowEnd
                                        reading={row.reading}
                                        memberCount={
                                            row.department.metrics.memberCount
                                        }
                                        canManage={canManage}
                                    />
                                </button>
                            ))}
                            {/* Nothing to open: the department is already open, so the row is plain */}
                            {department !== null && direct !== null && (
                                <div
                                    className={`${styles.row} ${styles.directRow}`}
                                >
                                    <span
                                        className={styles.directLabel}
                                        title={`Directly in ${department.name} · ${formatCount(direct.memberCount)}`}
                                    >
                                        <Text component="span" fz="sm" truncate>
                                            {`Directly in ${department.name}`}
                                        </Text>
                                        <Text
                                            component="span"
                                            fz="sm"
                                            className={styles.directCount}
                                        >
                                            {` · ${formatCount(direct.memberCount)}`}
                                        </Text>
                                    </span>
                                    <BreakdownBar
                                        breakdown={direct.breakdown}
                                        size="md"
                                    />
                                    <RowEnd
                                        reading={direct.reading}
                                        memberCount={direct.memberCount}
                                        canManage={canManage}
                                    />
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
