import { friendlyName, interpolateUiString } from '@lightdash/common';
import { Box, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import styles from './FunnelResultStrip.module.css';
import { type FunnelResultRow } from './funnelStripRows';

const percent = (value: number) => `${value.toFixed(1)}%`;

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

/** Total conversion and the step that lost the most users, as one line. */
const Headline: FC<{ steps: ReturnType<typeof aggregateSteps> }> = ({
    steps,
}) => {
    const getUiString = useUiStrings();
    const first = steps[0];
    const last = steps[steps.length - 1];
    const largestDrop = steps
        .filter((step) => step.shareOfPrevious !== null)
        .reduce<(typeof steps)[number] | null>(
            (worst, step) =>
                worst === null ||
                (step.shareOfPrevious ?? 100) < (worst.shareOfPrevious ?? 100)
                    ? step
                    : worst,
            null,
        );
    const facts = [
        interpolateUiString(
            getUiString('aiAgent.composer.funnelNode.strip.firstToLast'),
            {
                first: first.users.toLocaleString(),
                last: last.users.toLocaleString(),
            },
        ),
        ...(largestDrop
            ? [
                  interpolateUiString(
                      getUiString(
                          'aiAgent.composer.funnelNode.strip.largestDrop',
                      ),
                      {
                          step: friendlyName(largestDrop.stepName),
                          percent: `−${(
                              100 - (largestDrop.shareOfPrevious ?? 100)
                          ).toFixed(1)}`,
                      },
                  ),
              ]
            : []),
    ];
    return (
        <Group
            gap={6}
            wrap="nowrap"
            miw={0}
            data-testid="funnel-strip-headline"
        >
            <Text fz="sm" fw={600} className={styles.tabular}>
                {interpolateUiString(
                    getUiString('aiAgent.composer.funnelNode.strip.converted'),
                    { percent: last.shareOfFirst.toFixed(1) },
                )}
            </Text>
            <Text fz="xs" c="dimmed" truncate className={styles.tabular}>
                {facts.join(' · ')}
            </Text>
        </Group>
    );
};

/** Users per funnel step, with each step's share of the first and of the one before. */
export const FunnelResultStrip: FC<{ rows: FunnelResultRow[] }> = ({
    rows,
}) => {
    const getUiString = useUiStrings();
    const steps = aggregateSteps(rows);
    if (steps.length === 0) return null;

    return (
        <Stack
            gap={10}
            className={styles.strip}
            data-testid="funnel-result-strip"
        >
            {steps.length > 1 && <Headline steps={steps} />}
            <SimpleGrid cols={steps.length} spacing={8}>
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
                        <Group gap={6} wrap="nowrap" align="baseline">
                            <Text fz="sm" fw={600} className={styles.tabular}>
                                {step.users.toLocaleString()}
                            </Text>
                            <Text fz="xs" c="dimmed" className={styles.tabular}>
                                {percent(step.shareOfFirst)}
                            </Text>
                        </Group>
                        <Text className={styles.meta}>
                            {step.shareOfPrevious === null
                                ? getUiString(
                                      'aiAgent.composer.funnelNode.strip.users',
                                  )
                                : interpolateUiString(
                                      getUiString(
                                          'aiAgent.composer.funnelNode.strip.ofPrevious',
                                      ),
                                      {
                                          percent:
                                              step.shareOfPrevious.toFixed(1),
                                      },
                                  )}
                        </Text>
                    </Box>
                ))}
            </SimpleGrid>
        </Stack>
    );
};
