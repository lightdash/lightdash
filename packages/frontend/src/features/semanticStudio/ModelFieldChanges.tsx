import { getItemId, type Metric } from '@lightdash/common';
import { Badge, Group, Stack, Text } from '@mantine/core';
import { useQueries } from '@tanstack/react-query';
import { useMemo, type FC } from 'react';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import {
    DEVELOPMENT_PREVIEW_HEADER,
    DEVELOPMENT_VIEW_HEADER,
} from './developmentView';
import { CompareTotals, FieldUsage } from './DraftInsights';
import { pickComparedMetrics } from './metricComparison';
import {
    diffModelFields,
    findTouchedFields,
    type FieldChange,
} from './modelFieldDiff';
import {
    modelVersionQuery,
    useModelVersion,
} from './useFieldChangesInDevelopment';
import { useSemanticLayerFieldUsage } from './useSemanticLayerModel';

const KINDS: Record<FieldChange['kind'], { label: string; color: string }> = {
    new: { label: 'New', color: 'green' },
    changed: { label: 'Changed', color: 'orange' },
    removed: { label: 'Removed', color: 'red' },
};

/** What the person's changes do to this model's fields, in plain words: added, changed with what differs, removed. */
export const ModelFieldChanges: FC<{
    projectUuid: string;
    model: string;
    /** The preview project that holds the changes, for a pull request that has one. */
    previewProjectUuid: string | null;
}> = ({ projectUuid, model, previewProjectUuid }) => {
    const live = useModelVersion(projectUuid, model, {
        [DEVELOPMENT_VIEW_HEADER]: 'false',
    });
    const mine = useModelVersion(projectUuid, model, {
        [DEVELOPMENT_VIEW_HEADER]: 'true',
        ...(previewProjectUuid
            ? { [DEVELOPMENT_PREVIEW_HEADER]: previewProjectUuid }
            : {}),
    });
    const changes = useMemo(
        () =>
            // A model that is new has no live version to read.
            mine.data && (live.data || live.isError)
                ? diffModelFields(live.data ?? null, mine.data)
                : null,
        [live.data, live.isError, mine.data],
    );
    if (!changes) return null;
    if (changes.length === 0) {
        return (
            <Text fz="xs" c="dimmed">
                No field is added, changed or removed.
            </Text>
        );
    }
    return (
        <Stack gap={6}>
            {live.data ? null : (
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
                </Group>
            ))}
        </Stack>
    );
};

/** The model's new and changed metrics as totals, live against the pull request's version. */
export const ModelTotals: FC<{
    projectUuid: string;
    model: string;
    previewProjectUuid: string | null;
    /** The pull request's latest commit, so totals are read again after it moves. */
    cacheKey: string;
}> = ({ projectUuid, model, previewProjectUuid, cacheKey }) => {
    const developmentHeaders = {
        [DEVELOPMENT_VIEW_HEADER]: 'true',
        ...(previewProjectUuid
            ? { [DEVELOPMENT_PREVIEW_HEADER]: previewProjectUuid }
            : {}),
    };
    const live = useModelVersion(projectUuid, model, {
        [DEVELOPMENT_VIEW_HEADER]: 'false',
    });
    const mine = useModelVersion(projectUuid, model, developmentHeaders);
    const compared = useMemo(() => {
        if (!mine.data || (!live.data && !live.isError)) return null;
        const table = mine.data.tables[mine.data.baseTable];
        if (!table) return null;
        const changes = diffModelFields(live.data ?? null, mine.data);
        const kindOf = (metric: Metric) =>
            changes.find(({ key }) => key === `${table.name}.${metric.name}`)
                ?.kind;
        const metrics: Metric[] = Object.values(table.metrics);
        const isNewModel = !live.data;
        const picked = pickComparedMetrics(
            metrics,
            new Set(metrics.filter(kindOf).map(({ name }) => name)),
            isNewModel,
        );
        return {
            metrics: picked,
            isNewModel,
            liveMetricIds: picked
                .filter((metric) => kindOf(metric) !== 'new')
                .map((metric) => getItemId(metric)),
        };
    }, [live.data, live.isError, mine.data]);
    if (!compared) return null;
    return (
        <CompareTotals
            projectUuid={projectUuid}
            exploreName={model}
            developmentHeaders={developmentHeaders}
            cacheKey={cacheKey}
            {...compared}
        />
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
