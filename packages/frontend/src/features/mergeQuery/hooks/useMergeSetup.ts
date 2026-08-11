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

    // One side at a time: repairing both at once needs a value set per side,
    // which the setup does not yet ask for.
    const pivotSide: 'a' | 'b' | null =
        unaccountedA.length === 1 && unaccountedB.length === 0
            ? 'a'
            : unaccountedB.length === 1 && unaccountedA.length === 0
              ? 'b'
              : null;
    const unaccounted = pivotSide === 'b' ? unaccountedB : unaccountedA;
    const pivotField = pivotSide ? unaccounted[0] : null;
    const pivotQueryLabel = pivotSide === 'b' ? 'Query B' : 'Query A';
    const otherQueryLabel = pivotSide === 'b' ? 'Query A' : 'Query B';
    const pivotFieldLabel = pivotField ? labelFor(pivotField) : '';
    const joinFieldLabel = effectiveParts[0]?.fieldA
        ? labelFor(effectiveParts[0].fieldA)
        : 'the join key';

    const { data: pivotValueOptions, isLoading: isLoadingValues } =
        useMergePivotValues(
            projectUuid,
            pivotSide === 'b' ? metricQueryB : metricQuery,
            pivotField,
            MAX_PIVOT_VALUES,
        );
    const suggestedValues = pivotValueOptions?.values ?? [];
    const effectivePivotValues =
        pivotValues.length > 0 ? pivotValues : suggestedValues;

    const unaccountedTotal = unaccountedA.length + unaccountedB.length;
    // Built here rather than inside the run handler so the same object can be
    // validated while it is being configured. The rules that refuse a merge do
    // not need it to have run.
    const mergeQuery = useMemo<MergeQuery | null>(() => {
        if (!queryB.exploreName || completeParts.length === 0) return null;

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
                    pivot:
                        pivotSide === 'a' && pivotField
                            ? {
                                  fieldId: pivotField,
                                  values: effectivePivotValues,
                                  includeNulls: false,
                              }
                            : null,
                },
                {
                    id: SOURCE_B,
                    metricQuery: metricQueryB,
                    pivot:
                        pivotSide === 'b' && pivotField
                            ? {
                                  fieldId: pivotField,
                                  values: effectivePivotValues,
                                  includeNulls: false,
                              }
                            : null,
                },
            ],
            joinKey,
            joinType,
            postPivot:
                postPivotIndex !== null && joinKey[postPivotIndex]
                    ? {
                          keyName: joinKey[postPivotIndex].name,
                          values: effectivePivotValues,
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
        pivotSide,
        pivotField,
        effectivePivotValues,
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
            : unaccountedTotal > 0 && pivotSide === null
              ? 'Too many extra fields to merge safely'
              : pivotSide !== null && effectivePivotValues.length === 0
                ? `Choose which ${pivotFieldLabel} values become columns`
                : null);

    const canRun =
        completeParts.length > 0 &&
        completeParts.length === effectiveParts.length &&
        !!queryB.exploreName &&
        queryB.metrics.length > 0 &&
        joinKeyErrors.length === 0 &&
        (unaccountedTotal === 0 ||
            (pivotSide !== null && effectivePivotValues.length > 0));

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
        pivotSide,
        pivotField,
        pivotFieldLabel,
        pivotQueryLabel,
        otherQueryLabel,
        joinFieldLabel,
        suggestedValues,
        isLoadingValues,
        pivotValueOptions,
        effectivePivotValues,
        joinKeyErrors,
        setupStep,
        isIncomplete,
        blockingReason,
        canRun,
        handleRun,
        mergeQuery,
    };
};
