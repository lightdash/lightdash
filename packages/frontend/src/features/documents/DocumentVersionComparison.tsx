import { assertUnreachable, type DocumentContent } from '@lightdash/common';
import { Badge, Box, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { type TFunction } from 'i18next';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './DocumentVersionComparison.module.css';
import {
    diffDocumentVersions,
    UNSUPPORTED_CHART_NAME,
    withContext,
    type DocumentChartChange,
    type DocumentLineChange,
} from './documentVersionDiff';

const LINE_MARKERS: Record<DocumentLineChange['type'], string> = {
    added: '+',
    removed: '−',
    unchanged: ' ',
};

// Diff part identifiers from documentVersionDiff mapped to translation keys
const PART_KEYS: Record<string, string> = {
    Title: 'title',
    Description: 'description',
    Explore: 'explore',
    'Chart type': 'chartType',
    Dimensions: 'dimensions',
    Metrics: 'metrics',
    Filters: 'filters',
    Sorts: 'sorts',
    'Row limit': 'rowLimit',
    'Table calculations': 'tableCalculations',
    'Custom fields': 'customFields',
    Visualization: 'visualization',
    'Table settings': 'tableSettings',
    Parameters: 'parameters',
    Merge: 'merge',
    'Query settings': 'querySettings',
    SQL: 'sql',
    Connection: 'connection',
    'Query source': 'querySource',
    'Chart definition': 'chartDefinition',
};

const partLabel = (t: TFunction, part: string): string => {
    const key = PART_KEYS[part];
    return key ? t(`versionComparison.parts.${key}`) : part;
};

const chartName = (t: TFunction, name: string): string =>
    name === UNSUPPORTED_CHART_NAME
        ? t('versionComparison.unsupportedChartName')
        : name;

const TextChanges: FC<{ lines: DocumentLineChange[] }> = ({ lines }) => {
    const { t } = useTranslation('documents');
    if (lines.every((line) => line.type === 'unchanged')) {
        return <Text c="dimmed">{t('versionComparison.noTextChanges')}</Text>;
    }
    return (
        <Box
            className={styles.lines}
            role="list"
            aria-label={t('versionComparison.textChanges')}
        >
            {withContext(lines).map((line, index) =>
                line.kind === 'skipped' ? (
                    <Box key={index} className={styles.skipped} role="listitem">
                        {t('versionComparison.unchangedLines', {
                            count: line.count,
                        })}
                    </Box>
                ) : (
                    <Box
                        key={index}
                        className={styles.line}
                        data-type={line.type}
                        role="listitem"
                        aria-label={t(`versionComparison.line.${line.type}`, {
                            text: line.text,
                        })}
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
    t: TFunction,
    change: DocumentChartChange,
): { label: string; color: string } => {
    switch (change.kind) {
        case 'added':
            return {
                label: t('versionComparison.status.added'),
                color: 'green',
            };
        case 'removed':
            return {
                label: t('versionComparison.status.removed'),
                color: 'red',
            };
        case 'changed':
            return {
                label: t('versionComparison.status.changed'),
                color: 'yellow',
            };
        case 'unchanged':
            return {
                label: t('versionComparison.status.moved'),
                color: 'blue',
            };
        default:
            return assertUnreachable(change.kind, 'Unknown chart change');
    }
};

const chartDetails = (t: TFunction, change: DocumentChartChange): string[] => [
    ...(change.changedParts.length > 0
        ? [
              t('versionComparison.changedParts', {
                  parts: change.changedParts
                      .map((part) => partLabel(t, part))
                      .join(', '),
              }),
          ]
        : []),
    ...(change.moved
        ? [
              t('versionComparison.movedPosition', {
                  from: change.beforePosition,
                  to: change.afterPosition,
              }),
          ]
        : []),
];

const ChartChanges: FC<{ charts: DocumentChartChange[] }> = ({ charts }) => {
    const { t } = useTranslation('documents');
    const changes = charts.filter(
        (change) => change.kind !== 'unchanged' || change.moved,
    );
    const unchangedCount = charts.length - changes.length;
    return (
        <Stack gap="xs">
            {changes.length === 0 && (
                <Text c="dimmed">
                    {charts.length === 0
                        ? t('versionComparison.noCharts')
                        : t('versionComparison.noChartChanges')}
                </Text>
            )}
            {changes.map((change, index) => {
                const status = chartStatus(t, change);
                const name = chartName(t, change.name);
                return (
                    <Paper
                        key={`${change.name}-${index}`}
                        p="sm"
                        aria-label={t('versionComparison.chartAriaLabel', {
                            status: status.label,
                            name,
                        })}
                    >
                        <Group gap="sm" wrap="nowrap">
                            <Badge color={status.color}>{status.label}</Badge>
                            <Stack gap={2} miw={0}>
                                <Text fw={500} truncate>
                                    {name}
                                </Text>
                                {chartDetails(t, change).map((detail) => (
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
                    {t('versionComparison.unchangedCharts', {
                        count: unchangedCount,
                    })}
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
    const { t } = useTranslation('documents');
    const diff = useMemo(
        () => diffDocumentVersions(before, after),
        [before, after],
    );
    return (
        <Stack gap="xl">
            <Text c="dimmed">{description}</Text>
            {!diff.hasChanges ? (
                <Text>{t('versionComparison.sameContent')}</Text>
            ) : (
                <>
                    <Stack gap="sm">
                        <Title order={3}>{t('versionComparison.text')}</Title>
                        <TextChanges lines={diff.text} />
                    </Stack>
                    <Stack gap="sm">
                        <Title order={3}>{t('versionComparison.charts')}</Title>
                        <ChartChanges charts={diff.charts} />
                    </Stack>
                </>
            )}
        </Stack>
    );
};

export default DocumentVersionComparison;
