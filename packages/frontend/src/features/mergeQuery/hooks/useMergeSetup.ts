import {
    FeatureFlags,
    DimensionType,
    convertItemTypeToDimensionType,
    getItemLabelWithoutTableName,
    getItemMap,
    getUnaccountedDimensions,
    isCustomDimension,
    isDimension,
    MergeQueryErrorKind,
    validateMergeQuery,
    type MergeFieldTypes,
    type MergeQuery,
    type MetricQuery,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import {
    selectMetricQuery,
    selectParameters,
    selectTableName,
    useExplorerSelector,
} from '../../explorer/store';
import { EMPTY_MERGE, JOIN_KEY, SOURCE_A, SOURCE_B } from '../constants';
import { useMergeSafe } from '../context/useMerge';

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
    const { data: mergeFlag } = useServerFeatureFlag(FeatureFlags.MergeQueries);
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const parameters = useExplorerSelector(selectParameters);
    const mergeContext = useMergeSafe();
    const { isMerging, queryB, joinParts, joinType, filtersB } =
        mergeContext ?? EMPTY_MERGE;
    const { run, isRunning, runErrors, mergeResults } = mergeContext ?? {};

    const { data: exploreA } = useExplore(tableName, { refetchOnMount: false });
    const { data: exploreB } = useExplore(queryB.exploreName ?? undefined, {
        refetchOnMount: false,
    });

    const metricQueryB = useMemo<MetricQuery>(
        () => ({
            exploreName: queryB.exploreName ?? '',
            dimensions: queryB.dimensions,
            metrics: queryB.metrics,
            filters: filtersB,
            sorts: [],
            limit: metricQuery.limit,
            tableCalculations: [],
            additionalMetrics: queryB.additionalMetrics,
            customDimensions: queryB.customDimensions,
        }),
        [filtersB, queryB, metricQuery.limit],
    );
    const itemMapA = useMemo(
        () =>
            exploreA
                ? getItemMap(
                      exploreA,
                      metricQuery.additionalMetrics,
                      metricQuery.tableCalculations,
                      metricQuery.customDimensions,
                  )
                : {},
        [exploreA, metricQuery],
    );
    const itemMapB = useMemo(
        () =>
            exploreB
                ? getItemMap(
                      exploreB,
                      metricQueryB.additionalMetrics,
                      metricQueryB.tableCalculations,
                      metricQueryB.customDimensions,
                  )
                : {},
        [exploreB, metricQueryB],
    );

    /**
     * The best joinable pair among what each query already selects: matching
     * type class, matching grain for dates, dates preferred over everything
     * (they are almost always the key), same field name as the tiebreaker.
     * Only pairs the validator would accept are ever suggested — a suggestion
     * that gets refused is worse than none.
     */
    const suggestedPair = useMemo<{
        fieldA: string;
        fieldB: string;
    } | null>(() => {
        if (!exploreA || !exploreB) return null;
        const classOf = (type: DimensionType) =>
            type === DimensionType.DATE || type === DimensionType.TIMESTAMP
                ? 'temporal'
                : type;

        let best: { fieldA: string; fieldB: string } | null = null;
        let bestScore = 0;
        metricQuery.dimensions.forEach((fieldA) => {
            const itemA = itemMapA[fieldA];
            if (!itemA || (!isDimension(itemA) && !isCustomDimension(itemA)))
                return;
            queryB.dimensions.forEach((fieldB) => {
                const itemB = itemMapB[fieldB];
                if (
                    !itemB ||
                    (!isDimension(itemB) && !isCustomDimension(itemB))
                )
                    return;
                const typeA = convertItemTypeToDimensionType(itemA);
                const typeB = convertItemTypeToDimensionType(itemB);
                if (classOf(typeA) !== classOf(typeB)) return;
                const isTemporal = classOf(typeA) === 'temporal';
                if (
                    isTemporal &&
                    (isDimension(itemA)
                        ? (itemA.timeInterval ?? null)
                        : null) !==
                        (isDimension(itemB)
                            ? (itemB.timeInterval ?? null)
                            : null)
                ) {
                    return;
                }
                let score = 1;
                if (isTemporal) score += 3;
                if (itemA.name === itemB.name) score += 4;
                if (score > bestScore) {
                    bestScore = score;
                    best = { fieldA, fieldB };
                }
            });
        });
        return best;
    }, [
        exploreA,
        exploreB,
        itemMapA,
        itemMapB,
        metricQuery.dimensions,
        queryB.dimensions,
    ]);

    // The first key part defaults to the suggested pair, falling back to each
    // query's first dimension while the explores are still loading. Further
    // parts start empty because there is no obvious default.
    const effectiveParts = useMemo(
        () =>
            joinParts.map((part, index) => ({
                fieldA:
                    part.fieldA ??
                    (index === 0
                        ? (suggestedPair?.fieldA ??
                          metricQuery.dimensions[0] ??
                          null)
                        : null),
                fieldB:
                    part.fieldB ??
                    (index === 0
                        ? (suggestedPair?.fieldB ??
                          queryB.dimensions[0] ??
                          null)
                        : null),
            })),
        [joinParts, suggestedPair, metricQuery.dimensions, queryB.dimensions],
    );
    const completeParts = effectiveParts.filter(
        (part) => part.fieldA && part.fieldB,
    );

    // Field ids are how the merge is addressed, but they are not what anyone
    // calls these things. Everything the user reads says the label.
    const labelFor = useCallback(
        (fieldId: string) => {
            const item = itemMapA[fieldId] ?? itemMapB[fieldId];
            return item ? getItemLabelWithoutTableName(item) : fieldId;
        },
        [itemMapA, itemMapB],
    );

    // Either query can be the finer-grained one. Both are checked, because a
    // merge is refused for whichever side carries the extra dimension and the
    // refusal has to name where the problem is.
    const unaccountedA = useMemo(
        () =>
            getUnaccountedDimensions(
                { id: SOURCE_A, metricQuery },
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
                { id: SOURCE_B, metricQuery: metricQueryB },
                completeParts.map((part, index) => ({
                    name: `${JOIN_KEY}_${index}`,
                    fieldIdBySourceId: { [SOURCE_B]: part.fieldB as string },
                })),
            ),
        [metricQueryB, completeParts],
    );

    /**
     * A dimension only one side carries would repeat the other side's rows
     * once per value. Refused with where and what: the fix is to remove the
     * dimension, or to select it on both queries and join on it.
     */
    const fanOut = useMemo(
        () => [
            ...(unaccountedA.length > 0
                ? [{ side: 'a' as const, fields: unaccountedA }]
                : []),
            ...(unaccountedB.length > 0
                ? [{ side: 'b' as const, fields: unaccountedB }]
                : []),
        ],
        [unaccountedA, unaccountedB],
    );

    // The join selects take the fields themselves, not ids, so they can show
    // the same icons and labels as every other field picker.
    const joinItemsA = useMemo(
        () =>
            metricQuery.dimensions
                .map((id) => itemMapA[id])
                .filter(
                    (item) =>
                        !!item &&
                        (isDimension(item) || isCustomDimension(item)),
                ),
        [itemMapA, metricQuery.dimensions],
    );
    const joinItemsB = useMemo(
        () =>
            queryB.dimensions
                .map((id) => itemMapB[id])
                .filter(
                    (item) =>
                        !!item &&
                        (isDimension(item) || isCustomDimension(item)),
                ),
        [itemMapB, queryB.dimensions],
    );

    // What people call these tables, not what dbt does.
    const exploreALabel = exploreA?.label ?? tableName;
    const exploreBLabel = exploreB?.label ?? queryB.exploreName;

    const joinFieldLabel = effectiveParts[0]?.fieldA
        ? labelFor(effectiveParts[0].fieldA)
        : 'the join key';

    const unaccountedTotal = unaccountedA.length + unaccountedB.length;
    // Built here rather than inside the run handler so the same object can be
    // validated while it is being configured. The rules that refuse a merge do
    // not need it to have run.
    const mergeQuery = useMemo<MergeQuery | null>(() => {
        // Query A hydrates from the saved chart after mount; a merge built
        // before that carries an empty explore and compiles to a 404.
        if (!metricQuery.exploreName) return null;
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
                { id: SOURCE_A, metricQuery },
                { id: SOURCE_B, metricQuery: metricQueryB },
            ],
            joinKey,
            joinType,
            tableCalculations: [],
            limit: metricQuery.limit,
        };
    }, [queryB, completeParts, metricQuery, metricQueryB, joinType]);

    // The same rules the server refuses on, run here as the merge is built.
    // Whether two fields can be joined depends only on the two fields, so
    // making the user press Run to find out is a round trip for an answer we
    // already have.
    const joinFieldTypes = useMemo<MergeFieldTypes>(() => {
        const collect = (itemMap: typeof itemMapA) =>
            Object.entries(itemMap).flatMap(([id, item]) =>
                isDimension(item) || isCustomDimension(item)
                    ? [
                          [
                              id,
                              {
                                  type: convertItemTypeToDimensionType(item),
                                  timeInterval: isDimension(item)
                                      ? (item.timeInterval ?? null)
                                      : null,
                                  timestampDomain: isDimension(item)
                                      ? item.timestampDomain
                                      : undefined,
                              },
                          ] as const,
                      ]
                    : [],
            );
        return {
            [SOURCE_A]: Object.fromEntries(collect(itemMapA)),
            [SOURCE_B]: Object.fromEntries(collect(itemMapB)),
        };
    }, [itemMapA, itemMapB]);

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
            : fanOut.length > 0
              ? 'A field is only in one of the queries'
              : null);

    const canRun =
        mergeFlag?.enabled === true &&
        !!mergeQuery &&
        completeParts.length > 0 &&
        completeParts.length === effectiveParts.length &&
        !!queryB.exploreName &&
        queryB.metrics.length > 0 &&
        joinKeyErrors.length === 0 &&
        fanOut.length === 0;

    const handleRun = useCallback(() => {
        if (mergeFlag?.enabled === true && mergeQuery)
            run?.(mergeQuery, parameters);
    }, [mergeFlag?.enabled, mergeQuery, run, parameters]);
    return {
        // state passed through, so callers need only this hook
        isMerging,
        queryB,
        joinType,
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
        fanOut,
        joinFieldLabel,
        joinItemsA,
        joinItemsB,
        exploreALabel,
        exploreBLabel,
        joinKeyErrors,
        setupStep,
        isIncomplete,
        blockingReason,
        canRun,
        handleRun,
        mergeQuery,
    };
};
