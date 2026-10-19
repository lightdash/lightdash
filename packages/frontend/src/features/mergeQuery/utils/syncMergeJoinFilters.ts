import {
    type FilterGroup,
    type FilterGroupItem,
    type FilterRule,
    type Filters,
} from '@lightdash/common';
import { PRIMARY_SOURCE_ID } from '../constants';
import { type MergeJoinPart } from '../context/context';

export type FiltersBySourceId = Record<string, Filters>;

const itemsOf = (group: FilterGroup): FilterGroupItem[] =>
    'and' in group ? group.and : group.or;

const rebuildGroup = (
    group: FilterGroup,
    items: FilterGroupItem[],
): FilterGroup =>
    'and' in group ? { ...group, and: items } : { ...group, or: items };

const fieldIdOf = (rule: FilterRule): string | null =>
    'fieldId' in rule.target ? rule.target.fieldId : null;

const transformGroup = (
    group: FilterGroup | undefined,
    transformRule: (rule: FilterRule) => FilterRule | null,
): FilterGroup | undefined => {
    if (!group) return undefined;

    const items = itemsOf(group).flatMap<FilterGroupItem>((item) => {
        if ('and' in item || 'or' in item) {
            const transformed = transformGroup(item, transformRule);
            return transformed ? [transformed] : [];
        }
        const transformed = transformRule(item);
        return transformed ? [transformed] : [];
    });

    return items.length > 0 ? rebuildGroup(group, items) : undefined;
};

const replaceJoinKeyRules = (
    current: FilterGroup | undefined,
    source: FilterGroup | undefined,
    fieldMap: Map<string, string>,
): FilterGroup | undefined => {
    const targetFields = new Set(fieldMap.values());
    const querySpecific = transformGroup(current, (rule) => {
        const fieldId = fieldIdOf(rule);
        return fieldId && targetFields.has(fieldId) ? null : rule;
    });
    const shared = transformGroup(source, (rule) => {
        const fieldId = fieldIdOf(rule);
        const targetFieldId = fieldId ? fieldMap.get(fieldId) : undefined;
        return targetFieldId
            ? { ...rule, target: { fieldId: targetFieldId } }
            : null;
    });

    if (!querySpecific) return shared;
    if (!shared) return querySpecific;
    return {
        id: `merge-shared-${querySpecific.id}-${shared.id}`,
        and: [querySpecific, shared],
    };
};

export const syncMergeJoinFilters = ({
    changedSourceId,
    filtersBySourceId,
    joinParts,
}: {
    changedSourceId: string;
    filtersBySourceId: FiltersBySourceId;
    joinParts: MergeJoinPart[];
}): FiltersBySourceId => {
    const changedFilters = filtersBySourceId[changedSourceId];
    if (!changedFilters) return filtersBySourceId;

    return Object.fromEntries(
        Object.entries(filtersBySourceId).map(([targetSourceId, filters]) => {
            if (targetSourceId === changedSourceId) {
                return [targetSourceId, filters];
            }
            const fieldMap = new Map<string, string>();
            joinParts.forEach(({ fieldIdBySourceId }) => {
                const changedField = fieldIdBySourceId[changedSourceId];
                const targetField = fieldIdBySourceId[targetSourceId];
                if (changedField && targetField) {
                    fieldMap.set(changedField, targetField);
                }
            });
            if (fieldMap.size === 0) return [targetSourceId, filters];
            return [
                targetSourceId,
                {
                    ...filters,
                    dimensions: replaceJoinKeyRules(
                        filters.dimensions,
                        changedFilters.dimensions,
                        fieldMap,
                    ),
                },
            ];
        }),
    );
};

const ruleIdsOn = (
    group: FilterGroup | undefined,
    fieldIds: Set<string>,
): string[] =>
    group
        ? itemsOf(group).flatMap((item): string[] => {
              if ('and' in item || 'or' in item) {
                  return ruleIdsOn(item, fieldIds);
              }
              return fieldIds.has(fieldIdOf(item) ?? '') ? [item.id] : [];
          })
        : [];

const mapRules = (
    filters: Filters,
    transformRule: (rule: FilterRule) => FilterRule | null,
): Filters => ({
    ...filters,
    dimensions: transformGroup(filters.dimensions, transformRule),
});

/** The filters without their rules on the given fields. */
export const withoutRulesOn = (
    filters: Filters,
    fieldIds: Set<string>,
): Filters =>
    mapRules(filters, (rule) =>
        fieldIds.has(fieldIdOf(rule) ?? '') ? null : rule,
    );

const fieldsOf = (parts: MergeJoinPart[], sourceId: string) =>
    new Set(
        parts.flatMap(({ fieldIdBySourceId }) => {
            const fieldId = fieldIdBySourceId[sourceId];
            return fieldId ? [fieldId] : [];
        }),
    );

/** The reference's join-key rules on the target's key fields, replacing earlier copies anywhere. */
const shareKeyRules = ({
    reference,
    target,
    referenceId,
    targetId,
    parts,
}: {
    reference: Filters;
    target: Filters;
    referenceId: string;
    targetId: string;
    parts: MergeJoinPart[];
}): Filters => {
    const copies = new Set(
        ruleIdsOn(reference.dimensions, fieldsOf(parts, referenceId)),
    );
    return syncMergeJoinFilters({
        changedSourceId: referenceId,
        filtersBySourceId: {
            [referenceId]: reference,
            [targetId]: mapRules(target, (rule) =>
                copies.has(rule.id) ? null : rule,
            ),
        },
        joinParts: parts,
    })[targetId];
};

/**
 * A source whose join field is filled in by default takes the first
 * source's join-key filters on it. A chosen field keeps the filters stored
 * with it, so a saved chart runs as it was saved.
 */
export const deriveSharedJoinFilters = ({
    filtersBySourceId,
    joinParts,
    effectiveParts,
}: {
    filtersBySourceId: FiltersBySourceId;
    /** The fields chosen; null where the effective field is a default. */
    joinParts: MergeJoinPart[];
    effectiveParts: MergeJoinPart[];
}): FiltersBySourceId => {
    const primary = filtersBySourceId[PRIMARY_SOURCE_ID];
    if (!primary) return filtersBySourceId;
    let changed = false;
    const next = Object.fromEntries(
        Object.entries(filtersBySourceId).map(([sourceId, filters]) => {
            if (sourceId === PRIMARY_SOURCE_ID) return [sourceId, filters];
            const parts = effectiveParts.flatMap((part, index) => {
                const fieldId = part.fieldIdBySourceId[sourceId];
                const primaryFieldId =
                    part.fieldIdBySourceId[PRIMARY_SOURCE_ID];
                return fieldId &&
                    primaryFieldId &&
                    !joinParts[index]?.fieldIdBySourceId[sourceId]
                    ? [
                          {
                              fieldIdBySourceId: {
                                  [PRIMARY_SOURCE_ID]: primaryFieldId,
                                  [sourceId]: fieldId,
                              },
                          },
                      ]
                    : [];
            });
            const isShared =
                ruleIdsOn(
                    primary.dimensions,
                    fieldsOf(parts, PRIMARY_SOURCE_ID),
                ).length > 0 ||
                ruleIdsOn(filters.dimensions, fieldsOf(parts, sourceId))
                    .length > 0;
            if (parts.length === 0 || !isShared) return [sourceId, filters];
            changed = true;
            return [
                sourceId,
                shareKeyRules({
                    reference: primary,
                    target: filters,
                    referenceId: PRIMARY_SOURCE_ID,
                    targetId: sourceId,
                    parts,
                }),
            ];
        }),
    );
    return changed ? next : filtersBySourceId;
};

/**
 * Filters after one source's join field changes: the join-key filters move
 * with it, taken from another source on the same key part when one shares
 * any, otherwise its own rules move to the new field.
 */
export const moveJoinFieldFilters = ({
    filtersBySourceId,
    effectiveParts,
    index,
    sourceId,
    fieldId,
}: {
    filtersBySourceId: FiltersBySourceId;
    effectiveParts: MergeJoinPart[];
    index: number;
    sourceId: string;
    fieldId: string | null;
}): FiltersBySourceId => {
    const part = effectiveParts[index];
    const target = filtersBySourceId[sourceId];
    const left = part?.fieldIdBySourceId[sourceId] ?? null;
    if (!part || !target || !fieldId || left === fieldId) {
        return filtersBySourceId;
    }
    const referenceId = Object.keys(filtersBySourceId).find(
        (id) => id !== sourceId && part.fieldIdBySourceId[id],
    );
    const referenceFieldId = referenceId
        ? part.fieldIdBySourceId[referenceId]
        : null;
    const sharesRules =
        !!referenceId &&
        !!referenceFieldId &&
        ruleIdsOn(
            filtersBySourceId[referenceId].dimensions,
            new Set([referenceFieldId]),
        ).length > 0;
    if (!referenceId || !referenceFieldId || !sharesRules) {
        return {
            ...filtersBySourceId,
            [sourceId]: mapRules(target, (rule) =>
                left && fieldIdOf(rule) === left
                    ? { ...rule, target: { fieldId } }
                    : rule,
            ),
        };
    }
    return {
        ...filtersBySourceId,
        [sourceId]: shareKeyRules({
            reference: filtersBySourceId[referenceId],
            target: mapRules(target, (rule) =>
                left && fieldIdOf(rule) === left ? null : rule,
            ),
            referenceId,
            targetId: sourceId,
            parts: [
                {
                    fieldIdBySourceId: {
                        [referenceId]: referenceFieldId,
                        [sourceId]: fieldId,
                    },
                },
            ],
        }),
    };
};
