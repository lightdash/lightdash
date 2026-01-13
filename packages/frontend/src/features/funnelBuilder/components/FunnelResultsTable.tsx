import { friendlyName } from '@lightdash/common';
import { Table, Text } from '@mantine-8/core';
import { Fragment, useMemo, type FC } from 'react';
import { useAppSelector } from '../store';
import { selectResults } from '../store/funnelBuilderSlice';
import { formatTimeDuration } from '../utils/funnelChartConfig';
import styles from './FunnelResultsTable.module.css';

export const FunnelResultsTable: FC = () => {
    const results = useAppSelector(selectResults);

    const { stepNames, breakdownValues, stepsByKey } = useMemo(() => {
        if (!results?.steps.length) {
            return {
                stepNames: [],
                breakdownValues: [],
                stepsByKey: new Map(),
            };
        }

        // Get unique step names in order
        const names = [...new Set(results.steps.map((s) => s.stepName))].sort(
            (a, b) => {
                const stepA = results.steps.find((s) => s.stepName === a);
                const stepB = results.steps.find((s) => s.stepName === b);
                return (stepA?.stepOrder ?? 0) - (stepB?.stepOrder ?? 0);
            },
        );

        // Get unique breakdown values (or undefined for no breakdown)
        const breakdowns = [
            ...new Set(results.steps.map((s) => s.breakdownValue)),
        ];

        // Build lookup map: "stepName|breakdownValue" -> step
        const lookup = new Map<string, (typeof results.steps)[0]>();
        results.steps.forEach((step) => {
            const key = `${step.stepName}|${step.breakdownValue ?? ''}`;
            lookup.set(key, step);
        });

        return {
            stepNames: names,
            breakdownValues: breakdowns,
            stepsByKey: lookup,
        };
    }, [results]);

    if (!results?.steps.length) return null;

    const hasBreakdown = breakdownValues.some((v) => v !== undefined);

    return (
        <Table striped highlightOnHover className={styles.funnelTable}>
            <Table.Thead>
                {/* First tier: Step names */}
                <Table.Tr>
                    {hasBreakdown && (
                        <Table.Th
                            rowSpan={2}
                            className={styles.breakdownHeader}
                        >
                            Breakdown
                        </Table.Th>
                    )}
                    {stepNames.map((stepName, idx) => (
                        <Table.Th
                            key={stepName}
                            colSpan={3}
                            ta="left"
                            className={styles.stepHeader}
                        >
                            <Text span ff="monospace" fw={600} mr={6}>
                                {idx + 1}
                            </Text>
                            {friendlyName(stepName)}
                        </Table.Th>
                    ))}
                </Table.Tr>
                {/* Second tier: Metrics for each step */}
                <Table.Tr>
                    {stepNames.map((stepName, idx) => (
                        <Fragment key={stepName}>
                            <Table.Th
                                ta="right"
                                className={styles.metricHeader}
                            >
                                Users
                            </Table.Th>
                            <Table.Th
                                ta="right"
                                className={styles.metricHeader}
                            >
                                Conv %
                            </Table.Th>
                            <Table.Th
                                ta="right"
                                className={styles.metricHeader}
                            >
                                {idx === 0 ? '—' : 'Time'}
                            </Table.Th>
                        </Fragment>
                    ))}
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {breakdownValues.map((breakdownValue) => (
                    <Table.Tr key={breakdownValue ?? 'total'}>
                        {hasBreakdown && (
                            <Table.Td fw={500}>
                                {breakdownValue ?? '(empty)'}
                            </Table.Td>
                        )}
                        {stepNames.map((stepName, idx) => {
                            const step = stepsByKey.get(
                                `${stepName}|${breakdownValue ?? ''}`,
                            );
                            return (
                                <Fragment key={stepName}>
                                    <Table.Td ta="right" ff="monospace">
                                        {step?.totalUsers.toLocaleString() ??
                                            '—'}
                                    </Table.Td>
                                    <Table.Td ta="right" ff="monospace">
                                        {step
                                            ? `${step.stepConversionRate.toFixed(1)}%`
                                            : '—'}
                                    </Table.Td>
                                    <Table.Td ta="right" ff="monospace">
                                        {idx === 0
                                            ? '—'
                                            : formatTimeDuration(
                                                  step?.medianTimeToConvertSeconds,
                                              )}
                                    </Table.Td>
                                </Fragment>
                            );
                        })}
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    );
};
