import { friendlyName, type FunnelStepResult } from '@lightdash/common';
import { Box, Table, Text } from '@mantine/core';
import { useMemo, useRef, type FC } from 'react';
import { ColumnWindowColGroup } from '../../../components/common/Table/ColumnWindowColGroup';
import {
    renderColumnGroups,
    renderColumns,
    useColumnWindow,
} from '../../../components/common/Table/useColumnWindow';
import { useAppSelector } from '../store';
import { selectResults } from '../store/funnelBuilderSlice';
import { formatTimeDuration } from '../utils/funnelChartConfig';
import styles from './FunnelResultsTable.module.css';

const metrics = [
    {
        label: 'Users',
        width: 112,
        value: (step: FunnelStepResult) => step.totalUsers.toLocaleString(),
    },
    {
        label: 'Conv %',
        width: 88,
        value: (step: FunnelStepResult) =>
            `${step.stepConversionRate.toFixed(1)}%`,
    },
    {
        label: 'Time',
        width: 72,
        value: (step: FunnelStepResult) =>
            formatTimeDuration(step.medianTimeToConvertSeconds),
    },
];

export const FunnelResultsTable: FC = () => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const results = useAppSelector(selectResults);

    const { stepNames, rows, hasBreakdown, columns, groups } = useMemo(() => {
        const stepOrder = new Map<string, number>();
        const breakdowns = new Map<
            string | undefined,
            Map<string, FunnelStepResult>
        >();
        for (const step of results?.steps ?? []) {
            if (!stepOrder.has(step.stepName))
                stepOrder.set(step.stepName, step.stepOrder);
            const breakdown =
                breakdowns.get(step.breakdownValue) ??
                new Map<string, FunnelStepResult>();
            breakdown.set(step.stepName, step);
            breakdowns.set(step.breakdownValue, breakdown);
        }
        const names = [...stepOrder]
            .sort((a, b) => a[1] - b[1])
            .map(([name]) => name);
        const showBreakdown = [...breakdowns.keys()].some(
            (value) => value !== undefined,
        );
        return {
            stepNames: names,
            rows: [...breakdowns],
            hasBreakdown: showBreakdown,
            groups: [
                ...(showBreakdown ? [{ colSpan: 1 }] : []),
                ...names.map(() => ({ colSpan: metrics.length })),
            ],
            columns: [
                ...(showBreakdown
                    ? [
                          {
                              id: 'breakdown',
                              width: 160,
                              pinned: true,
                              kind: 'breakdown' as const,
                          },
                      ]
                    : []),
                ...names.flatMap((name, stepIndex) =>
                    metrics.map((metric) => {
                        const hasNoTime =
                            stepIndex === 0 && metric.label === 'Time';
                        return {
                            id: `${name}:${metric.label}`,
                            kind: 'metric' as const,
                            stepName: name,
                            label: hasNoTime ? '—' : metric.label,
                            value: hasNoTime ? () => '—' : metric.value,
                            width: metric.width,
                        };
                    }),
                ),
            ],
        };
    }, [results]);

    const columnWindow = useColumnWindow(viewportRef, columns);
    if (!stepNames.length) return null;

    return (
        <Box ref={viewportRef} className={styles.tableContainer}>
            <Table
                striped
                highlightOnHover
                aria-colcount={columnWindow && columns.length}
                className={styles.funnelTable}
                w={columnWindow && `calc(${columnWindow.width}px)`}
                layout={columnWindow && 'fixed'}
                data-windowed={columnWindow ? true : undefined}
            >
                <ColumnWindowColGroup columnWindow={columnWindow} />
                <Table.Thead>
                    {/* First tier: Step names */}
                    <Table.Tr>
                        {renderColumnGroups(
                            columnWindow,
                            groups,
                            (groupIndex, colSpan, firstColumnIndex) => {
                                if (hasBreakdown && groupIndex === 0)
                                    return (
                                        <Table.Th
                                            key="breakdown"
                                            rowSpan={2}
                                            aria-colindex={columnWindow && 1}
                                            className={styles.breakdownHeader}
                                        >
                                            Breakdown
                                        </Table.Th>
                                    );
                                const idx = groupIndex - Number(hasBreakdown);
                                const stepName = friendlyName(stepNames[idx]);
                                return (
                                    <Table.Th
                                        key={`step-${idx}`}
                                        title={stepName}
                                        colSpan={colSpan}
                                        aria-colindex={
                                            columnWindow && firstColumnIndex + 1
                                        }
                                        ta="left"
                                        className={styles.stepHeader}
                                    >
                                        <Text
                                            span
                                            ff="monospace"
                                            fw={600}
                                            mr={6}
                                        >
                                            {idx + 1}
                                        </Text>
                                        {stepName}
                                    </Table.Th>
                                );
                            },
                        )}
                    </Table.Tr>
                    {/* Second tier: Metrics for each step */}
                    <Table.Tr>
                        {renderColumns(
                            columnWindow,
                            columns.length,
                            (index) => {
                                const column = columns[index];
                                if (column.kind === 'breakdown') return null;
                                return (
                                    <Table.Th
                                        key={column.id}
                                        aria-colindex={
                                            columnWindow && index + 1
                                        }
                                        ta="right"
                                        className={styles.metricHeader}
                                    >
                                        {column.label}
                                    </Table.Th>
                                );
                            },
                        )}
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {rows.map(([breakdownValue, steps]) => (
                        <Table.Tr key={JSON.stringify([breakdownValue])}>
                            {renderColumns(
                                columnWindow,
                                columns.length,
                                (index) => {
                                    const column = columns[index];
                                    if (column.kind === 'breakdown')
                                        return (
                                            <Table.Td
                                                key={column.id}
                                                aria-colindex={
                                                    columnWindow && 1
                                                }
                                                fw={500}
                                                title={breakdownValue}
                                            >
                                                {breakdownValue ?? '(empty)'}
                                            </Table.Td>
                                        );
                                    const step = steps.get(column.stepName);
                                    return (
                                        <Table.Td
                                            key={column.id}
                                            aria-colindex={
                                                columnWindow && index + 1
                                            }
                                            ta="right"
                                            ff="monospace"
                                        >
                                            {step ? column.value(step) : '—'}
                                        </Table.Td>
                                    );
                                },
                            )}
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Box>
    );
};
