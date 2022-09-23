import { useEffect, useMemo, useState } from 'react';
import { useDebounce } from 'react-use';
import { useFieldValues } from '../../../../../hooks/useFieldValues';

export function toggleValueFromArray<T>(array: T[], value: T) {
    const copy = [...array];
    const index = copy.indexOf(value);

    if (index === -1) {
        copy.push(value);
    } else {
        copy.splice(index, 1);
    }
    return copy;
}

export function itemPredicate(
    query: string,
    item: string,
    index?: undefined | number,
    exactMatch?: undefined | false | true,
) {
    if (exactMatch) {
        return query === item;
    }
    return item.toLowerCase().includes(query.toLowerCase());
}

const useDebouncedSearch = (
    projectUuid: string,
    fieldId: string,
    forceSearch: boolean,
) => {
    const [cachedItems, setCachedItems] = useState({
        [fieldId]: new Set<string>(),
    });
    const [search, setSearch] = useState<string>();
    const [debouncedQuery, setDebouncedQuery] = useState<string>();
    useDebounce(
        () => {
            setDebouncedQuery(search);
        },
        500,
        [search],
    );
    const { data, isLoading } = useFieldValues(
        projectUuid,
        fieldId,
        debouncedQuery || '',
        10,
        forceSearch || !!search,
    );

    const isSearching = (search && search !== debouncedQuery) || isLoading;

    useEffect(() => {
        setCachedItems((prev) => {
            return {
                ...prev,
                [fieldId]: new Set([...(prev[fieldId] || []), ...(data || [])]),
            };
        });
    }, [fieldId, data]);

    return {
        isSearching,
        items: cachedItems[fieldId],
        setSearch,
    };
};

export const useAutoComplete = (
    value: string | string[],
    suggestions: string[],
    fieldId: string,
    projectUuid: string,
) => {
    const values = useMemo<string[]>(() => {
        if (value) {
            return Array.isArray(value) ? value : [value];
        }
        return [];
    }, [value]);
    const [options, setOptions] = useState(
        new Set([...suggestions, ...values]),
    );

    const { items, isSearching, setSearch } = useDebouncedSearch(
        projectUuid,
        fieldId,
        suggestions.length <= 0,
    );

    useEffect(() => {
        setOptions(new Set([...suggestions, ...values, ...(items || [])]));
    }, [suggestions, values, items]);

    return {
        options,
        setSearch,
        isSearching,
    };
};
