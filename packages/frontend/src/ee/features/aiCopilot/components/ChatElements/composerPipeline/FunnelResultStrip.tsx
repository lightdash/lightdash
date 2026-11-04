import { friendlyName, interpolateUiString } from '@lightdash/common';
import { Box, Group, Stack, Text } from '@mantine/core';
import { IconArrowDown } from '@tabler/icons-react';
import { Fragment, type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
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
        dropped: index === 0 ? null : steps[index - 1].users - step.users,
        dropRate:
            index === 0
                ? null
                : 100 - shareOf(step.users, steps[index - 1].users),
    }));
};

type Step = ReturnType<typeof aggregateSteps>[number];

/** Total conversion and the step that lost the most users, as one line. */
const Headline: FC<{ steps: Step[] }> = ({ steps }) => {
    const getUiString = useUiStrings();
    const first = steps[0];
    const last = steps[steps.length - 1];
    const largestDrop = steps.reduce<Step | null>(
        (worst, step) =>
            step.dropRate !== null &&
            (worst === null || step.dropRate > (worst.dropRate ?? 0))
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
                          percent: `−${(largestDrop.dropRate ?? 0).toFixed(1)}`,
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

/**
 * One row per step: number, name, share of step 1 as a bar (the lighter
 * remainder is the drop-off), users, share. The users lost sit between rows.
 */
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
            <Box className={styles.rows}>
                {steps.map((step, index) => (
                    <Fragment key={step.stepOrder}>
                        {step.dropped !== null && step.dropRate !== null && (
                            <Group
                                gap={4}
                                wrap="nowrap"
                                className={styles.drop}
                                data-testid="funnel-strip-drop"
                            >
                                <MantineIcon
                                    icon={IconArrowDown}
                                    size={12}
                                    color="ldGray.5"
                                    aria-hidden
                                />
                                <Text span inherit>
                                    {interpolateUiString(
                                        getUiString(
                                            'aiAgent.composer.funnelNode.strip.droppedOff',
                                        ),
                                        {
                                            users: step.dropped.toLocaleString(),
                                            percent: step.dropRate.toFixed(1),
                                        },
                                    )}
                                </Text>
                            </Group>
                        )}
                        <Box
                            className={styles.row}
                            data-testid="funnel-strip-step"
                        >
                            <Box className={styles.circle}>{index + 1}</Box>
                            <Text fz="xs" fw={600} truncate>
                                {friendlyName(step.stepName)}
                            </Text>
                            <Box className={styles.track}>
                                <Box
                                    className={styles.fill}
                                    w={`${step.shareOfFirst}%`}
                                />
                            </Box>
                            <Text fz="xs" fw={600} className={styles.number}>
                                {step.users.toLocaleString()}
                            </Text>
                            <Text fz="xs" c="dimmed" className={styles.number}>
                                {percent(step.shareOfFirst)}
                            </Text>
                        </Box>
                    </Fragment>
                ))}
            </Box>
        </Stack>
    );
};
