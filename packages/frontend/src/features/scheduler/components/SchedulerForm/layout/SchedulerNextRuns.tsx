import { Group, Stack, Text } from '@mantine-8/core';
import { useMemo, type FC } from 'react';
import { useSchedulerFormContext } from '../schedulerFormContext';
import { getNextRuns } from './nextRuns';
import classes from './SchedulerDeliveryModal.module.css';

export const SchedulerNextRuns: FC = () => {
    const form = useSchedulerFormContext();
    const { cron, timezone } = form.values;

    const runs = useMemo(() => getNextRuns(cron, timezone), [cron, timezone]);

    if (runs.length === 0) return null;

    return (
        <div className={classes.previewNextRuns}>
            <Stack gap="xs">
                <span className={classes.previewLabel}>Next runs</span>
                <Stack gap={4}>
                    {runs.map((run) => (
                        <Group
                            key={run.label}
                            justify="space-between"
                            wrap="nowrap"
                            gap="xs"
                        >
                            <Text size="sm" fw={500} c="ldGray.7">
                                {run.label}
                            </Text>
                            <Text size="xs" c="dimmed">
                                {run.relative}
                            </Text>
                        </Group>
                    ))}
                </Stack>
                <Text size="xs" c="dimmed">
                    {timezone
                        ? `Times shown in ${timezone}`
                        : 'Times shown in project timezone'}
                </Text>
            </Stack>
        </div>
    );
};
