import { useEffect, useMemo, useState } from 'react';
import { useDebounce } from 'react-use';
import { useFieldValues } from '../../../../../hooks/useFieldValues';

type Normalizer<T, Comparable = T> = (a: T) => Comparable;

export const comparator = <T>(normalizer: Normalizer<T> = (a) => a) => {
    return (a: T, b: T): boolean => {
        return normalizer(a) === normalizer(b);
    };
};

export const toggleValueFromArray = <T>(
    values: T[],
    value: T,
    normalizer: Normalizer<T> = (a) => a,
): T[] => {
    if (values.map(normalizer).includes(normalizer(value))) {
        const itemComparator = comparator(normalizer);
        return values.filter((v) => !itemComparator(v, value));
    } else {
        return [...values, value];
    }
};

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

const isString = (value: unknown): value is string =>
    !!value && typeof value === 'string';

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
                [fieldId]: new Set([
                    ...(prev[fieldId] || []),
                    ...(data || []).filter(isString),
                ]),
            };
        });
    }, [fieldId, data]);

    return {
        isSearching,
        isFetchingInitialData: !data && isLoading,
        items: cachedItems[fieldId],
        searchQuery: search,
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

    const {
        items,
        isSearching,
        isFetchingInitialData,
        searchQuery,
        setSearch,
    } = useDebouncedSearch(projectUuid, fieldId, suggestions.length <= 0);

    useEffect(() => {
        setOptions(new Set([...suggestions, ...values, ...(items || [])]));
    }, [suggestions, values, items]);

    return {
        options,
        searchQuery,
        setSearch,
        isSearching,
        isFetchingInitialData,
    };
};
