import { assertUnreachable, type DocumentContent } from '@lightdash/common';
import { Badge, Box, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useMemo, type FC } from 'react';
import styles from './DocumentVersionComparison.module.css';
import {
    diffDocumentVersions,
    withContext,
    type DocumentChartChange,
    type DocumentLineChange,
} from './documentVersionDiff';

const LINE_MARKERS: Record<DocumentLineChange['type'], string> = {
    added: '+',
    removed: '−',
    unchanged: ' ',
};

const TextChanges: FC<{ lines: DocumentLineChange[] }> = ({ lines }) => {
    if (lines.every((line) => line.type === 'unchanged')) {
        return <Text c="dimmed">No text changes.</Text>;
    }
    return (
        <Box className={styles.lines} role="list" aria-label="Text changes">
            {withContext(lines).map((line, index) =>
                line.kind === 'skipped' ? (
                    <Box key={index} className={styles.skipped} role="listitem">
                        {line.count} unchanged lines
                    </Box>
                ) : (
                    <Box
                        key={index}
                        className={styles.line}
                        data-type={line.type}
                        role="listitem"
                        aria-label={`${line.type}: ${line.text}`}
                    >
                        <Text
                            component="span"
                            inherit
                            className={styles.marker}
                            aria-hidden
                        >
                            {LINE_MARKERS[line.type]}
                        </Text>
                        <Text component="span" inherit>
                            {line.text || ' '}
                        </Text>
                    </Box>
                ),
            )}
        </Box>
    );
};

const chartStatus = (
    change: DocumentChartChange,
): { label: string; color: string } => {
    switch (change.kind) {
        case 'added':
            return { label: 'Added', color: 'green' };
        case 'removed':
            return { label: 'Removed', color: 'red' };
        case 'changed':
            return { label: 'Changed', color: 'yellow' };
        case 'unchanged':
            return { label: 'Moved', color: 'blue' };
        default:
            return assertUnreachable(change.kind, 'Unknown chart change');
    }
};

const chartDetails = (change: DocumentChartChange): string[] => [
    ...(change.changedParts.length > 0
        ? [`Changed: ${change.changedParts.join(', ')}`]
        : []),
    ...(change.moved
        ? [
              `Moved from position ${change.beforePosition} to ${change.afterPosition}`,
          ]
        : []),
];

const ChartChanges: FC<{ charts: DocumentChartChange[] }> = ({ charts }) => {
    const changes = charts.filter(
        (change) => change.kind !== 'unchanged' || change.moved,
    );
    const unchangedCount = charts.length - changes.length;
    return (
        <Stack gap="xs">
            {changes.length === 0 && (
                <Text c="dimmed">
                    {charts.length === 0 ? 'No charts.' : 'No chart changes.'}
                </Text>
            )}
            {changes.map((change, index) => {
                const status = chartStatus(change);
                return (
                    <Paper
                        key={`${change.name}-${index}`}
                        p="sm"
                        aria-label={`${status.label}: ${change.name}`}
                    >
                        <Group gap="sm" wrap="nowrap">
                            <Badge color={status.color}>{status.label}</Badge>
                            <Stack gap={2} miw={0}>
                                <Text fw={500} truncate>
                                    {change.name}
                                </Text>
                                {chartDetails(change).map((detail) => (
                                    <Text key={detail} size="xs" c="dimmed">
                                        {detail}
                                    </Text>
                                ))}
                            </Stack>
                        </Group>
                    </Paper>
                );
            })}
            {changes.length > 0 && unchangedCount > 0 && (
                <Text size="xs" c="dimmed">
                    {unchangedCount} unchanged{' '}
                    {unchangedCount === 1 ? 'chart' : 'charts'}
                </Text>
            )}
        </Stack>
    );
};

/** Read-only differences from one Document version to another. */
const DocumentVersionComparison: FC<{
    before: DocumentContent;
    after: DocumentContent;
    description: string;
}> = ({ before, after, description }) => {
    const diff = useMemo(
        () => diffDocumentVersions(before, after),
        [before, after],
    );
    return (
        <Stack gap="xl">
            <Text c="dimmed">{description}</Text>
            {!diff.hasChanges ? (
                <Text>These versions have the same content.</Text>
            ) : (
                <>
                    <Stack gap="sm">
                        <Title order={3}>Text</Title>
                        <TextChanges lines={diff.text} />
                    </Stack>
                    <Stack gap="sm">
                        <Title order={3}>Charts</Title>
                        <ChartChanges charts={diff.charts} />
                    </Stack>
                </>
            )}
        </Stack>
    );
};

export default DocumentVersionComparison;
