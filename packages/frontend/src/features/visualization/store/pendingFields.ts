import { getPendingFieldIds } from '@lightdash/visualization/editor';
import { createSelector } from '@reduxjs/toolkit';
import { inputsUnsavedMetricQuery } from './inputSelectors';

const noPendingFields = new Set<string>();
/** Fields of the query being edited that the last run may not have yet, e.g. a just-renamed table calculation */
export const selectPendingFieldIds = createSelector(
    [inputsUnsavedMetricQuery],
    (unsavedMetricQuery) =>
        getPendingFieldIds(unsavedMetricQuery) ?? noPendingFields,
);

/** Keeps a stored field the results don't have yet instead of repairing it away */
export const keepPendingField = <T extends string | null | undefined>(
    fieldId: T,
    pendingFieldIds: Set<string>,
    repair: () => T,
): T =>
    typeof fieldId === 'string' && pendingFieldIds.has(fieldId)
        ? fieldId
        : repair();
