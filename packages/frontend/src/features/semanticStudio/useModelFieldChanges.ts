import { getItemId, type Explore } from '@lightdash/common';
import { useMemo } from 'react';
import {
    DEVELOPMENT_PREVIEW_HEADER,
    DEVELOPMENT_VIEW_HEADER,
} from './developmentView';
import { diffModelFields, type FieldChange } from './modelFieldDiff';
import { useModelVersion } from './useFieldChangesInDevelopment';
import { type TriedFields } from './useTryInExplore';

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

/** The fields to select when trying a model's changes in Explore; null until they are known. */
export const useTriedFields = (
    projectUuid: string,
    model: string,
    previewProjectUuid: string | null,
): TriedFields | null => {
    const { mine, changes } = useModelFieldChanges(
        projectUuid,
        model,
        previewProjectUuid,
    );
    return useMemo(() => {
        if (!mine || !changes) return null;
        const fields = [...findChangedFieldIds(mine, changes).values()];
        return {
            dimensions: fields.filter((f) => !f.isMetric).map((f) => f.id),
            metrics: fields.filter((f) => f.isMetric).map((f) => f.id),
        };
    }, [mine, changes]);
};
