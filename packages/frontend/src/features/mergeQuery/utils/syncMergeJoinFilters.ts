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

const hasRuleOn = (
    group: FilterGroup | undefined,
    fieldIds: Set<string>,
): boolean =>
    !!group &&
    itemsOf(group).some((item): boolean =>
        'and' in item || 'or' in item
            ? hasRuleOn(item, fieldIds)
            : fieldIds.has(fieldIdOf(item) ?? ''),
    );

/**
 * A source whose join field is filled in by default, and has no filter on
 * it yet, takes the first source's join-key filters on it. Stored filters
 * are never changed: a chosen field, or a default field that already has a
 * filter, runs with what is stored, so a saved chart runs as it was saved.
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
                    !joinParts[index]?.fieldIdBySourceId[sourceId] &&
                    !hasRuleOn(filters.dimensions, new Set([fieldId])) &&
                    hasRuleOn(primary.dimensions, new Set([primaryFieldId]))
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
            if (parts.length === 0) return [sourceId, filters];
            changed = true;
            return [
                sourceId,
                syncMergeJoinFilters({
                    changedSourceId: PRIMARY_SOURCE_ID,
                    filtersBySourceId: {
                        [PRIMARY_SOURCE_ID]: primary,
                        [sourceId]: filters,
                    },
                    joinParts: parts,
                })[sourceId],
            ];
        }),
    );
    return changed ? next : filtersBySourceId;
};
