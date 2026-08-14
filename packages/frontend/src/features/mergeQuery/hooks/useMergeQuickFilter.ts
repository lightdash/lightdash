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
import { SOURCE_A, SOURCE_B } from '../constants';
import { type MergeFocus } from '../context/context';
import { useMergeSafe } from '../context/useMerge';

type ApplyMergeQuickFilterArgs = {
    filtersA: Filters;
    filtersB: Filters;
    field: FilterableField;
    origin: MergeFieldOrigin;
    value?: AnyType;
    timezone?: string;
    operator?: QuickFilterOperator;
    focus: MergeFocus;
};

type AppliedMergeQuickFilter = {
    filtersA: Filters;
    filtersB: Filters;
    focus: MergeFocus;
};

export const applyMergeQuickFilter = ({
    filtersA,
    filtersB,
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
        if (origin.sourceId === SOURCE_A) {
            return {
                filtersA: add(filtersA, origin.sourceFieldId),
                filtersB,
                focus: SOURCE_A,
            };
        }
        if (origin.sourceId === SOURCE_B) {
            return {
                filtersA,
                filtersB: add(filtersB, origin.sourceFieldId),
                focus: SOURCE_B,
            };
        }
        return null;
    }

    if (origin.kind === 'joinKey') {
        const fieldA = origin.fieldIdBySourceId[SOURCE_A];
        const fieldB = origin.fieldIdBySourceId[SOURCE_B];
        if (!fieldA || !fieldB) return null;

        return {
            filtersA: add(filtersA, fieldA),
            filtersB: add(filtersB, fieldB),
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

            const filtersA = selectFilters(store.getState());
            const result = applyMergeQuickFilter({
                filtersA,
                filtersB: merge.filtersB,
                field,
                origin,
                value,
                timezone,
                operator,
                focus: merge.focus,
            });
            if (!result) return;

            if (result.filtersA !== filtersA) {
                dispatch(explorerActions.setFilters(result.filtersA));
            }
            if (result.filtersB !== merge.filtersB) {
                merge.setFiltersB(result.filtersB);
            }
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
