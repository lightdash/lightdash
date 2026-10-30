import { type AnalyticsProcessingStatus } from '@lightdash/common';
import { Badge, Group, Text, Tooltip } from '@mantine/core';

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
}: {
    processing: AnalyticsProcessingStatus | null | undefined;
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
    const presentation = stale
        ? { label: 'Status unavailable', color: 'gray' }
        : statusPresentation[processing.status];
    const { stats } = processing;
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
              processing.finishedAt
                  ? `Finished ${formatTime(processing.finishedAt)}.`
                  : `Started ${formatTime(processing.startedAt)}.`,
              details,
          ]
              .filter(Boolean)
              .join(' ');

    return (
        <Group gap="sm" role="status" aria-label="Analytics processing status">
            <Text fz="xs" c="dimmed">
                Last success:{' '}
                {processing.lastSuccessfulAt
                    ? formatTime(processing.lastSuccessfulAt)
                    : 'No successful refresh yet'}
            </Text>
            <Tooltip
                label={tooltip}
                multiline
                maw={360}
                events={{ hover: true, focus: true, touch: true }}
            >
                <Badge color={presentation.color} tabIndex={0}>
                    Latest run: {presentation.label}
                </Badge>
            </Tooltip>
        </Group>
    );
};

export default AnalyticsProcessingSummary;
