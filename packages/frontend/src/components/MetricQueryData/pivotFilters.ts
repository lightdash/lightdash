import {
    FilterOperator,
    type FilterGroupItem,
    type FilterRule,
    type PivotReference,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import type { TopGroupTuple } from './types';

export function buildPivotFilters({
    pivotReference,
    topGroupTuples,
}: {
    pivotReference: PivotReference;
    topGroupTuples?: TopGroupTuple[];
}): FilterGroupItem[] {
    if (!pivotReference.pivotValues) return [];

    const hasOtherPivot = pivotReference.pivotValues.some(
        (pv) => pv.isOtherGroup,
    );

    if (hasOtherPivot && !topGroupTuples?.length) {
        // Safety: Other group clicked but no top-N tuples available to build
        // exclusion filters. Return a contradiction filter (always false) to
        // prevent an unfiltered query against the entire table.
        const firstField = pivotReference.pivotValues[0].field;
        return [
            {
                id: uuidv4(),
                target: { fieldId: firstField },
                operator: FilterOperator.NULL,
                values: undefined,
            } as FilterRule,
            {
                id: uuidv4(),
                target: { fieldId: firstField },
                operator: FilterOperator.NOT_NULL,
                values: undefined,
            } as FilterRule,
        ];
    }

    if (hasOtherPivot && topGroupTuples?.length) {
        // Build tuple-aware exclusion: NOT((A₁ AND B₁) OR (A₂ AND B₂))
        // Via De Morgan: (NOT A₁ OR NOT B₁) AND (NOT A₂ OR NOT B₂)
        const tupleExclusions: FilterGroupItem[] = topGroupTuples.map(
            (tuple) => ({
                id: uuidv4(),
                or: Object.entries(tuple).map(
                    ([field, tupleValue]): FilterRule => ({
                        id: uuidv4(),
                        target: { fieldId: field },
                        operator:
                            tupleValue === null
                                ? FilterOperator.NOT_NULL
                                : FilterOperator.NOT_EQUALS,
                        values:
                            tupleValue === null
                                ? undefined
                                : [tupleValue as string],
                    }),
                ),
            }),
        );

        // Also add non-Other pivot values as equality filters
        const nonOtherPivots = pivotReference.pivotValues.filter(
            (pv) => !pv.isOtherGroup,
        );
        const equalityFilters: FilterRule[] = nonOtherPivots.map(
            (pivot): FilterRule => ({
                id: uuidv4(),
                target: { fieldId: pivot.field },
                operator:
                    pivot.value === null
                        ? FilterOperator.NULL
                        : FilterOperator.EQUALS,
                values: pivot.value === null ? undefined : [pivot.value],
            }),
        );

        return [...tupleExclusions, ...equalityFilters];
    }

    // Non-Other path: standard equality filters, skip Other-flagged values
    return pivotReference.pivotValues
        .filter((pv) => !pv.isOtherGroup)
        .map(
            (pivot): FilterRule => ({
                id: uuidv4(),
                target: { fieldId: pivot.field },
                operator:
                    pivot.value === null
                        ? FilterOperator.NULL
                        : FilterOperator.EQUALS,
                values: pivot.value === null ? undefined : [pivot.value],
            }),
        );
}
