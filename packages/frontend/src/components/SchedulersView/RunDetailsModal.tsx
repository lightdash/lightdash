import {
    SchedulerFormat,
    SchedulerJobStatus,
    type PartialFailure,
    type SchedulerRun,
    type SchedulerRunLog,
} from '@lightdash/common';
import {
    Box,
    Center,
    Code,
    Divider,
    Group,
    Loader,
    Modal,
    Stack,
    Text,
    useMantineTheme,
    type MantineTheme,
} from '@mantine-8/core';
import {
    IconAlertTriangleFilled,
    IconChartBar,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import {
    formatTaskName,
    formatTime,
    getLogStatusIconWithoutTooltip,
    getSchedulerIcon,
} from './SchedulersViewUtils';

type JobSummary = {
    jobId: string;
    task: string;
    targetType: SchedulerRunLog['targetType'];
    target: SchedulerRunLog['target'];
    startedAt: Date | null;
    completedAt: Date | null;
    finalStatus: SchedulerRunLog['status'];
    errorDetails: string | null;
};

type RunDetailsModalProps = {
    opened: boolean;
    onClose: () => void;
    run: SchedulerRun | null;
    childLogs: SchedulerRunLog[] | undefined;
    isLoading: boolean;
    getSlackChannelName: (channelId: string) => string | null;
};

// Helper to format time only (no date)
const formatTimeOnly = (date: Date): string => {
    return dayjs(date).format('hh:mm A');
};

// Helper to pluralize a word based on count
const pluralize = (count: number, singular: string, plural?: string): string =>
    count === 1 ? singular : plural ?? `${singular}s`;

// Helper to build job status summary text
const buildJobStatusSummary = (
    completedCount: number,
    errorCount: number,
    partialFailureCount: number,
): string => {
    const parts: string[] = [];

    if (completedCount > 0) {
        parts.push(
            `${completedCount} ${pluralize(completedCount, 'job')} completed`,
        );
    }
    if (errorCount > 0) {
        parts.push(`${errorCount} ${pluralize(errorCount, 'job')} failed`);
    }
    if (partialFailureCount > 0) {
        parts.push(
            `${partialFailureCount} ${pluralize(
                partialFailureCount,
                'chart',
            )} failed to export`,
        );
    }

    return parts.join(', ');
};

// Helper to format duration between two dates
const formatDuration = (start: Date, end: Date): string => {
    const durationSeconds = dayjs(end).diff(dayjs(start), 'second');

    if (durationSeconds < 1) {
        return '<1s';
    } else if (durationSeconds < 60) {
        return `${durationSeconds}s`;
    } else {
        const minutes = Math.floor(durationSeconds / 60);
        const seconds = durationSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
};

// Component for job timing display
const JobTimingInfo: FC<{
    startedAt: Date | null;
    completedAt: Date | null;
    status: SchedulerJobStatus;
}> = ({ startedAt, completedAt, status }) => {
    const endLabel =
        status === SchedulerJobStatus.ERROR ? 'failed' : 'completed';

    return (
        <Group gap="md" wrap="nowrap" w={240}>
            <Stack gap={4}>
                <Text fz="xs" c="ldGray.6">
                    started
                </Text>
                <Text fz="xs" style={{ whiteSpace: 'nowrap' }}>
                    {startedAt ? formatTimeOnly(startedAt) : '-'}
                </Text>
            </Stack>
            <Stack gap={4}>
                <Text fz="xs" c="ldGray.6">
                    {endLabel}
                </Text>
                <Text fz="xs" style={{ whiteSpace: 'nowrap' }}>
                    {completedAt ? formatTimeOnly(completedAt) : '-'}
                </Text>
            </Stack>
            <Stack gap={4}>
                <Text fz="xs" c="ldGray.6">
                    duration
                </Text>
                <Text fz="xs" style={{ whiteSpace: 'nowrap' }}>
                    {startedAt && completedAt
                        ? formatDuration(startedAt, completedAt)
                        : '-'}
                </Text>
            </Stack>
        </Group>
    );
};

// Unified component for job rows (success, failure, partial failure)
const JobRow: FC<{
    job: JobSummary;
    run: SchedulerRun;
    theme: MantineTheme;
    partialFailures?: PartialFailure[];
    getTargetDisplayName: (
        target: string | null,
        targetType: SchedulerRunLog['targetType'],
    ) => string | null;
    getFormatDisplayName: (format: SchedulerFormat) => string;
}> = ({
    job,
    run,
    theme,
    partialFailures = [],
    getTargetDisplayName,
    getFormatDisplayName,
}) => {
    const isError = job.finalStatus === SchedulerJobStatus.ERROR;
    const isPartialFailure =
        job.task === 'handleScheduledDelivery' &&
        job.finalStatus === SchedulerJobStatus.COMPLETED &&
        partialFailures.length > 0;
    const hasDetails = isError || isPartialFailure;

    // Determine status icon
    const statusIcon = isPartialFailure ? (
        <MantineIcon
            icon={IconAlertTriangleFilled}
            color="orange.6"
            style={{ color: theme.colors.orange[6] }}
        />
    ) : (
        getLogStatusIconWithoutTooltip(job.finalStatus, theme)
    );

    // Determine status message
    const statusMessage = isError ? (
        <Text fz="xs" c="red.7">
            Job failed
        </Text>
    ) : isPartialFailure ? (
        <Text fz="xs" c="orange.7">
            Completed with {partialFailures.length} failing chart
            {partialFailures.length > 1 ? 's' : ''}
        </Text>
    ) : (
        <Text fz="xs" c="green.7">
            Completed successfully
        </Text>
    );

    // Subtitle: format for handleScheduledDelivery, target for others
    const subtitle =
        job.task === 'handleScheduledDelivery'
            ? run && (
                  <Text fz="xs" c="ldGray.6">
                      {`Generate ${getFormatDisplayName(run.format)}`}
                  </Text>
              )
            : job.target && (
                  <Text fz="xs" c="ldGray.6">
                      {getTargetDisplayName(job.target, job.targetType)}
                  </Text>
              );

    const mainContent = (
        <Group
            gap="md"
            wrap="nowrap"
            align={hasDetails ? 'flex-start' : undefined}
        >
            {statusIcon}
            <Stack gap={4} style={{ flex: 1 }}>
                <Box>
                    <Text fz="sm" fw={500}>
                        {formatTaskName(job.task)}
                    </Text>
                    {subtitle}
                </Box>
                {statusMessage}
            </Stack>
            <JobTimingInfo
                startedAt={job.startedAt}
                completedAt={job.completedAt}
                status={job.finalStatus}
            />
        </Group>
    );

    // Simple row for success case (no details below)
    if (!hasDetails) {
        return (
            <Box
                p="sm"
                style={{
                    borderRadius: theme.radius.sm,
                    border: `1px solid ${theme.colors.ldGray[2]}`,
                }}
            >
                {mainContent}
            </Box>
        );
    }

    // Stack layout for error/partial failure cases (with details below)
    return (
        <Stack
            gap="sm"
            p="sm"
            style={{
                borderRadius: theme.radius.sm,
                border: `1px solid ${theme.colors.ldGray[2]}`,
            }}
        >
            {mainContent}
            {isError && job.errorDetails && (
                <Code block c="red.9" bg="red.0" style={{ fontSize: '11px' }}>
                    {job.errorDetails}
                </Code>
            )}
            {isPartialFailure && (
                <Stack gap="xs">
                    {partialFailures.map((failure) => (
                        <Stack
                            key={failure.tileUuid}
                            gap={4}
                            p="xs"
                            style={{
                                borderRadius: theme.radius.sm,
                                backgroundColor: theme.colors.orange[0],
                            }}
                        >
                            <Text fz="xs" fw={500} c="orange.9">
                                {failure.chartName}
                            </Text>
                            <Code
                                c="orange.9"
                                bg="transparent"
                                style={{ fontSize: '11px', padding: 0 }}
                            >
                                {failure.error}
                            </Code>
                        </Stack>
                    ))}
                </Stack>
            )}
        </Stack>
    );
};

// Component for job status summary header
const JobStatusSummaryHeader: FC<{
    completedCount: number;
    errorCount: number;
    totalCount: number;
    partialFailureCount: number;
    theme: MantineTheme;
}> = ({
    completedCount,
    errorCount,
    totalCount,
    partialFailureCount,
    theme,
}) => {
    const allSuccessful =
        errorCount === 0 && completedCount > 0 && partialFailureCount === 0;
    const allFailed = completedCount === 0 && errorCount > 0;
    const hasPartialIssues = errorCount > 0 || partialFailureCount > 0;

    if (allSuccessful) {
        return (
            <>
                {getLogStatusIconWithoutTooltip(
                    SchedulerJobStatus.COMPLETED,
                    theme,
                )}
                <Text fz="sm" fw={600}>
                    {completedCount} {pluralize(completedCount, 'job')}{' '}
                    completed successfully
                </Text>
            </>
        );
    }

    if (allFailed) {
        return (
            <>
                {getLogStatusIconWithoutTooltip(
                    SchedulerJobStatus.ERROR,
                    theme,
                )}
                <Text fz="sm" fw={600}>
                    All jobs failed
                </Text>
            </>
        );
    }

    if (hasPartialIssues) {
        return (
            <>
                <MantineIcon
                    icon={IconAlertTriangleFilled}
                    color="orange.6"
                    style={{ color: theme.colors.orange[6] }}
                />
                <Text fz="sm" fw={600}>
                    {buildJobStatusSummary(
                        completedCount,
                        errorCount,
                        partialFailureCount,
                    )}
                </Text>
            </>
        );
    }

    return (
        <Text fz="sm" fw={600}>
            Jobs ({totalCount})
        </Text>
    );
};

const RunDetailsModal: FC<RunDetailsModalProps> = ({
    opened,
    onClose,
    run,
    childLogs,
    isLoading,
    getSlackChannelName,
}) => {
    const theme = useMantineTheme();

    // Helper to format SchedulerFormat enum
    const getFormatDisplayName = (format: SchedulerFormat): string => {
        switch (format) {
            case SchedulerFormat.CSV:
                return 'CSV';
            case SchedulerFormat.XLSX:
                return 'Excel';
            case SchedulerFormat.IMAGE:
                return 'Image';
            case SchedulerFormat.GSHEETS:
                return 'Google Sheets';
            default:
                return format;
        }
    };

    // Helper to get friendly target name
    const getTargetDisplayName = (
        target: string | null,
        targetType: SchedulerRunLog['targetType'],
    ): string | null => {
        if (!target) return null;

        // For Slack, try to map ID to channel name
        if (targetType === 'slack') {
            return getSlackChannelName(target) || target;
        }

        // For other types, return as-is
        return target;
    };

    // Group logs by jobId and extract start/end times
    const jobSummaries = useMemo<JobSummary[]>(() => {
        if (!childLogs) return [];

        // Group by jobId
        const jobsMap = new Map<string, SchedulerRunLog[]>();
        childLogs.forEach((log) => {
            if (!jobsMap.has(log.jobId)) {
                jobsMap.set(log.jobId, []);
            }
            jobsMap.get(log.jobId)!.push(log);
        });

        // Create summary for each job
        return Array.from(jobsMap.entries())
            .map(([jobId, logs]): JobSummary => {
                // Find started event
                const startedLog = logs.find(
                    (log) => log.status === SchedulerJobStatus.STARTED,
                );

                // Find completed or error event (final status)
                const completedLog = logs.find(
                    (log) =>
                        log.status === SchedulerJobStatus.COMPLETED ||
                        log.status === SchedulerJobStatus.ERROR,
                );

                // Get target info from started log (or first log with target, or first log)
                const logWithTarget =
                    startedLog ||
                    logs.find((log) => log.target !== null) ||
                    logs[0];

                return {
                    jobId,
                    task: logWithTarget.task,
                    targetType: logWithTarget.targetType,
                    target: logWithTarget.target,
                    startedAt: startedLog
                        ? new Date(startedLog.createdAt)
                        : null,
                    completedAt: completedLog
                        ? new Date(completedLog.createdAt)
                        : null,
                    finalStatus: completedLog
                        ? completedLog.status
                        : logWithTarget.status,
                    errorDetails:
                        completedLog?.status === SchedulerJobStatus.ERROR
                            ? (completedLog.details?.error as string) || null
                            : null,
                };
            })
            .sort((a, b) => {
                // Sort by start time, or createdAt if no start time
                const aTime = a.startedAt ? a.startedAt.getTime() : 0;
                const bTime = b.startedAt ? b.startedAt.getTime() : 0;
                return aTime - bTime;
            });
    }, [childLogs]);

    // Calculate job status summary based on jobSummaries
    const jobStatusSummary = useMemo(() => {
        const completedCount = jobSummaries.filter(
            (job) => job.finalStatus === SchedulerJobStatus.COMPLETED,
        ).length;
        const errorCount = jobSummaries.filter(
            (job) => job.finalStatus === SchedulerJobStatus.ERROR,
        ).length;

        return { completedCount, errorCount, totalCount: jobSummaries.length };
    }, [jobSummaries]);

    // Extract partial failures from the parent job's completed log details
    const partialFailures = useMemo<PartialFailure[]>(() => {
        if (!childLogs) return [];

        // Find the parent job's completed log (handleScheduledDelivery task)
        const parentCompletedLog = childLogs.find(
            (log) =>
                log.isParent &&
                log.task === 'handleScheduledDelivery' &&
                log.status === SchedulerJobStatus.COMPLETED,
        );

        if (!parentCompletedLog?.details?.partialFailures) return [];

        return parentCompletedLog.details.partialFailures as PartialFailure[];
    }, [childLogs]);

    if (!run) return null;

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group gap="sm">
                    {getSchedulerIcon(run)}
                    <Text fw={600}>{run.schedulerName}</Text>
                </Group>
            }
            size="lg"
        >
            <Stack gap="lg">
                {/* Run metadata */}
                <Stack gap="xs">
                    <Group gap="xl">
                        <Box>
                            <Group gap={4}>
                                <MantineIcon
                                    icon={
                                        run.resourceType === 'chart'
                                            ? IconChartBar
                                            : IconLayoutDashboard
                                    }
                                    size="sm"
                                    color="ldGray.6"
                                />
                                <Text fz="xs" c="ldGray.6">
                                    {run.resourceType === 'chart'
                                        ? 'Chart'
                                        : 'Dashboard'}
                                </Text>
                            </Group>
                            <Text fz="sm" fw={500}>
                                {run.resourceName}
                            </Text>
                        </Box>
                        <Box>
                            <Text fz="xs" c="ldGray.6">
                                Created by
                            </Text>
                            <Text fz="sm" fw={500}>
                                {run.createdByUserName}
                            </Text>
                        </Box>
                    </Group>
                    <Group gap="xl">
                        <Box>
                            <Text fz="xs" c="ldGray.6">
                                Scheduled
                            </Text>
                            <Text fz="sm" fw={500}>
                                {formatTime(run.scheduledTime)}
                            </Text>
                        </Box>
                        <Box>
                            <Text fz="xs" c="ldGray.6">
                                Started
                            </Text>
                            <Text fz="sm" fw={500}>
                                {formatTime(run.createdAt)}
                            </Text>
                        </Box>
                    </Group>
                </Stack>

                <Divider />

                {/* Jobs */}
                <Box>
                    <Group gap="xs" mb="md">
                        <JobStatusSummaryHeader
                            completedCount={jobStatusSummary.completedCount}
                            errorCount={jobStatusSummary.errorCount}
                            totalCount={jobStatusSummary.totalCount}
                            partialFailureCount={partialFailures.length}
                            theme={theme}
                        />
                    </Group>
                    {isLoading ? (
                        <Center p="xl">
                            <Loader size="md" />
                        </Center>
                    ) : jobSummaries.length > 0 ? (
                        <Stack gap="xs">
                            {jobSummaries.map((job) => (
                                <JobRow
                                    key={job.jobId}
                                    job={job}
                                    run={run}
                                    theme={theme}
                                    partialFailures={partialFailures}
                                    getTargetDisplayName={getTargetDisplayName}
                                    getFormatDisplayName={getFormatDisplayName}
                                />
                            ))}
                        </Stack>
                    ) : (
                        <Text fz="sm" c="ldGray.6">
                            No jobs found
                        </Text>
                    )}
                </Box>
            </Stack>
        </Modal>
    );
};

export default RunDetailsModal;
