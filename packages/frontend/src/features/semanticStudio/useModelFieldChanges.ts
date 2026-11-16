import { getItemId, type Explore } from '@lightdash/common';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import {
    DEVELOPMENT_PREVIEW_HEADER,
    DEVELOPMENT_VIEW_HEADER,
} from './developmentView';
import { diffModelFields, type FieldChange } from './modelFieldDiff';
import {
    modelVersionQuery,
    useModelVersion,
} from './useFieldChangesInDevelopment';

export const developmentHeadersFor = (previewProjectUuid: string | null) => ({
    [DEVELOPMENT_VIEW_HEADER]: 'true',
    ...(previewProjectUuid
        ? { [DEVELOPMENT_PREVIEW_HEADER]: previewProjectUuid }
        : {}),
});

/** A model live and with the person's changes, and what differs; changes is null until both are read. */
export const useModelFieldChanges = (
    projectUuid: string,
    model: string,
    previewProjectUuid: string | null,
) => {
    const live = useModelVersion(projectUuid, model, {
        [DEVELOPMENT_VIEW_HEADER]: 'false',
    });
    const mine = useModelVersion(
        projectUuid,
        model,
        developmentHeadersFor(previewProjectUuid),
    );
    const changes = useMemo(
        () =>
            // A model that is new has no live version to read.
            mine.data && (live.data || live.isError)
                ? diffModelFields(live.data ?? null, mine.data)
                : null,
        [live.data, live.isError, mine.data],
    );
    return { live: live.data ?? null, mine: mine.data ?? null, changes };
};

/** Explore's id of each field a change adds or redefines, by its `table.name` key. */
export const findChangedFieldIds = (
    mine: Explore,
    changes: FieldChange[],
): Map<string, { id: string; isMetric: boolean }> => {
    const table = mine.tables[mine.baseTable];
    const ids = new Map<string, { id: string; isMetric: boolean }>();
    if (!table) return ids;
    changes.forEach(({ key, kind }) => {
        const name = key.slice(table.name.length + 1);
        const metric = kind === 'removed' ? undefined : table.metrics[name];
        const dimension =
            kind === 'removed' ? undefined : table.dimensions[name];
        if (metric) ids.set(key, { id: getItemId(metric), isMetric: true });
        else if (dimension && !dimension.hidden) {
            ids.set(key, { id: getItemId(dimension), isMetric: false });
        }
    });
    return ids;
};

/** A field a change touches, as Explore names it; a removed one is named from the live version. */
export type ChangedField = FieldChange & { fieldId: string; isMetric: boolean };

const describeChangedFields = (
    live: Explore | null,
    mine: Explore,
): ChangedField[] =>
    diffModelFields(live, mine).flatMap((change) => {
        const source = change.kind === 'removed' ? live : mine;
        const table = source?.tables[source.baseTable];
        if (!table) return [];
        const name = change.key.slice(table.name.length + 1);
        const metric = table.metrics[name];
        const field = metric ?? table.dimensions[name];
        if (!field || field.hidden) return [];
        return [{ ...change, fieldId: getItemId(field), isMetric: !!metric }];
    });

/** What each changed model's fields become, by model; null until every model's versions are read. */
export const useChangeSet = (
    projectUuid: string,
    models: string[],
    previewProjectUuid: string | null,
): Map<string, ChangedField[]> | null => {
    const lightdashApi = useLightdashApi();
    const sides = useQueries({
        queries: models.flatMap((model) => [
            modelVersionQuery(lightdashApi, projectUuid, model, {
                [DEVELOPMENT_VIEW_HEADER]: 'false',
            }),
            modelVersionQuery(
                lightdashApi,
                projectUuid,
                model,
                developmentHeadersFor(previewProjectUuid),
            ),
        ]),
    });
    if (sides.some(({ isLoading }) => isLoading)) return null;
    return new Map(
        models.map((model, index) => {
            const mine = sides[index * 2 + 1].data;
            // A model that is new has no live version to read.
            const live = sides[index * 2].data ?? null;
            return [model, mine ? describeChangedFields(live, mine) : []];
        }),
    );
};
