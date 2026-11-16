import { Badge, Group, Stack, Text, Tooltip } from '@mantine/core';
import { useQueries } from '@tanstack/react-query';
import { useMemo, type FC } from 'react';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import {
    DEVELOPMENT_PREVIEW_HEADER,
    DEVELOPMENT_VIEW_HEADER,
} from './developmentView';
import { FieldUsage } from './DraftInsights';
import { describeShift } from './metricComparison';
import { findTouchedFields, type FieldChange } from './modelFieldDiff';
import { modelVersionQuery } from './useFieldChangesInDevelopment';
import { LIVE_HEADERS, useTotals } from './useMetricTotals';
import {
    developmentHeadersFor,
    findChangedFieldIds,
    useModelFieldChanges,
} from './useModelFieldChanges';
import { useSemanticLayerFieldUsage } from './useSemanticLayerModel';

const KINDS: Record<FieldChange['kind'], { label: string; color: string }> = {
    new: { label: 'New', color: 'green' },
    changed: { label: 'Changed', color: 'orange' },
    removed: { label: 'Removed', color: 'red' },
};

/** What the person's changes do to this model's fields, in plain words, with each new or changed metric's total next to it. */
export const ModelFieldChanges: FC<{
    projectUuid: string;
    model: string;
    /** The preview project that holds the changes, for a pull request that has one. */
    previewProjectUuid: string | null;
    /** The pull request's latest commit, so totals are read again after it moves. */
    cacheKey: string;
}> = ({ projectUuid, model, previewProjectUuid, cacheKey }) => {
    const { live, mine, changes } = useModelFieldChanges(
        projectUuid,
        model,
        previewProjectUuid,
    );
    const metricIds = useMemo(() => {
        if (!mine || !changes) return new Map<string, string>();
        return new Map(
            [...findChangedFieldIds(mine, changes)]
                .filter(([, { isMetric }]) => isMetric)
                .map(([key, { id }]) => [key, id]),
        );
    }, [mine, changes]);
    const ids = [...metricIds.values()];
    // Asking live for a metric it does not have fails the whole query.
    const liveIds = (changes ?? [])
        .filter(({ key, kind }) => kind === 'changed' && metricIds.has(key))
        .map(({ key }) => metricIds.get(key) ?? key);
    const after = useTotals(
        projectUuid,
        model,
        ids,
        developmentHeadersFor(previewProjectUuid),
        ids.length > 0,
        cacheKey,
    );
    const before = useTotals(
        projectUuid,
        model,
        liveIds,
        LIVE_HEADERS,
        liveIds.length > 0,
        cacheKey,
    );
    if (!changes) return null;
    if (changes.length === 0) {
        return (
            <Text fz="xs" c="dimmed">
                No field is added, changed or removed.
            </Text>
        );
    }
    const renderTotal = (key: string, kind: FieldChange['kind']) => {
        const id = metricIds.get(key);
        if (!id || after.isError) return null;
        const value = after.data?.[id];
        const old = kind === 'changed' ? before.data?.[id] : undefined;
        const shift = old && value ? describeShift(old.raw, value.raw) : null;
        return (
            <Tooltip
                label={
                    old
                        ? 'Total over every row, live and with your changes.'
                        : 'Total over every row, with your changes.'
                }
            >
                <Text fz="xs" ml="auto" flex="none" ta="right">
                    {old ? (
                        <Text span inherit c="dimmed">
                            {old.formatted} →{' '}
                        </Text>
                    ) : null}
                    {value?.formatted ?? '…'}
                    {shift ? (
                        <Text span inherit c="orange" ml={6}>
                            {shift}
                        </Text>
                    ) : null}
                </Text>
            </Tooltip>
        );
    };
    return (
        <Stack gap={6}>
            {live ? null : (
                <Text fz="xs" c="dimmed">
                    This model is new.
                </Text>
            )}
            {changes.map(({ key, label, kind, attributes }) => (
                <Group key={key} gap="xs" wrap="nowrap">
                    <Badge size="sm" color={KINDS[kind].color} flex="none">
                        {KINDS[kind].label}
                    </Badge>
                    <Text fz="xs" fw={500} truncate>
                        {label}
                    </Text>
                    {attributes.length > 0 ? (
                        <Text fz="xs" c="dimmed" truncate>
                            {attributes.join(', ')}
                        </Text>
                    ) : null}
                    {renderTotal(key, kind)}
                </Group>
            ))}
            {after.isError ? (
                <Text fz="xs" c="dimmed">
                    Could not run the totals: {after.error.error.message}
                </Text>
            ) : null}
        </Stack>
    );
};

/** Saved content that reads a field the pull request redefines or removes, looked up before it goes live. */
export const PullRequestUsage: FC<{
    projectUuid: string;
    models: string[];
    previewProjectUuid: string | null;
}> = ({ projectUuid, models, previewProjectUuid }) => {
    const lightdashApi = useLightdashApi();
    const sides = useQueries({
        queries: models.flatMap((model) => [
            modelVersionQuery(lightdashApi, projectUuid, model, {
                [DEVELOPMENT_VIEW_HEADER]: 'false',
            }),
            modelVersionQuery(lightdashApi, projectUuid, model, {
                [DEVELOPMENT_VIEW_HEADER]: 'true',
                ...(previewProjectUuid
                    ? { [DEVELOPMENT_PREVIEW_HEADER]: previewProjectUuid }
                    : {}),
            }),
        ]),
    });
    // Without both versions of every model nothing can be said about what moved.
    const touched = sides.every(({ isLoading }) => !isLoading)
        ? models.flatMap((_, index) => {
              const live = sides[index * 2].data;
              const mine = sides[index * 2 + 1].data;
              return live && mine ? findTouchedFields(live, mine) : [];
          })
        : [];
    const { data } = useSemanticLayerFieldUsage(projectUuid, touched);
    return <FieldUsage projectUuid={projectUuid} usage={data} />;
};
