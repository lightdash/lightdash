import { useDeferredValue, useMemo, useState } from 'react';
import { type Field } from './model';

export type FieldFilter = 'all' | 'noDescription';

/** What the field search matches, lowercased once per field. */
const haystacks = new WeakMap<Field, string>();
const haystackOf = (field: Field): string => {
    let haystack = haystacks.get(field);
    if (haystack === undefined) {
        haystack = [field.label, field.name, field.definition.value]
            .join('\n')
            .toLowerCase();
        haystacks.set(field, haystack);
    }
    return haystack;
};

type FieldVisibility = {
    /** Fields not in use; only live data sources have them. */
    showHidden: boolean;
    /** Internal fields not in use, a live data source's plumbing. */
    showInternal: boolean;
};

export const filterFields = (
    fields: Field[],
    filter: FieldFilter,
    query: string,
    { showHidden, showInternal }: FieldVisibility,
): Field[] => {
    const needle = query.trim().toLowerCase();
    return fields.filter((field) => {
        if (!field.inUse && !(field.isInternal ? showInternal : showHidden))
            return false;
        if (filter === 'noDescription' && field.description.trim())
            return false;
        return !needle || haystackOf(field).includes(needle);
    });
};

/** Dimensions first, then metrics; the YAML order holds within each. */
const byKind = (fields: Field[]): Field[] => [
    ...fields.filter(({ fieldKind }) => fieldKind !== 'metric'),
    ...fields.filter(({ fieldKind }) => fieldKind === 'metric'),
];

export const useFieldListState = (
    allFields: Field[],
    /** The open row stays, whatever the filter says about it now. */
    openFieldId: string | null = null,
) => {
    const [showInternal, setShowInternal] = useState(false);
    // Fields not in use stay out of the way until asked for.
    const [showHidden, setShowHidden] = useState(false);
    const [filter, setFilter] = useState<FieldFilter>('all');
    const [query, setQuery] = useState('');
    // Typing stays responsive on 2,000+ fields; the list catches up.
    const deferredQuery = useDeferredValue(query);
    const sorted = useMemo(() => byKind(allFields), [allFields]);
    const fields = useMemo(() => {
        const matching = filterFields(sorted, filter, deferredQuery, {
            showHidden,
            showInternal,
        });
        const open = openFieldId
            ? sorted.find(({ id }) => id === openFieldId)
            : undefined;
        if (!open || matching.includes(open)) return matching;
        // Keep the open row where it sits in the full list.
        const keep = new Set(matching).add(open);
        return sorted.filter((field) => keep.has(field));
    }, [sorted, filter, deferredQuery, showHidden, showInternal, openFieldId]);
    // What Show hidden would add; offered when nothing else matches.
    const hiddenCount = useMemo(
        () =>
            showHidden
                ? 0
                : filterFields(sorted, filter, deferredQuery, {
                      showHidden: true,
                      showInternal,
                  }).length - fields.length,
        [sorted, filter, deferredQuery, showHidden, showInternal, fields],
    );
    return {
        fields,
        hiddenCount,
        onShowHidden: () => setShowHidden(true),
        toolbarProps: {
            filter,
            onFilterChange: setFilter,
            query,
            onQueryChange: setQuery,
            showInternal,
            onShowInternalChange: setShowInternal,
            hasInternal: allFields.some(({ isInternal }) => isInternal),
            showHidden,
            onShowHiddenChange: setShowHidden,
            hasHidden: allFields.some(
                ({ inUse, isInternal }) => !inUse && !isInternal,
            ),
        },
    };
};
