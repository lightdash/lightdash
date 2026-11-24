import { useDeferredValue, useMemo, useState } from 'react';
import { type Field } from './model';

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

/**
 * Every field, those not in use dimmed by the list, except an integration's
 * internal fields: they show only once in use.
 */
export const filterFields = (fields: Field[], query: string): Field[] => {
    const needle = query.trim().toLowerCase();
    return fields.filter((field) => {
        if (field.isInternal && !field.inUse) return false;
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
    const [query, setQuery] = useState('');
    // Typing stays responsive on 2,000+ fields; the list catches up.
    const deferredQuery = useDeferredValue(query);
    const sorted = useMemo(() => byKind(allFields), [allFields]);
    const fields = useMemo(() => {
        const matching = filterFields(sorted, deferredQuery);
        const open = openFieldId
            ? sorted.find(({ id }) => id === openFieldId)
            : undefined;
        if (!open || matching.includes(open)) return matching;
        // Keep the open row where it sits in the full list.
        const keep = new Set(matching).add(open);
        return sorted.filter((field) => keep.has(field));
    }, [sorted, deferredQuery, openFieldId]);
    return {
        fields,
        toolbarProps: { query, onQueryChange: setQuery },
    };
};
