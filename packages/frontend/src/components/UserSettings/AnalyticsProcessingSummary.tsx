import { type AnalyticsProcessingStatus } from '@lightdash/common';
import { Badge, Group, Stack, Text, Tooltip } from '@mantine/core';
import classes from './AnalyticsProcessingSummary.module.css';

const statusPresentation: Record<
    AnalyticsProcessingStatus['status'],
    { label: string; color: string }
> = {
    running: { label: 'Running', color: 'blue' },
    success: { label: 'Completed', color: 'green' },
    partial: { label: 'Partial', color: 'yellow' },
    failed: { label: 'Failed', color: 'red' },
};

const formatTime = (timestamp: string) =>
    `${new Date(timestamp).toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
    })} UTC`;

const AnalyticsProcessingSummary = ({
    processing,
    compact = false,
}: {
    processing: AnalyticsProcessingStatus | null | undefined;
    compact?: boolean;
}) => {
    if (!processing)
        return (
            <Text fz="xs" c="dimmed">
                {processing === null
                    ? 'No processing run recorded'
                    : 'Processing status unavailable'}
            </Text>
        );

    const stale =
        processing.status === 'running' &&
        Date.now() - new Date(processing.startedAt).getTime() >
            4 * 60 * 60 * 1000;
    const { stats } = processing;
    const historyPending =
        processing.status === 'partial' &&
        stats.partitionsFailed === 0 &&
        stats.dimensionsFailed === 0 &&
        stats.userPartitionsFailed === 0;
    const presentation = stale
        ? { label: 'Status unavailable', color: 'gray' }
        : historyPending
          ? { label: 'More data pending', color: 'blue' }
          : statusPresentation[processing.status];
    const details = [
        stats.partitionsCompacted > 0 &&
            `Compacted partitions: ${stats.partitionsCompacted}.`,
        stats.partitionsFailed > 0 &&
            `Failed compaction partitions: ${stats.partitionsFailed}.`,
        stats.partitionsDiscovered >
            stats.partitionsCompacted + stats.partitionsFailed &&
            `Pending compaction partitions: ${stats.partitionsDiscovered - stats.partitionsCompacted - stats.partitionsFailed}.`,
        stats.dimensionsFailed > 0 &&
            `Failed inventory refreshes: ${stats.dimensionsFailed}.`,
        stats.userPartitionsFailed > 0 &&
            `Failed People partitions: ${stats.userPartitionsFailed}.`,
        stats.userPartitionsDeferred > 0 &&
            `Deferred People partitions: ${stats.userPartitionsDeferred}.`,
        stats.limitReached && 'Processing work limit reached.',
    ]
        .filter(Boolean)
        .join(' ');
    const tooltip = stale
        ? `Started ${formatTime(processing.startedAt)}. No completion was recorded within four hours; check scheduler logs.`
        : [
              processing.status === 'partial' &&
                  'Some data was processed, but the refresh is incomplete.',
              processing.status !== 'success' &&
                  (processing.finishedAt
                      ? `Finished ${formatTime(processing.finishedAt)}.`
                      : `Started ${formatTime(processing.startedAt)}.`),
              details,
          ]
              .filter(Boolean)
              .join(' ');

    if (compact) {
        return (
            <Group
                gap="xs"
                role="status"
                aria-label="Analytics processing status"
            >
                <Badge
                    variant="dot"
                    color={presentation.color}
                    className={classes.compactStatus}
                >
                    {processing.lastSuccessfulAt
                        ? `Last updated ${formatTime(processing.lastSuccessfulAt)}`
                        : 'Preparing your analytics'}
                </Badge>
                {processing.status !== 'success' && (
                    <Text fz="xs" c="dimmed">
                        {presentation.label}
                    </Text>
                )}
            </Group>
        );
    }

    return (
        <Stack gap="xs" role="status" aria-label="Analytics processing status">
            <Group gap="sm">
                <Text fz="xs" c="dimmed">
                    Last success:{' '}
                    {processing.lastSuccessfulAt
                        ? formatTime(processing.lastSuccessfulAt)
                        : 'No successful refresh yet'}
                </Text>
                <Tooltip
                    label={tooltip}
                    disabled={!tooltip}
                    multiline
                    maw={360}
                    events={{ hover: true, focus: true, touch: true }}
                >
                    <Badge
                        color={presentation.color}
                        tabIndex={tooltip ? 0 : undefined}
                    >
                        Latest run: {presentation.label}
                    </Badge>
                </Tooltip>
            </Group>
            {(processing.status === 'running' || historyPending) && !stale && (
                <Text fz="xs" c="dimmed">
                    Recent activity is prepared first. You can explore available
                    data while older history is added in background batches.
                </Text>
            )}
        </Stack>
    );
};

export default AnalyticsProcessingSummary;
