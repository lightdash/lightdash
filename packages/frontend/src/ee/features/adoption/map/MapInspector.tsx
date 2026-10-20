import { assertUnreachable } from '@lightdash/common';
import { Box, Group, Paper, Progress, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import { getMissingHeadcountWord } from '../utils/departmentRows';
import { formatCount } from '../utils/format';
import {
    hasHeadcountInView,
    type CoverageReading,
    type CoverageRow,
    type DirectRow,
    type PeopleBreakdown,
} from '../utils/peopleBreakdown';
import styles from './AdoptionMap.module.css';
import { type DotKind } from './geometry';
import { DOT_LABELS } from './mapStyles';
import { formatPct } from './mapView';

type Props = {
    // Everyone placed in a department, counted as the legend under the view counts them
    breakdown: PeopleBreakdown;
    // The top-level departments, lowest coverage first
    rows: CoverageRow[];
    canManage: boolean;
    // The key beside each part of the bar: the view's own mark for those people, a dot on the map
    keySwatch: FC<{ kind: DotKind }>;
    onDepartmentClick: (departmentUuid: string) => void;
};

// The parts of the people on Lightdash, as the map colours them, over a track that stands for the people
// without an account; the whole bar is everyone the breakdown counts
export const BreakdownBar: FC<{
    breakdown: PeopleBreakdown;
    size: 'md' | 'lg';
}> = ({ breakdown, size }) => {
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

// Each part keyed with the mark the view draws for those people: the map's dots or the waffle's squares. Without
// a headcount anywhere, nobody can be counted as having no account, so that count gives way to a request
export const BreakdownLegend: FC<{
    breakdown: PeopleBreakdown;
    hasHeadcount: boolean;
    keySwatch: FC<{ kind: DotKind }>;
}> = ({ breakdown, hasHeadcount, keySwatch: KeySwatch }) => (
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
                    <KeySwatch kind={kind} />
                    <Text fz="xs" className={styles.count}>
                        {`${DOT_LABELS[kind]} ${formatCount(count)}`}
                    </Text>
                </li>
            ),
        )}
    </ul>
);

type CoverageRowListProps = {
    rows: CoverageRow[];
    // The people directly in a department beside its sub-departments, named after it; null where there are none
    direct: { name: string; row: DirectRow } | null;
    canManage: boolean;
    onDepartmentClick: (departmentUuid: string) => void;
};

// A row per department with its bar over its headcount and its coverage; a row selects its department. The people
// directly in a department come last, in a plain row, as they are the department already selected
export const CoverageRowList: FC<CoverageRowListProps> = ({
    rows,
    direct,
    canManage,
    onDepartmentClick,
}) => (
    <Box>
        {rows.map((row) => (
            <button
                key={row.department.departmentUuid}
                type="button"
                className={styles.row}
                onClick={() => onDepartmentClick(row.department.departmentUuid)}
            >
                <Text
                    component="span"
                    fz="sm"
                    truncate
                    title={row.department.name}
                >
                    {row.department.name}
                </Text>
                <BreakdownBar breakdown={row.breakdown} size="md" />
                <RowEnd
                    reading={row.reading}
                    memberCount={row.department.metrics.memberCount}
                    canManage={canManage}
                />
            </button>
        ))}
        {direct !== null && (
            <div className={`${styles.row} ${styles.directRow}`}>
                <span
                    className={styles.directLabel}
                    title={`Directly in ${direct.name} · ${formatCount(direct.row.memberCount)}`}
                >
                    <Text component="span" fz="sm" truncate>
                        {`Directly in ${direct.name}`}
                    </Text>
                    <Text
                        component="span"
                        fz="sm"
                        className={styles.directCount}
                    >
                        {` · ${formatCount(direct.row.memberCount)}`}
                    </Text>
                </span>
                <BreakdownBar breakdown={direct.row.breakdown} size="md" />
                <RowEnd
                    reading={direct.row.reading}
                    memberCount={direct.row.memberCount}
                    canManage={canManage}
                />
            </div>
        )}
    </Box>
);

// The organization beside the view while no department is selected: everyone placed in a department as one bar, and
// the top-level departments, lowest coverage first
export const MapInspector: FC<Props> = ({
    breakdown,
    rows,
    canManage,
    keySwatch,
    onDepartmentClick,
}) => (
    <Paper p="md" component="aside" aria-label="Details">
        <Stack gap="lg" h="100%">
            <Group
                justify="space-between"
                align="baseline"
                gap="sm"
                wrap="nowrap"
            >
                <Title order={5} size="h4" className={styles.title}>
                    Organization
                </Title>
                <Text
                    fz="xs"
                    c="dimmed"
                    truncate
                    title="All departments"
                    className={styles.subtitle}
                >
                    All departments
                </Text>
            </Group>
            <Stack gap="xs">
                <BreakdownBar breakdown={breakdown} size="lg" />
                <BreakdownLegend
                    breakdown={breakdown}
                    hasHeadcount={hasHeadcountInView(
                        null,
                        rows.map((row) => row.department),
                    )}
                    keySwatch={keySwatch}
                />
            </Stack>
            {rows.length > 0 && (
                <Stack gap={6}>
                    <Text fz="xs" c="dimmed">
                        Departments
                    </Text>
                    <CoverageRowList
                        rows={rows}
                        direct={null}
                        canManage={canManage}
                        onDepartmentClick={onDepartmentClick}
                    />
                </Stack>
            )}
        </Stack>
    </Paper>
);
