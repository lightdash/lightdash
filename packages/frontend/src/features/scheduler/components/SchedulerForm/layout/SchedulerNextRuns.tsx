import { Group, Stack, Text } from '@mantine-8/core';
import { getSchedule, stringToArray } from 'cron-converter';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useMemo, type FC } from 'react';
import { useSchedulerFormContext } from '../schedulerFormContext';
import classes from './SchedulerDeliveryModal.module.css';

dayjs.extend(relativeTime);

export const SchedulerNextRuns: FC = () => {
    const form = useSchedulerFormContext();
    const { cron, timezone } = form.values;

    const runs = useMemo(() => {
        if (!cron) return [];
        try {
            const schedule = getSchedule(
                stringToArray(cron),
                new Date(),
                timezone,
            );
            return [0, 1, 2].map(() => {
                const next = schedule.next();
                return {
                    label: next.toFormat('ccc, LLL d · h:mm a'),
                    relative: dayjs(next.toJSDate()).fromNow(),
                };
            });
        } catch {
            return [];
        }
    }, [cron, timezone]);

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
