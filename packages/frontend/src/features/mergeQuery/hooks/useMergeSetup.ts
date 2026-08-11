import {
    getItemMap,
    getUnaccountedDimensions,
    isDimension,
    isField,
    MergeQueryErrorKind,
    validateMergeQuery,
    type Explore,
    type MergeFieldTypes,
    type MergeQuery,
    type MetricQuery,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import {
    selectMetricQuery,
    selectTableName,
    useExplorerSelector,
} from '../../explorer/store';
import {
    EMPTY_MERGE,
    JOIN_KEY,
    MAX_PIVOT_VALUES,
    SOURCE_A,
    SOURCE_B,
} from '../constants';
import { useMergeSafe } from '../context/useMerge';
import { useMergePivotValues } from './useMergeQuery';

/**
 * Everything derived from the two queries and the relationship between them:
 * the merge to run, whether it can run, and what is stopping it.
 *
 * Lives in a hook rather than the setup panel because the run control is not
 * inside that panel. The explorer's own Run button runs a merge when one is
 * configured, and both need the same answer to "is this runnable, and what is
 * it".
 */
export const useMergeSetup = () => {
    const projectUuid = useProjectUuid();
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const mergeContext = useMergeSafe();
    const {
        isMerging,
        queryB,
        joinParts,
        joinType,
        pivotValues,
        postPivotIndex,
    } = mergeContext ?? EMPTY_MERGE;
    const { run, isRunning, runErrors, mergeResults } = mergeContext ?? {};

    const { data: exploreA } = useExplore(tableName, { refetchOnMount: false });
    const { data: exploreB } = useExplore(queryB.exploreName ?? undefined, {
        refetchOnMount: false,
    });

    // The first key part defaults to each query's first dimension. Picking a
    // dimension and then picking it again as the join field is the same choice
    // twice; further parts start empty because there is no obvious default.
    const effectiveParts = useMemo(
        () =>
            joinParts.map((part, index) => ({
                fieldA:
                    part.fieldA ??
                    (index === 0 ? (metricQuery.dimensions[0] ?? null) : null),
                fieldB:
                    part.fieldB ??
                    (index === 0 ? (queryB.dimensions[0] ?? null) : null),
            })),
        [joinParts, metricQuery.dimensions, queryB.dimensions],
    );
    const completeParts = effectiveParts.filter(
        (part) => part.fieldA && part.fieldB,
    );

    // Field ids are how the merge is addressed, but they are not what anyone
    // calls these things. Everything the user reads says the label.
    const labelFor = useCallback(
        (fieldId: string) => {
            const item =
                (exploreA ? getItemMap(exploreA)[fieldId] : undefined) ??
                (exploreB ? getItemMap(exploreB)[fieldId] : undefined);
            return item && isField(item) ? item.label : fieldId;
        },
        [exploreA, exploreB],
    );

    const metricQueryB = useMemo<MetricQuery>(
        () => ({
            exploreName: queryB.exploreName ?? '',
            dimensions: queryB.dimensions,
            metrics: queryB.metrics,
            filters: {},
            sorts: [],
            limit: metricQuery.limit,
            tableCalculations: [],
        }),
        [queryB, metricQuery.limit],
    );

    // Either query can be the finer-grained one. Both are checked, because a
    // merge is refused for whichever side carries the extra dimension and the
    // repair has to be offered where the problem is.
    const unaccountedA = useMemo(
        () =>
            getUnaccountedDimensions(
                { id: SOURCE_A, metricQuery, pivot: null },
                completeParts.map((part, index) => ({
                    name: `${JOIN_KEY}_${index}`,
                    fieldIdBySourceId: { [SOURCE_A]: part.fieldA as string },
                })),
            ),
        [metricQuery, completeParts],
    );
    const unaccountedB = useMemo(
        () =>
            getUnaccountedDimensions(
                { id: SOURCE_B, metricQuery: metricQueryB, pivot: null },
                completeParts.map((part, index) => ({
                    name: `${JOIN_KEY}_${index}`,
                    fieldIdBySourceId: { [SOURCE_B]: part.fieldB as string },
                })),
            ),
        [metricQueryB, completeParts],
    );

    // Each query is repaired on its own terms. A side carrying exactly one
    // extra dimension can be brought back to the join grain; carrying more
    // than one cannot, because only one dimension can become columns.
    const pivotFieldA = unaccountedA.length === 1 ? unaccountedA[0] : null;
    const pivotFieldB = unaccountedB.length === 1 ? unaccountedB[0] : null;

    const valuesA = useMergePivotValues(
        projectUuid,
        metricQuery,
        pivotFieldA,
        MAX_PIVOT_VALUES,
    );
    const valuesB = useMergePivotValues(
        projectUuid,
        metricQueryB,
        pivotFieldB,
        MAX_PIVOT_VALUES,
    );

    /** What one side needs, and what has been chosen for it. */
    const repairFor = (
        side: 'a' | 'b',
        field: string | null,
        options: typeof valuesA,
    ) => {
        const suggested = options.data?.values ?? [];
        const chosen = pivotValues[side];
        return {
            side,
            field,
            fieldLabel: field ? labelFor(field) : '',
            queryLabel: side === 'b' ? 'Query B' : 'Query A',
            otherQueryLabel: side === 'b' ? 'Query A' : 'Query B',
            suggestedValues: suggested,
            isLoadingValues: options.isLoading,
            truncated: options.data?.truncated ?? false,
            values: chosen.length > 0 ? chosen : suggested,
        };
    };

    // Memoised because the merge query is built from it: an array rebuilt every
    // render would rebuild the merge every render, and the run-on-restore
    // effect watches that.
    const repairs = useMemo(
        () => [
            ...(pivotFieldA ? [repairFor('a', pivotFieldA, valuesA)] : []),
            ...(pivotFieldB ? [repairFor('b', pivotFieldB, valuesB)] : []),
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            pivotFieldA,
            pivotFieldB,
            valuesA.data,
            valuesA.isLoading,
            valuesB.data,
            valuesB.isLoading,
            pivotValues,
            labelFor,
        ],
    );

    /** A side that carries more than one extra dimension cannot be repaired. */
    const unrepairable = useMemo(
        () => [
            ...(unaccountedA.length > 1
                ? [{ side: 'a' as const, fields: unaccountedA }]
                : []),
            ...(unaccountedB.length > 1
                ? [{ side: 'b' as const, fields: unaccountedB }]
                : []),
        ],
        [unaccountedA, unaccountedB],
    );

    const joinFieldLabel = effectiveParts[0]?.fieldA
        ? labelFor(effectiveParts[0].fieldA)
        : 'the join key';

    const unaccountedTotal = unaccountedA.length + unaccountedB.length;
    // Built here rather than inside the run handler so the same object can be
    // validated while it is being configured. The rules that refuse a merge do
    // not need it to have run.
    const mergeQuery = useMemo<MergeQuery | null>(() => {
        if (!queryB.exploreName || completeParts.length === 0) return null;

        const pivotFor = (side: 'a' | 'b') => {
            const repair = repairs.find((r) => r.side === side);
            return repair && repair.field && repair.values.length > 0
                ? {
                      fieldId: repair.field,
                      values: repair.values,
                      includeNulls: false,
                  }
                : null;
        };

        const joinKey = completeParts.map((part, index) => ({
            name: `${JOIN_KEY}_${index}`,
            fieldIdBySourceId: {
                [SOURCE_A]: part.fieldA as string,
                [SOURCE_B]: part.fieldB as string,
            },
        }));

        return {
            sources: [
                {
                    id: SOURCE_A,
                    metricQuery,
                    pivot: pivotFor(SOURCE_A),
                },
                {
                    id: SOURCE_B,
                    metricQuery: metricQueryB,
                    pivot: pivotFor(SOURCE_B),
                },
            ],
            joinKey,
            joinType,
            postPivot:
                postPivotIndex !== null && joinKey[postPivotIndex]
                    ? {
                          keyName: joinKey[postPivotIndex].name,
                          values: repairs[0]?.values ?? [],
                          includeNulls: false,
                      }
                    : null,
            tableCalculations: [],
            limit: metricQuery.limit,
        };
    }, [
        queryB,
        completeParts,
        metricQuery,
        metricQueryB,
        repairs,
        joinType,
        postPivotIndex,
    ]);

    // The same rules the server refuses on, run here as the merge is built.
    // Whether two fields can be joined depends only on the two fields, so
    // making the user press Run to find out is a round trip for an answer we
    // already have.
    const joinFieldTypes = useMemo<MergeFieldTypes>(() => {
        const collect = (explore: Explore | undefined) =>
            explore
                ? Object.entries(getItemMap(explore)).flatMap(([id, item]) =>
                      isDimension(item)
                          ? [
                                [
                                    id,
                                    {
                                        type: item.type,
                                        timeInterval: item.timeInterval ?? null,
                                    },
                                ] as const,
                            ]
                          : [],
                  )
                : [];
        return Object.fromEntries([...collect(exploreA), ...collect(exploreB)]);
    }, [exploreA, exploreB]);

    const joinKeyErrors = useMemo(
        () =>
            mergeQuery
                ? validateMergeQuery(mergeQuery, joinFieldTypes).filter(
                      (error) =>
                          error.kind ===
                              MergeQueryErrorKind.JOIN_KEY_TYPE_MISMATCH ||
                          error.kind ===
                              MergeQueryErrorKind.JOIN_KEY_GRANULARITY_MISMATCH,
                  )
                : [],
        [mergeQuery, joinFieldTypes],
    );

    // A merge that is not built yet and a merge that is built but unsafe are
    // different problems. Saying both at once is what makes the panel
    // unreadable: a grain warning means nothing until there is a merge to
    // warn about.
    const setupStep = !queryB.exploreName
        ? 'Pick a table for Query B'
        : queryB.metrics.length === 0
          ? 'Pick at least one metric for Query B'
          : !effectiveParts.every(
                  (part) =>
                      part.fieldA &&
                      part.fieldB &&
                      metricQuery.dimensions.includes(part.fieldA) &&
                      queryB.dimensions.includes(part.fieldB),
              )
            ? 'Pick a field from each query to join on'
            : null;
    const isIncomplete = setupStep !== null;

    const blockingReason =
        setupStep ??
        (joinKeyErrors.length > 0
            ? 'These queries cannot be joined on that field'
            : unrepairable.length > 0
              ? 'Too many extra fields to merge safely'
              : repairs.find((r) => r.values.length === 0)
                ? `Choose which ${
                      repairs.find((r) => r.values.length === 0)?.fieldLabel
                  } values become columns`
                : null);

    const canRun =
        completeParts.length > 0 &&
        completeParts.length === effectiveParts.length &&
        !!queryB.exploreName &&
        queryB.metrics.length > 0 &&
        joinKeyErrors.length === 0 &&
        unrepairable.length === 0 &&
        repairs.every((repair) => repair.values.length > 0);

    const handleRun = useCallback(() => {
        if (mergeQuery) run?.(mergeQuery);
    }, [mergeQuery, run]);
    return {
        // state passed through, so callers need only this hook
        isMerging,
        queryB,
        joinType,
        postPivotIndex,
        pivotValues,
        run,
        isRunning,
        runErrors,
        mergeResults,
        // derived
        effectiveParts,
        labelFor,
        unaccountedA,
        unaccountedB,
        unaccountedTotal,
        repairs,
        unrepairable,
        joinFieldLabel,
        joinKeyErrors,
        setupStep,
        isIncomplete,
        blockingReason,
        canRun,
        handleRun,
        mergeQuery,
    };
};
