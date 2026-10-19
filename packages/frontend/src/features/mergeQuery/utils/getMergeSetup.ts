import {
    assertUnreachable,
    convertItemTypeToDimensionType,
    getItemId,
    getItemLabel,
    getItemLabelWithoutTableName,
    getUnaccountedDimensions,
    isCustomDimension,
    isDimension,
    isFanOutAccepted,
    MergeJoinType,
    MergeQueryErrorKind,
    toMergedSorts,
    validateMergeQuery,
    type Explore,
    type MergeFieldTypes,
    type MergeQuery,
    type MetricQuery,
} from '@lightdash/common';
import {
    DEFAULT_ADDITIONAL_SOURCE_ID,
    emptyMergeSource,
    PRIMARY_SOURCE_ID,
} from '../constants';
import { type MergeEditorSource, type MergeJoinPart } from '../context/context';
import { getMergePairSetup } from './getMergePairSetup';
import { type MergeSourceNames } from './getMergeSourceNames';
import { deriveSharedJoinFilters } from './syncMergeJoinFilters';

export const getMergeJoinTypeLabel = (
    joinType: MergeJoinType,
    firstSourceLabel: string,
): string => {
    switch (joinType) {
        case MergeJoinType.INNER:
            return 'Matches only';
        case MergeJoinType.LEFT:
            return `From ${firstSourceLabel}`;
        case MergeJoinType.FULL:
            return 'All rows';
        default:
            return assertUnreachable(joinType, 'Unknown join type');
    }
};

/** Every source shares one key and join mode; editing focus never changes the query. */
export const getMergeSetup = ({
    metricQuery,
    tableName,
    primaryExplore,
    additionalExplores,
    additionalSources,
    joinParts,
    joinType,
    repeatValuesSourceIds,
    sourceNames,
    tableCalculations = [],
}: {
    metricQuery: MetricQuery;
    tableName: string | undefined;
    primaryExplore: Explore | undefined;
    additionalExplores: (Explore | undefined)[];
    additionalSources: MergeEditorSource[];
    joinParts: MergeJoinPart[];
    joinType: MergeQuery['joinType'];
    repeatValuesSourceIds: string[];
    sourceNames: MergeSourceNames;
    tableCalculations?: MergeQuery['tableCalculations'];
}) => {
    const first = getMergePairSetup({
        metricQuery,
        tableName,
        primaryExplore,
        additionalExplore: additionalExplores[0],
        additionalSource:
            additionalSources[0] ??
            emptyMergeSource(DEFAULT_ADDITIONAL_SOURCE_ID),
        joinParts,
    });
    const sharedParts = joinParts.map((part, index) => ({
        ...part,
        fieldIdBySourceId: {
            ...part.fieldIdBySourceId,
            [PRIMARY_SOURCE_ID]:
                first.effectiveParts[index].fieldIdBySourceId[
                    PRIMARY_SOURCE_ID
                ],
        },
    }));
    const pairSetups = additionalSources.map((source, index) =>
        getMergePairSetup({
            metricQuery,
            tableName,
            primaryExplore,
            additionalExplore: additionalExplores[index],
            additionalSource: source,
            joinParts: sharedParts,
        }),
    );
    const handles = [
        PRIMARY_SOURCE_ID,
        ...additionalSources.map((source) => source.id),
    ];
    const effectiveParts: MergeJoinPart[] = sharedParts.map((part, index) => ({
        ...part,
        fieldIdBySourceId: Object.fromEntries([
            [PRIMARY_SOURCE_ID, part.fieldIdBySourceId[PRIMARY_SOURCE_ID]],
            ...pairSetups.map((setup) => [
                setup.additionalSourceId,
                setup.effectiveParts[index].fieldIdBySourceId[
                    setup.additionalSourceId
                ],
            ]),
        ]),
    }));
    const filtersBySourceId = deriveSharedJoinFilters({
        filtersBySourceId: Object.fromEntries([
            [PRIMARY_SOURCE_ID, metricQuery.filters],
            ...pairSetups.map((setup) => [
                setup.additionalSourceId,
                setup.additionalMetricQuery.filters,
            ]),
        ]),
        joinParts,
        effectiveParts,
    });
    const sourceSetups = pairSetups.map((setup) => ({
        ...setup,
        additionalMetricQuery: {
            ...setup.additionalMetricQuery,
            filters: filtersBySourceId[setup.additionalSourceId],
        },
    }));
    const editorSources = [
        { id: PRIMARY_SOURCE_ID, metricQuery },
        ...sourceSetups.map((setup) => ({
            id: setup.additionalSourceId,
            metricQuery: setup.additionalMetricQuery,
        })),
    ].map((source) => ({
        ...source,
        repeatValues: repeatValuesSourceIds.includes(source.id),
    }));
    const editorKeys = effectiveParts.flatMap((part) => {
        const fieldIds = handles.map((id) => part.fieldIdBySourceId[id]);
        if (!fieldIds.every((fieldId): fieldId is string => !!fieldId)) {
            return [];
        }
        return [
            {
                name: part.name ?? fieldIds[0],
                fieldIdBySourceId: Object.fromEntries(
                    handles.map((id, index) => [id, fieldIds[index]]),
                ),
            },
        ];
    });
    const fanOut = editorSources.flatMap((source) => {
        const fields = getUnaccountedDimensions(source, editorKeys);
        return fields.length > 0 && !isFanOutAccepted(editorSources, source.id)
            ? [{ sourceId: source.id, fields }]
            : [];
    });
    const joinKey = editorKeys.map((part) => ({
        ...part,
        fieldIdBySourceId: Object.fromEntries(
            handles.map((id) => [
                sourceNames.nameByHandle[id],
                part.fieldIdBySourceId[id],
            ]),
        ),
    }));
    const primaryRuntimeId = sourceNames.nameByHandle[PRIMARY_SOURCE_ID];
    const mergeQuery: MergeQuery | null =
        metricQuery.exploreName &&
        additionalSources.length > 0 &&
        additionalSources.every((source) => source.exploreName) &&
        editorKeys.length > 0
            ? {
                  sources: editorSources.map((source) => ({
                      id: sourceNames.nameByHandle[source.id],
                      metricQuery: source.metricQuery,
                      ...(source.repeatValues ? { repeatValues: true } : {}),
                  })),
                  joinKey,
                  joinType,
                  tableCalculations,
                  sorts: toMergedSorts({
                      sorts: metricQuery.sorts,
                      primarySourceId: primaryRuntimeId,
                      primaryMetricQuery: metricQuery,
                      joinKey,
                  }),
                  limit: metricQuery.limit,
              }
            : null;
    const itemMaps = [
        first.primaryItemMap,
        ...sourceSetups.map((setup) => setup.additionalItemMap),
    ];
    const joinFieldTypes: MergeFieldTypes = Object.fromEntries(
        handles.map((id, index) => [
            sourceNames.nameByHandle[id],
            Object.fromEntries(
                Object.entries(itemMaps[index]).flatMap(([fieldId, item]) =>
                    isDimension(item) || isCustomDimension(item)
                        ? [
                              [
                                  fieldId,
                                  {
                                      type: convertItemTypeToDimensionType(
                                          item,
                                      ),
                                      timeInterval: isDimension(item)
                                          ? (item.timeInterval ?? null)
                                          : null,
                                      timestampDomain: isDimension(item)
                                          ? item.timestampDomain
                                          : undefined,
                                  },
                              ],
                          ]
                        : [],
                ),
            ),
        ]),
    );
    const joinKeyErrors = mergeQuery
        ? validateMergeQuery(mergeQuery, joinFieldTypes).filter(
              (error) =>
                  error.kind === MergeQueryErrorKind.JOIN_KEY_TYPE_MISMATCH ||
                  error.kind ===
                      MergeQueryErrorKind.JOIN_KEY_GRANULARITY_MISMATCH,
          )
        : [];
    const missingSource = sourceSetups.find(
        (setup) => !setup.additionalSource.exploreName,
    );
    const missingMetric = sourceSetups.find(
        (setup) => setup.additionalSource.metrics.length === 0,
    );
    const setupStep =
        additionalSources.length === 0 || missingSource
            ? 'Choose data to combine'
            : missingMetric
              ? `Add at least one metric from ${missingMetric.additionalExploreLabel ?? 'the added table'}`
              : effectiveParts.length === 0 ||
                  editorKeys.length !== effectiveParts.length
                ? 'Pick a field from each query to join on'
                : null;
    const blockingReason =
        setupStep ??
        (joinKeyErrors.length > 0
            ? 'These queries cannot be joined on that field'
            : fanOut.length > 0
              ? 'A field is only in one of the queries'
              : null);
    const exploreLabels = [
        first.primaryExploreLabel ?? 'First data',
        ...sourceSetups.map(
            (setup) => setup.additionalExploreLabel ?? 'Choose data to combine',
        ),
    ];
    // A repeated explore is told apart by the name it runs under
    const labels = exploreLabels.map((label, index) =>
        exploreLabels.indexOf(label) !== exploreLabels.lastIndexOf(label)
            ? `${label} · ${sourceNames.nameByHandle[handles[index]]}`
            : label,
    );
    const labelFor = (fieldId: string) => {
        const item = itemMaps.map((items) => items[fieldId]).find(Boolean);
        return item ? getItemLabelWithoutTableName(item) : fieldId;
    };
    const fieldLabel = (fieldId: string | null) =>
        fieldId ? labelFor(fieldId) : '?';
    const keySummary =
        handles.length === 2
            ? effectiveParts
                  .map((part) =>
                      handles
                          .map(
                              (id, index) =>
                                  `${labels[index]} · ${fieldLabel(part.fieldIdBySourceId[id])}`,
                          )
                          .join(' = '),
                  )
                  .join(' AND ')
            : effectiveParts
                  .map((part) =>
                      fieldLabel(part.fieldIdBySourceId[PRIMARY_SOURCE_ID]),
                  )
                  .join(' + ');
    return {
        primaryExploreLabel: first.primaryExploreLabel,
        primaryItemMap: first.primaryItemMap,
        availablePrimaryJoinItems: first.availablePrimaryJoinItems,
        joinFieldLabel: first.joinFieldLabel,
        sourceSetups: sourceSetups.map((setup, index) => ({
            ...setup,
            label: labels[index + 1],
            // Per key part: the top-ranked field for a source not yet mapped
            suggestedJoinFields: setup.effectiveParts.map((part) => {
                const primaryFieldId =
                    part.fieldIdBySourceId[PRIMARY_SOURCE_ID];
                if (
                    !primaryFieldId ||
                    part.fieldIdBySourceId[setup.additionalSourceId]
                ) {
                    return null;
                }
                const [top] = setup.getJoinCandidates(
                    'additional',
                    primaryFieldId,
                ).suggested;
                if (!top) return null;
                // A joined table's field is named with its table, as in the picker
                const fromJoinedTable =
                    isDimension(top) &&
                    top.table !== additionalExplores[index]?.baseTable;
                return {
                    fieldId: getItemId(top),
                    label: fromJoinedTable
                        ? getItemLabel(top)
                        : getItemLabelWithoutTableName(top),
                };
            }),
        })),
        keySummary,
        joinTypeLabel: getMergeJoinTypeLabel(
            joinType,
            first.primaryExploreLabel ?? 'the first source',
        ),
        sourceLabels: labels,
        labelFor,
        effectiveParts,
        /** Each source's filters as they run, keyed by editor handle. */
        filtersBySourceId,
        mergeQuery,
        fanOut,
        joinKeyErrors,
        setupStep,
        isIncomplete: setupStep !== null,
        blockingReason,
        canRun: !!mergeQuery && blockingReason === null,
    };
};
