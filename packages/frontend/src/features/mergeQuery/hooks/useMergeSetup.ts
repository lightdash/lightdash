import {
    FeatureFlags,
    DimensionType,
    convertItemTypeToDimensionType,
    getItemLabelWithoutTableName,
    getItemId,
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
    selectUnsavedChartVersion,
    useExplorerSelector,
} from '../../explorer/store';
import {
    DEFAULT_ADDITIONAL_SOURCE_ID,
    EMPTY_MERGE,
    emptyMergeSource,
    JOIN_KEY,
    PRIMARY_SOURCE_ID,
} from '../constants';
import { useMergeSafe } from '../context/useMerge';

/**
 * Everything derived from the selected sources and their relationship:
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
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);
    const mergeContext = useMergeSafe();
    const { isMerging, additionalSources, joinParts, joinType } =
        mergeContext ?? EMPTY_MERGE;
    const { run, isRunning, runErrors, mergeResults } = mergeContext ?? {};
    const additionalSource =
        additionalSources[0] ?? emptyMergeSource(DEFAULT_ADDITIONAL_SOURCE_ID);
    const additionalSourceId = additionalSource.id;

    const { data: primaryExplore } = useExplore(tableName, {
        refetchOnMount: false,
    });
    const { data: additionalExplore } = useExplore(
        additionalSource.exploreName ?? undefined,
        { refetchOnMount: false },
    );

    const additionalMetricQuery = useMemo<MetricQuery>(
        () => ({
            exploreName: additionalSource.exploreName ?? '',
            dimensions: additionalSource.dimensions,
            metrics: additionalSource.metrics,
            filters: additionalSource.filters,
            sorts: [],
            limit: metricQuery.limit,
            tableCalculations: [],
            additionalMetrics: additionalSource.additionalMetrics,
            customDimensions: additionalSource.customDimensions,
        }),
        [additionalSource, metricQuery.limit],
    );
    const primaryItemMap = useMemo(
        () =>
            primaryExplore
                ? getItemMap(
                      primaryExplore,
                      metricQuery.additionalMetrics,
                      metricQuery.tableCalculations,
                      metricQuery.customDimensions,
                  )
                : {},
        [primaryExplore, metricQuery],
    );
    const additionalItemMap = useMemo(
        () =>
            additionalExplore
                ? getItemMap(
                      additionalExplore,
                      additionalMetricQuery.additionalMetrics,
                      additionalMetricQuery.tableCalculations,
                      additionalMetricQuery.customDimensions,
                  )
                : {},
        [additionalExplore, additionalMetricQuery],
    );

    /**
     * The best joinable pair among what each query already selects: matching
     * type class, matching grain for dates, dates preferred over everything
     * (they are almost always the key), same field name as the tiebreaker.
     * Only pairs the validator would accept are ever suggested — a suggestion
     * that gets refused is worse than none.
     */
    const suggestedPair = useMemo<Record<string, string> | null>(() => {
        if (!primaryExplore || !additionalExplore) return null;
        const classOf = (type: DimensionType) =>
            type === DimensionType.DATE || type === DimensionType.TIMESTAMP
                ? 'temporal'
                : type;

        let best: Record<string, string> | null = null;
        let bestScore = 0;
        metricQuery.dimensions.forEach((primaryFieldId) => {
            const primaryItem = primaryItemMap[primaryFieldId];
            if (
                !primaryItem ||
                (!isDimension(primaryItem) && !isCustomDimension(primaryItem))
            )
                return;
            additionalSource.dimensions.forEach((additionalFieldId) => {
                const additionalItem = additionalItemMap[additionalFieldId];
                if (
                    !additionalItem ||
                    (!isDimension(additionalItem) &&
                        !isCustomDimension(additionalItem))
                )
                    return;
                const primaryType = convertItemTypeToDimensionType(primaryItem);
                const additionalType =
                    convertItemTypeToDimensionType(additionalItem);
                if (classOf(primaryType) !== classOf(additionalType)) return;
                const isTemporal = classOf(primaryType) === 'temporal';
                if (
                    isTemporal &&
                    (isDimension(primaryItem)
                        ? (primaryItem.timeInterval ?? null)
                        : null) !==
                        (isDimension(additionalItem)
                            ? (additionalItem.timeInterval ?? null)
                            : null)
                ) {
                    return;
                }
                let score = 1;
                if (isTemporal) score += 3;
                if (primaryItem.name === additionalItem.name) score += 4;
                if (score > bestScore) {
                    bestScore = score;
                    best = {
                        [PRIMARY_SOURCE_ID]: primaryFieldId,
                        [additionalSourceId]: additionalFieldId,
                    };
                }
            });
        });
        return best;
    }, [
        primaryExplore,
        additionalExplore,
        primaryItemMap,
        additionalItemMap,
        metricQuery.dimensions,
        additionalSource.dimensions,
        additionalSourceId,
    ]);

    // The first key part defaults to the suggested pair, falling back to each
    // query's first dimension while the explores are still loading. Further
    // parts start empty because there is no obvious default.
    const effectiveParts = useMemo(
        () =>
            joinParts.map((part, index) => ({
                fieldIdBySourceId: {
                    [PRIMARY_SOURCE_ID]:
                        part.fieldIdBySourceId[PRIMARY_SOURCE_ID] ??
                        (index === 0
                            ? (suggestedPair?.[PRIMARY_SOURCE_ID] ??
                              metricQuery.dimensions[0] ??
                              null)
                            : null),
                    [additionalSourceId]:
                        part.fieldIdBySourceId[additionalSourceId] ??
                        (index === 0
                            ? (suggestedPair?.[additionalSourceId] ??
                              additionalSource.dimensions[0] ??
                              null)
                            : null),
                },
            })),
        [
            joinParts,
            suggestedPair,
            metricQuery.dimensions,
            additionalSource.dimensions,
            additionalSourceId,
        ],
    );
    const completeParts = effectiveParts.filter(
        (part) =>
            part.fieldIdBySourceId[PRIMARY_SOURCE_ID] &&
            part.fieldIdBySourceId[additionalSourceId],
    );

    // Field ids are how the merge is addressed, but they are not what anyone
    // calls these things. Everything the user reads says the label.
    const labelFor = useCallback(
        (fieldId: string) => {
            const item = primaryItemMap[fieldId] ?? additionalItemMap[fieldId];
            return item ? getItemLabelWithoutTableName(item) : fieldId;
        },
        [primaryItemMap, additionalItemMap],
    );

    // Either query can be the finer-grained one. Both are checked, because a
    // merge is refused for whichever side carries the extra dimension and the
    // refusal has to name where the problem is.
    const unaccountedPrimary = useMemo(
        () =>
            getUnaccountedDimensions(
                { id: PRIMARY_SOURCE_ID, metricQuery },
                completeParts.map((part, index) => ({
                    name: `${JOIN_KEY}_${index}`,
                    fieldIdBySourceId: {
                        [PRIMARY_SOURCE_ID]: part.fieldIdBySourceId[
                            PRIMARY_SOURCE_ID
                        ] as string,
                    },
                })),
            ),
        [metricQuery, completeParts],
    );
    const unaccountedAdditional = useMemo(
        () =>
            getUnaccountedDimensions(
                {
                    id: additionalSourceId,
                    metricQuery: additionalMetricQuery,
                },
                completeParts.map((part, index) => ({
                    name: `${JOIN_KEY}_${index}`,
                    fieldIdBySourceId: {
                        [additionalSourceId]: part.fieldIdBySourceId[
                            additionalSourceId
                        ] as string,
                    },
                })),
            ),
        [additionalMetricQuery, completeParts, additionalSourceId],
    );

    /**
     * A dimension only one side carries would repeat the other side's rows
     * once per value. Refused with where and what: the fix is to remove the
     * dimension, or to select it on both queries and join on it.
     */
    const fanOut = useMemo(
        () => [
            ...(unaccountedPrimary.length > 0
                ? [
                      {
                          sourceId: PRIMARY_SOURCE_ID,
                          fields: unaccountedPrimary,
                      },
                  ]
                : []),
            ...(unaccountedAdditional.length > 0
                ? [
                      {
                          sourceId: additionalSourceId,
                          fields: unaccountedAdditional,
                      },
                  ]
                : []),
        ],
        [unaccountedPrimary, unaccountedAdditional, additionalSourceId],
    );

    // The join selects take the fields themselves, not ids, so they can show
    // the same icons and labels as every other field picker.
    const primaryJoinItems = useMemo(
        () =>
            metricQuery.dimensions
                .map((id) => primaryItemMap[id])
                .filter(
                    (item) =>
                        !!item &&
                        (isDimension(item) || isCustomDimension(item)),
                ),
        [primaryItemMap, metricQuery.dimensions],
    );
    const additionalJoinItems = useMemo(
        () =>
            additionalSource.dimensions
                .map((id) => additionalItemMap[id])
                .filter(
                    (item) =>
                        !!item &&
                        (isDimension(item) || isCustomDimension(item)),
                ),
        [additionalItemMap, additionalSource.dimensions],
    );

    // Join keys are dimensions, but they do not need to be selected before
    // opening this editor. The picker can add a dimension to its query and use
    // it as the key in one action. Custom dimensions remain limited to ones
    // already present in the query because they cannot be recreated by id.
    const availablePrimaryJoinItems = useMemo(
        () =>
            Object.entries(primaryItemMap).flatMap(([id, item]) =>
                isDimension(item) ||
                (isCustomDimension(item) && metricQuery.dimensions.includes(id))
                    ? [item]
                    : [],
            ),
        [primaryItemMap, metricQuery.dimensions],
    );
    const availableAdditionalJoinItems = useMemo(
        () =>
            Object.entries(additionalItemMap).flatMap(([id, item]) =>
                isDimension(item) ||
                (isCustomDimension(item) &&
                    additionalSource.dimensions.includes(id))
                    ? [item]
                    : [],
            ),
        [additionalItemMap, additionalSource.dimensions],
    );

    // Recommend only strong semantic matches. Type compatibility alone is
    // too weak (many explores have several strings or dates), so a suggestion
    // also needs the same field name or user-facing label. Identifiers win
    // over dates when both are available.
    const suggestedAvailablePair = useMemo<Record<
        string,
        string
    > | null>(() => {
        let best: Record<string, string> | null = null;
        let bestScore = 0;
        const normalize = (value: string) =>
            value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');

        availablePrimaryJoinItems.forEach((primaryItem) => {
            availableAdditionalJoinItems.forEach((additionalItem) => {
                const primaryType = convertItemTypeToDimensionType(primaryItem);
                const additionalType =
                    convertItemTypeToDimensionType(additionalItem);
                const primaryIsTemporal =
                    primaryType === DimensionType.DATE ||
                    primaryType === DimensionType.TIMESTAMP;
                const additionalIsTemporal =
                    additionalType === DimensionType.DATE ||
                    additionalType === DimensionType.TIMESTAMP;
                if (
                    primaryIsTemporal !== additionalIsTemporal ||
                    (!primaryIsTemporal && primaryType !== additionalType)
                )
                    return;
                if (
                    primaryIsTemporal &&
                    (isDimension(primaryItem)
                        ? primaryItem.timeInterval
                        : null) !==
                        (isDimension(additionalItem)
                            ? additionalItem.timeInterval
                            : null)
                )
                    return;

                const sameName =
                    normalize(primaryItem.name) ===
                    normalize(additionalItem.name);
                const sameLabel =
                    normalize(getItemLabelWithoutTableName(primaryItem)) ===
                    normalize(getItemLabelWithoutTableName(additionalItem));
                if (!sameName && !sameLabel) return;

                const identifier = /(^|_)id$|(^|_)key$/i.test(primaryItem.name);
                const additionalFieldId = getItemId(additionalItem);
                const belongsToAdditionalRoot = additionalFieldId.startsWith(
                    `${additionalSource.exploreName}_`,
                );
                const score =
                    (sameName ? 6 : 0) +
                    (sameLabel ? 4 : 0) +
                    (identifier ? 4 : 0) +
                    (belongsToAdditionalRoot ? 3 : 0) +
                    (primaryIsTemporal ? 2 : 0);
                if (score > bestScore) {
                    bestScore = score;
                    best = {
                        [PRIMARY_SOURCE_ID]: getItemId(primaryItem),
                        [additionalSourceId]: additionalFieldId,
                    };
                }
            });
        });

        return best;
    }, [
        availablePrimaryJoinItems,
        availableAdditionalJoinItems,
        additionalSource.exploreName,
        additionalSourceId,
    ]);

    // What people call these tables, not what dbt does.
    const primaryExploreLabel = primaryExplore?.label ?? tableName;
    const additionalExploreLabel =
        additionalExplore?.label ?? additionalSource.exploreName;

    const primaryJoinField =
        effectiveParts[0]?.fieldIdBySourceId[PRIMARY_SOURCE_ID];
    const joinFieldLabel = primaryJoinField
        ? labelFor(primaryJoinField)
        : 'the join key';

    const unaccountedTotal =
        unaccountedPrimary.length + unaccountedAdditional.length;
    // Built here rather than inside the run handler so the same object can be
    // validated while it is being configured. The rules that refuse a merge do
    // not need it to have run.
    const mergeQuery = useMemo<MergeQuery | null>(() => {
        // The primary source hydrates from the saved chart after mount; a merge built
        // before that carries an empty explore and compiles to a 404.
        if (!metricQuery.exploreName) return null;
        if (!additionalSource.exploreName || completeParts.length === 0)
            return null;

        const joinKey = completeParts.map((part, index) => ({
            name: `${JOIN_KEY}_${index}`,
            fieldIdBySourceId: {
                [PRIMARY_SOURCE_ID]: part.fieldIdBySourceId[
                    PRIMARY_SOURCE_ID
                ] as string,
                [additionalSourceId]: part.fieldIdBySourceId[
                    additionalSourceId
                ] as string,
            },
        }));

        return {
            sources: [
                { id: PRIMARY_SOURCE_ID, metricQuery },
                {
                    id: additionalSourceId,
                    metricQuery: additionalMetricQuery,
                },
            ],
            joinKey,
            joinType,
            tableCalculations: [],
            limit: metricQuery.limit,
        };
    }, [
        additionalSource.exploreName,
        additionalSourceId,
        completeParts,
        metricQuery,
        additionalMetricQuery,
        joinType,
    ]);

    // The same rules the server refuses on, run here as the merge is built.
    // Whether two fields can be joined depends only on the two fields, so
    // making the user press Run to find out is a round trip for an answer we
    // already have.
    const joinFieldTypes = useMemo<MergeFieldTypes>(() => {
        const collect = (itemMap: typeof primaryItemMap) =>
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
            [PRIMARY_SOURCE_ID]: Object.fromEntries(collect(primaryItemMap)),
            [additionalSourceId]: Object.fromEntries(
                collect(additionalItemMap),
            ),
        };
    }, [primaryItemMap, additionalItemMap, additionalSourceId]);

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
    const setupStep = !additionalSource.exploreName
        ? 'Choose data to combine'
        : additionalSource.metrics.length === 0
          ? `Add at least one metric from ${additionalExploreLabel ?? 'the second table'}`
          : !effectiveParts.every(
                  (part) =>
                      part.fieldIdBySourceId[PRIMARY_SOURCE_ID] &&
                      part.fieldIdBySourceId[additionalSourceId] &&
                      metricQuery.dimensions.includes(
                          part.fieldIdBySourceId[PRIMARY_SOURCE_ID] as string,
                      ) &&
                      additionalSource.dimensions.includes(
                          part.fieldIdBySourceId[additionalSourceId] as string,
                      ),
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
        !!additionalSource.exploreName &&
        additionalSource.metrics.length > 0 &&
        joinKeyErrors.length === 0 &&
        fanOut.length === 0;

    const handleRun = useCallback(() => {
        if (mergeFlag?.enabled === true && mergeQuery)
            run?.(mergeQuery, parameters, unsavedChartVersion);
    }, [mergeFlag?.enabled, mergeQuery, run, parameters, unsavedChartVersion]);
    return {
        // state passed through, so callers need only this hook
        isMerging,
        additionalSource,
        additionalSourceId,
        joinType,
        run,
        isRunning,
        runErrors,
        mergeResults,
        // derived
        effectiveParts,
        labelFor,
        primaryItemMap,
        additionalItemMap,
        unaccountedPrimary,
        unaccountedAdditional,
        unaccountedTotal,
        fanOut,
        joinFieldLabel,
        primaryJoinItems,
        additionalJoinItems,
        availablePrimaryJoinItems,
        availableAdditionalJoinItems,
        suggestedAvailablePair,
        primaryExploreLabel,
        additionalExploreLabel,
        joinKeyErrors,
        setupStep,
        isIncomplete,
        blockingReason,
        canRun,
        handleRun,
        mergeQuery,
    };
};
