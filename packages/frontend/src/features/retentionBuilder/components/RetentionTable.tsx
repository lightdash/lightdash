import { getRetentionPeriodLabel } from '@lightdash/common';
import { Table, Text, Tooltip } from '@mantine/core';
import { Fragment, useMemo, type FC } from 'react';
import { useAppSelector } from '../store';
import { selectResults } from '../store/retentionBuilderSlice';
import {
    formatRetentionRate,
    getRetentionCellColor,
} from '../utils/retentionConfig';
import styles from './RetentionTable.module.css';

const clsx = (...names: (string | false | undefined)[]) =>
    names.filter(Boolean).join(' ');

type Cell = {
    rate: number | null;
    count: number | null;
    incomplete: boolean;
};

const RateCell: FC<{ cell: Cell; rowMax: number }> = ({ cell, rowMax }) => (
    <Table.Td
        className={clsx(styles.cell, cell.incomplete && styles.incomplete)}
        // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
        style={{
            backgroundColor: cell.incomplete
                ? 'transparent'
                : getRetentionCellColor(cell.rate, rowMax),
        }}
    >
        <Tooltip
            label={
                cell.count === null
                    ? 'No data yet'
                    : `${cell.count.toLocaleString()} users${
                          cell.incomplete ? ', period in progress' : ''
                      }`
            }
            withArrow
        >
            <Text span size="sm">
                {formatRetentionRate(cell.rate)}
                {cell.incomplete && cell.rate !== null ? '*' : ''}
            </Text>
        </Tooltip>
    </Table.Td>
);

/** Cohort table: one row per cohort, one column per period. */
export const RetentionTable: FC = () => {
    const results = useAppSelector(selectResults);

    const groups = useMemo(() => {
        if (!results) return [];
        const { averages, cohorts, periods } = results;
        return averages.map((average) => ({
            breakdownValue: average.breakdownValue,
            averageRow: {
                cohortSize: average.cohortSizes[0] ?? 0,
                cells: average.rates.map((rate, p) => ({
                    rate,
                    count: average.counts[p] ?? null,
                    incomplete: false,
                })),
            },
            cohortRows: cohorts
                .filter((c) => c.breakdownValue === average.breakdownValue)
                .map((cohort) => ({
                    cohortDate: cohort.cohortDate,
                    cohortSize: cohort.cohortSize,
                    cells: Array.from({ length: periods + 1 }, (_, p) => ({
                        rate: cohort.rates[p] ?? null,
                        count: cohort.counts[p] ?? null,
                        incomplete: p > cohort.lastCompletePeriod,
                    })),
                })),
        }));
    }, [results]);

    if (!results?.cohorts.length) return null;

    const { unit, periods } = results;
    const hasBreakdown = groups.some((g) => g.breakdownValue !== null);
    const rowMax = (cells: Cell[]) =>
        Math.max(0, ...cells.slice(1).map((c) => c.rate ?? 0));

    return (
        <Table striped highlightOnHover className={styles.retentionTable}>
            <Table.Thead>
                <Table.Tr>
                    {hasBreakdown && (
                        <Table.Th className={styles.header}>Breakdown</Table.Th>
                    )}
                    <Table.Th className={styles.header}>Cohort</Table.Th>
                    <Table.Th className={styles.header} ta="right">
                        Size
                    </Table.Th>
                    {Array.from({ length: periods + 1 }, (_, p) => (
                        <Table.Th key={p} className={styles.header} ta="right">
                            {getRetentionPeriodLabel(unit, p)}
                        </Table.Th>
                    ))}
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {groups.map((group) => (
                    <Fragment key={group.breakdownValue ?? '__all__'}>
                        <Table.Tr className={styles.averageRow}>
                            {hasBreakdown && (
                                <Table.Td>
                                    {group.breakdownValue ?? '(empty)'}
                                </Table.Td>
                            )}
                            <Table.Td>Average</Table.Td>
                            <Table.Td className={styles.cell}>
                                {group.averageRow.cohortSize.toLocaleString()}
                            </Table.Td>
                            {group.averageRow.cells.map((cell, p) => (
                                <RateCell
                                    key={p}
                                    cell={cell}
                                    rowMax={rowMax(group.averageRow.cells)}
                                />
                            ))}
                        </Table.Tr>
                        {group.cohortRows.map((row) => (
                            <Table.Tr
                                key={`${group.breakdownValue ?? ''}|${row.cohortDate}`}
                            >
                                {hasBreakdown && <Table.Td />}
                                <Table.Td>{row.cohortDate}</Table.Td>
                                <Table.Td className={styles.cell}>
                                    {row.cohortSize.toLocaleString()}
                                </Table.Td>
                                {row.cells.map((cell, p) => (
                                    <RateCell
                                        key={p}
                                        cell={cell}
                                        rowMax={rowMax(row.cells)}
                                    />
                                ))}
                            </Table.Tr>
                        ))}
                    </Fragment>
                ))}
            </Table.Tbody>
        </Table>
    );
};
