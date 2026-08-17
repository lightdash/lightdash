import {
    addFilterRule,
    getItemId,
    type AnyType,
    type FilterableField,
    type Filters,
    type MergeFieldOrigin,
    type QuickFilterOperator,
} from '@lightdash/common';
import { useCallback } from 'react';
import { ExplorerSection } from '../../../providers/Explorer/types';
import {
    explorerActions,
    selectFilters,
    selectIsFiltersExpanded,
    useExplorerDispatch,
    useExplorerStore,
} from '../../explorer/store';
import { PRIMARY_SOURCE_ID } from '../constants';
import { type MergeFocus } from '../context/context';
import { useMergeSafe } from '../context/useMerge';

type ApplyMergeQuickFilterArgs = {
    filtersBySourceId: Record<string, Filters>;
    field: FilterableField;
    origin: MergeFieldOrigin;
    value?: AnyType;
    timezone?: string;
    operator?: QuickFilterOperator;
    focus: MergeFocus;
};

type AppliedMergeQuickFilter = {
    filtersBySourceId: Record<string, Filters>;
    focus: MergeFocus;
};

export const applyMergeQuickFilter = ({
    filtersBySourceId,
    field,
    origin,
    value,
    timezone,
    operator,
    focus,
}: ApplyMergeQuickFilterArgs): AppliedMergeQuickFilter | null => {
    const add = (filters: Filters, targetFieldId: string) =>
        addFilterRule({
            filters,
            field,
            targetFieldId,
            value,
            timezone,
            operator,
        });

    if (origin.kind === 'source') {
        const sourceFilters = filtersBySourceId[origin.sourceId];
        if (!sourceFilters) return null;
        return {
            filtersBySourceId: {
                ...filtersBySourceId,
                [origin.sourceId]: add(sourceFilters, origin.sourceFieldId),
            },
            focus: { kind: 'source', sourceId: origin.sourceId },
        };
    }

    if (origin.kind === 'joinKey') {
        const entries = Object.entries(origin.fieldIdBySourceId);
        if (
            entries.some(
                ([sourceId]) => filtersBySourceId[sourceId] === undefined,
            )
        )
            return null;

        return {
            filtersBySourceId: {
                ...filtersBySourceId,
                ...Object.fromEntries(
                    entries.map(([sourceId, fieldId]) => [
                        sourceId,
                        add(filtersBySourceId[sourceId], fieldId),
                    ]),
                ),
            },
            focus,
        };
    }

    return null;
};

export const useMergeQuickFilter = () => {
    const merge = useMergeSafe();
    const dispatch = useExplorerDispatch();
    const store = useExplorerStore();

    const canFilter = useCallback(
        (field: FilterableField) => {
            const origin = merge?.mergeResults?.fieldOrigins[getItemId(field)];
            return origin !== undefined && origin.kind !== 'tableCalculation';
        },
        [merge?.mergeResults?.fieldOrigins],
    );

    const addFilter = useCallback(
        (
            field: FilterableField,
            value: AnyType,
            timezone?: string,
            operator?: QuickFilterOperator,
        ) => {
            if (!merge?.mergeResults) return;
            const origin = merge.mergeResults.fieldOrigins[getItemId(field)];
            if (!origin) return;

            const primaryFiltersBefore = selectFilters(store.getState());
            const filtersBySourceId = Object.fromEntries([
                [PRIMARY_SOURCE_ID, primaryFiltersBefore],
                ...merge.additionalSources.map((source) => [
                    source.id,
                    source.filters,
                ]),
            ]);
            const result = applyMergeQuickFilter({
                filtersBySourceId,
                field,
                origin,
                value,
                timezone,
                operator,
                focus: merge.focus,
            });
            if (!result) return;

            const primaryFilters = result.filtersBySourceId[PRIMARY_SOURCE_ID];
            if (primaryFilters && primaryFilters !== primaryFiltersBefore) {
                dispatch(explorerActions.setFilters(primaryFilters));
            }
            merge.additionalSources.forEach((source) => {
                const nextFilters = result.filtersBySourceId[source.id];
                if (nextFilters && nextFilters !== source.filters) {
                    merge.setSourceFilters(source.id, nextFilters);
                }
            });
            merge.setFocus(result.focus);

            if (!selectIsFiltersExpanded(store.getState())) {
                dispatch(
                    explorerActions.toggleExpandedSection(
                        ExplorerSection.FILTERS,
                    ),
                );
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        [dispatch, merge, store],
    );

    return { addFilter, canFilter };
};
