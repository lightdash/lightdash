import { SchedulerJobStatus } from '@lightdash/common';
import { Progress, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { type TrackedJob } from './types';

type Props = {
    jobs: TrackedJob[];
    label: string | null;
};

const JobProgressToastBody: FC<Props> = ({ jobs, label }) => {
    const { t } = useTranslation('app');
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
            return (
                <Text fz="xs">
                    {t('schedulerJobs.jobCompleted', {
                        label: label ?? t('schedulerJobs.job'),
                    })}
                </Text>
            );
        }
        if (allDone && erroredCount > 0) {
            return (
                <Text fz="xs" c="red">
                    {t('schedulerJobs.jobFailed', {
                        label: label ?? t('schedulerJobs.job'),
                    })}
                </Text>
            );
        }
        return (
            <Text fz="xs">
                {t('schedulerJobs.jobInProgress', {
                    label: label ?? t('schedulerJobs.job'),
                })}
            </Text>
        );
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
                {t('schedulerJobs.completedOf', {
                    completed: completedCount,
                    total: jobs.length,
                })}
            </Text>
            <Progress.Root size="sm">
                <Progress.Section value={progressPct} color="green" />
                {erroredCount > 0 && (
                    <Progress.Section value={errorPct} color="red" />
                )}
            </Progress.Root>
            {erroredCount > 0 && (
                <Text fz="xs" c="red" mt={4}>
                    {t('schedulerJobs.jobsFailed', { count: erroredCount })}
                </Text>
            )}
        </>
    );
};

export default JobProgressToastBody;
