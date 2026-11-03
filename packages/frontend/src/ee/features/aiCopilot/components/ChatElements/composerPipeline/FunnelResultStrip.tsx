import { friendlyName, interpolateUiString } from '@lightdash/common';
import { Box, Group, SimpleGrid, Text } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import styles from './FunnelResultStrip.module.css';

type FunnelResultRow = {
    stepOrder: number;
    stepName: string;
    totalUsers: number;
    breakdownValue: string | null;
};

// Users partition across breakdown values, so summing per step is exact.
const aggregateSteps = (rows: FunnelResultRow[]) => {
    const byStep = new Map<number, { stepName: string; users: number }>();
    rows.forEach((row) => {
        const step = byStep.get(row.stepOrder);
        byStep.set(row.stepOrder, {
            stepName: row.stepName,
            users: (step?.users ?? 0) + row.totalUsers,
        });
    });
    const steps = [...byStep.entries()]
        .sort(([a], [b]) => a - b)
        .map(([stepOrder, step]) => ({ stepOrder, ...step }));
    const shareOf = (users: number, base: number | undefined) =>
        base ? (users / base) * 100 : 0;
    return steps.map((step, index) => ({
        ...step,
        shareOfFirst: shareOf(step.users, steps[0]?.users),
        shareOfPrevious:
            index === 0 ? null : shareOf(step.users, steps[index - 1].users),
    }));
};

/** Users per funnel step, with each step's conversion from the one before. */
export const FunnelResultStrip: FC<{ rows: FunnelResultRow[] }> = ({
    rows,
}) => {
    const getUiString = useUiStrings();
    const steps = aggregateSteps(rows);

    return (
        <SimpleGrid
            cols={Math.max(steps.length, 1)}
            spacing={8}
            className={styles.strip}
            data-testid="funnel-result-strip"
        >
            {steps.map((step, index) => (
                <Box
                    key={step.stepOrder}
                    miw={0}
                    data-testid="funnel-strip-step"
                >
                    <Group gap={4} wrap="nowrap" miw={0}>
                        <Text fz="xs" c="dimmed" className={styles.tabular}>
                            {index + 1}
                        </Text>
                        <Text fz="xs" fw={600} truncate>
                            {friendlyName(step.stepName)}
                        </Text>
                    </Group>
                    <Box className={styles.track}>
                        <Box
                            className={styles.fill}
                            w={`${step.shareOfFirst}%`}
                        />
                    </Box>
                    <Text fz="xs" fw={600} className={styles.tabular}>
                        {step.users.toLocaleString()}
                    </Text>
                    <Text className={styles.meta}>
                        {step.shareOfPrevious === null
                            ? getUiString(
                                  'aiAgent.composer.funnelNode.strip.users',
                              )
                            : interpolateUiString(
                                  getUiString(
                                      'aiAgent.composer.funnelNode.strip.ofPrevious',
                                  ),
                                  { percent: step.shareOfPrevious.toFixed(1) },
                              )}
                    </Text>
                </Box>
            ))}
        </SimpleGrid>
    );
};
