import { SchedulerJobStatus } from '@lightdash/common';
import { Progress, Text } from '@mantine-8/core';
import { type FC } from 'react';
import { type TrackedJob } from './types';

type Props = {
    jobs: TrackedJob[];
    label: string | null;
};

const JobProgressToastBody: FC<Props> = ({ jobs, label }) => {
    const completedCount = jobs.filter(
        (j) =>
            j.status === SchedulerJobStatus.COMPLETED ||
            j.status === SchedulerJobStatus.ERROR,
    ).length;

    const erroredCount = jobs.filter(
        (j) => j.status === SchedulerJobStatus.ERROR,
    ).length;

    const successCount = completedCount - erroredCount;
    const allDone = completedCount === jobs.length;

    if (jobs.length === 1) {
        if (allDone && erroredCount === 0) {
            return <Text fz="xs">{label ?? 'Job'} completed</Text>;
        }
        if (allDone && erroredCount > 0) {
            return (
                <Text fz="xs" c="red">
                    {label ?? 'Job'} failed
                </Text>
            );
        }
        return <Text fz="xs">{label ?? 'Job'} in progress...</Text>;
    }

    const progressPct =
        jobs.length > 0 ? (successCount / jobs.length) * 100 : 0;
    const errorPct = jobs.length > 0 ? (erroredCount / jobs.length) * 100 : 0;

    return (
        <>
            {label && (
                <Text fz="xs" ff="monospace" mb={4}>
                    {label}
                </Text>
            )}
            <Text fz="xs" mb={4}>
                {completedCount} of {jobs.length} completed
            </Text>
            <Progress.Root size="sm">
                <Progress.Section value={progressPct} color="green" />
                {erroredCount > 0 && (
                    <Progress.Section value={errorPct} color="red" />
                )}
            </Progress.Root>
            {erroredCount > 0 && (
                <Text fz="xs" c="red" mt={4}>
                    {erroredCount} job{erroredCount === 1 ? '' : 's'} failed
                </Text>
            )}
        </>
    );
};

export default JobProgressToastBody;
