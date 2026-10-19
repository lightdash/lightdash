import {
    type FilterGroup,
    type FilterGroupItem,
    type FilterRule,
    type Filters,
} from '@lightdash/common';
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

const keyFieldsOf = (parts: MergeJoinPart[], sourceId: string) =>
    new Set(
        parts.flatMap(({ fieldIdBySourceId }) => {
            const fieldId = fieldIdBySourceId[sourceId];
            return fieldId ? [fieldId] : [];
        }),
    );

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
 * When a source gains a join-key field, it takes the join-key filters the
 * other sources already share, from the first source whose key is unchanged.
 * A source whose key field moved drops the rules on the field it left.
 */
export const applySharedJoinFilters = ({
    filtersBySourceId,
    previousParts,
    joinParts,
}: {
    filtersBySourceId: FiltersBySourceId;
    previousParts: MergeJoinPart[];
    joinParts: MergeJoinPart[];
}): FiltersBySourceId => {
    const sourceIds = Object.keys(filtersBySourceId);
    const changes = new Map(
        sourceIds.map((sourceId) => {
            const before = keyFieldsOf(previousParts, sourceId);
            const after = keyFieldsOf(joinParts, sourceId);
            return [
                sourceId,
                {
                    added: [...after].filter((id) => !before.has(id)),
                    left: [...before].filter((id) => !after.has(id)),
                },
            ];
        }),
    );
    const targets = sourceIds.filter(
        (sourceId) => (changes.get(sourceId)?.added.length ?? 0) > 0,
    );
    const referenceId = sourceIds.find(
        (sourceId) =>
            !targets.includes(sourceId) &&
            hasRuleOn(
                filtersBySourceId[sourceId].dimensions,
                keyFieldsOf(joinParts, sourceId),
            ),
    );
    if (targets.length === 0 || !referenceId) return filtersBySourceId;

    const next = { ...filtersBySourceId };
    targets.forEach((targetId) => {
        const left = changes.get(targetId)?.left ?? [];
        const filters = next[targetId];
        const synced = syncMergeJoinFilters({
            changedSourceId: referenceId,
            filtersBySourceId: {
                [referenceId]: next[referenceId],
                [targetId]: {
                    ...filters,
                    dimensions: replaceJoinKeyRules(
                        filters.dimensions,
                        undefined,
                        new Map(left.map((id) => [id, id])),
                    ),
                },
            },
            joinParts,
        });
        next[targetId] = synced[targetId];
    });
    return next;
};
