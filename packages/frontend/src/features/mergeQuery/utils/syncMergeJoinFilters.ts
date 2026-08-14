import {
    type FilterGroup,
    type FilterGroupItem,
    type FilterRule,
    type Filters,
} from '@lightdash/common';
import { type MergeJoinPart } from '../context/context';

type MergeSide = 'a' | 'b';

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
    changedSide,
    filtersA,
    filtersB,
    joinParts,
}: {
    changedSide: MergeSide;
    filtersA: Filters;
    filtersB: Filters;
    joinParts: MergeJoinPart[];
}): { filtersA: Filters; filtersB: Filters } => {
    const fieldMap = new Map<string, string>();
    joinParts.forEach(({ fieldA, fieldB }) => {
        if (!fieldA || !fieldB) return;
        fieldMap.set(
            changedSide === 'a' ? fieldA : fieldB,
            changedSide === 'a' ? fieldB : fieldA,
        );
    });

    if (fieldMap.size === 0) return { filtersA, filtersB };

    if (changedSide === 'a') {
        return {
            filtersA,
            filtersB: {
                ...filtersB,
                dimensions: replaceJoinKeyRules(
                    filtersB.dimensions,
                    filtersA.dimensions,
                    fieldMap,
                ),
            },
        };
    }

    return {
        filtersA: {
            ...filtersA,
            dimensions: replaceJoinKeyRules(
                filtersA.dimensions,
                filtersB.dimensions,
                fieldMap,
            ),
        },
        filtersB,
    };
};
