import {
    DimensionType,
    convertItemTypeToDimensionType,
    getItemLabelWithoutTableName,
    getItemId,
    getItemMap,
    isCustomDimension,
    isDimension,
    type MetricQuery,
} from '@lightdash/common';
import { type Explore } from '@lightdash/common';
import { PRIMARY_SOURCE_ID } from '../constants';
import { type MergeEditorSource, type MergeJoinPart } from '../context/context';
import { getMergeSourceMetricQuery } from './getMergeSourceMetricQuery';
import {
    rankJoinFieldCandidates,
    type JoinFieldCandidate,
    type RankedJoinFieldCandidates,
} from './rankJoinFieldCandidates';
export const getMergePairSetup = ({
    primaryExplore,
    additionalExplore,
    tableName,
    metricQuery,
    additionalSource,
    joinParts,
}: {
    primaryExplore: Explore | undefined;
    additionalExplore: Explore | undefined;
    tableName: string | undefined;
    metricQuery: MetricQuery;
    additionalSource: MergeEditorSource;
    joinParts: MergeJoinPart[];
}) => {
    const additionalSourceId = additionalSource.id;
    const additionalMetricQuery = getMergeSourceMetricQuery(
        additionalSource,
        metricQuery.limit,
    );
    const primaryItemMap = primaryExplore
        ? getItemMap(
              primaryExplore,
              metricQuery.additionalMetrics,
              metricQuery.tableCalculations,
              metricQuery.customDimensions,
          )
        : {};
    const additionalItemMap = additionalExplore
        ? getItemMap(
              additionalExplore,
              additionalMetricQuery.additionalMetrics,
              additionalMetricQuery.tableCalculations,
              additionalMetricQuery.customDimensions,
          )
        : {};
    /**
     * The best joinable pair among what each query already selects: matching
     * type class, matching grain for dates, dates preferred over everything
     * (they are almost always the key), same field name as the tiebreaker.
     * Only pairs the validator would accept are ever suggested — a suggestion
     * that gets refused is worse than none.
     */
    const suggestedPair = (() => {
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
    })();
    // A join key is any dimension of the source's explore, selected or not:
    // the leg groups by it and the merged result shows it once, as the key.
    // Custom dimensions remain limited to ones already present in the query
    // because they cannot be recreated by id.
    const availablePrimaryJoinItems = Object.entries(primaryItemMap).flatMap(
        ([id, item]) =>
            isDimension(item) ||
            (isCustomDimension(item) && metricQuery.dimensions.includes(id))
                ? [item]
                : [],
    );
    const availableAdditionalJoinItems = Object.entries(
        additionalItemMap,
    ).flatMap(([id, item]) =>
        isDimension(item) ||
        (isCustomDimension(item) && additionalSource.dimensions.includes(id))
            ? [item]
            : [],
    );
    // The field chosen on one side ranks the other side's candidates: the
    // validator's type and grain rules rule fields out, a shared name or
    // label recommends them.
    const getJoinCandidates = (
        side: 'primary' | 'additional',
        counterpartFieldId: string | null,
    ): RankedJoinFieldCandidates<JoinFieldCandidate> => {
        const counterpart = counterpartFieldId
            ? (side === 'primary' ? additionalItemMap : primaryItemMap)[
                  counterpartFieldId
              ]
            : undefined;
        return rankJoinFieldCandidates(
            side === 'primary'
                ? availablePrimaryJoinItems
                : availableAdditionalJoinItems,
            counterpart &&
                (isDimension(counterpart) || isCustomDimension(counterpart))
                ? counterpart
                : undefined,
        );
    };
    // The first key part defaults to the suggested pair among selected
    // fields, then to the one field the other side's choice recommends,
    // then to each query's first dimension while the explores are still
    // loading. Further parts start empty because there is no obvious default.
    const effectiveParts = (() => {
        const soleSuggestion = (
            side: 'primary' | 'additional',
            counterpartFieldId: string | null,
        ) => {
            const { suggested } = getJoinCandidates(side, counterpartFieldId);
            return suggested.length === 1 ? getItemId(suggested[0]) : null;
        };
        return joinParts.map((part, index) => {
            const chosenPrimary = part.fieldIdBySourceId[PRIMARY_SOURCE_ID];
            const chosenAdditional = part.fieldIdBySourceId[additionalSourceId];
            const savedName = part.name ? { name: part.name } : {};
            if (index > 0) {
                return {
                    ...savedName,
                    fieldIdBySourceId: {
                        [PRIMARY_SOURCE_ID]: chosenPrimary ?? null,
                        [additionalSourceId]: chosenAdditional ?? null,
                    },
                };
            }
            const primary =
                chosenPrimary ??
                suggestedPair?.[PRIMARY_SOURCE_ID] ??
                soleSuggestion('primary', chosenAdditional ?? null) ??
                metricQuery.dimensions[0] ??
                null;
            const additional =
                chosenAdditional ??
                (suggestedPair?.[PRIMARY_SOURCE_ID] === primary
                    ? suggestedPair?.[additionalSourceId]
                    : null) ??
                soleSuggestion('additional', primary) ??
                additionalSource.dimensions[0] ??
                null;
            return {
                ...savedName,
                fieldIdBySourceId: {
                    [PRIMARY_SOURCE_ID]: primary,
                    [additionalSourceId]: additional,
                },
            };
        });
    })();
    // Field ids are how the merge is addressed, but they are not what anyone
    // calls these things. Everything the user reads says the label.
    const labelFor = (fieldId: string) => {
        const item = primaryItemMap[fieldId] ?? additionalItemMap[fieldId];
        return item ? getItemLabelWithoutTableName(item) : fieldId;
    };
    // Recommend only strong semantic matches. Type compatibility alone is
    // too weak (many explores have several strings or dates), so a suggestion
    // also needs the same field name or user-facing label. Identifiers win
    // over dates when both are available.
    const suggestedAvailablePair = (() => {
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
    })();
    // What people call these tables, not what dbt does.
    const primaryExploreLabel = primaryExplore?.label ?? tableName;
    const additionalExploreLabel =
        additionalExplore?.label ?? additionalSource.exploreName;
    const primaryJoinField =
        effectiveParts[0]?.fieldIdBySourceId[PRIMARY_SOURCE_ID];
    const joinFieldLabel = primaryJoinField
        ? labelFor(primaryJoinField)
        : 'join key';
    return {
        additionalSource,
        additionalSourceId,
        additionalMetricQuery,
        effectiveParts,
        labelFor,
        primaryItemMap,
        additionalItemMap,
        joinFieldLabel,
        availablePrimaryJoinItems,
        availableAdditionalJoinItems,
        getJoinCandidates,
        suggestedAvailablePair,
        primaryExploreLabel,
        additionalExploreLabel,
    };
};
