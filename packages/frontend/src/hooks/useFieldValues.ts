import {
    ApiError,
    FieldValueSearchResult,
    FilterableItem,
    getItemId,
    isField,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, UseQueryOptions } from 'react-query';
import { useDebounce } from 'react-use';
import { lightdashApi } from '../api';

export const MAX_AUTOCOMPLETE_RESULTS = 100;

const getFieldValues = async (
    projectId: string,
    table: string | undefined,
    fieldId: string,
    search: string,
    limit: number = MAX_AUTOCOMPLETE_RESULTS,
) => {
    if (!table) {
        throw new Error('Table is required to search for field values');
    }

    return lightdashApi<FieldValueSearchResult>({
        url: `/projects/${projectId}/field/${fieldId}/search?value=${encodeURIComponent(
            search,
        )}&limit=${limit}&table=${table}`,
        method: 'GET',
        body: undefined,
    });
};

export const useFieldValues = (
    search: string,
    initialData: string[],
    projectId: string,
    field: FilterableItem,
    debounce: boolean = true,
    useQueryOptions?: UseQueryOptions<FieldValueSearchResult, ApiError>,
) => {
    const [fieldName, setFieldName] = useState<string>(field.name);
    const [debouncedSearch, setDebouncedSearch] = useState<string>(search);
    const [searches, setSearches] = useState(new Set<string>());
    const [results, setResults] = useState(new Set(initialData));
    const [resultCounts, setResultCounts] = useState<Map<string, number>>(
        new Map(),
    );

    const tableName = useMemo(
        () => (isField(field) ? field.table : undefined),
        [field],
    );

    const fieldId = useMemo(() => getItemId(field), [field]);

    const handleUpdateResults = useCallback(
        (data: FieldValueSearchResult<string>) => {
            setSearches((s) => {
                return s.add(data.search);
            });

            setResultCounts((map) => {
                return map.set(data.search, data.results.length);
            });

            setResults((oldSet) => {
                return new Set([...oldSet, ...data.results]);
            });
        },
        [setResults],
    );

    const query = useQuery<FieldValueSearchResult, ApiError>(
        ['project', projectId, tableName, fieldName, 'search', debouncedSearch],
        () => getFieldValues(projectId, tableName, fieldId, debouncedSearch),
        {
            // make sure we don't cache for too long
            staleTime: 60 * 1000, // 1 minute
            cacheTime: 60 * 1000, // 1 minute
            ...useQueryOptions,
            enabled: !!tableName,
            onSuccess: (data) => {
                const { results: newResults, search: newSearch } = data;

                const normalizedNewResults = newResults.filter(
                    (result): result is string => typeof result === 'string',
                );

                const normalizedData = {
                    search: newSearch,
                    results: normalizedNewResults,
                };

                handleUpdateResults(normalizedData);

                useQueryOptions?.onSuccess?.(normalizedData);
            },
        },
    );

    useDebounce(
        () => setDebouncedSearch(search),
        !debounce || searches.has(search) ? 0 : 500,
        [search],
    );

    // reset state when field changes
    useEffect(() => {
        if (!!fieldName && field.name !== fieldName) {
            setFieldName(field.name);
            setSearches(new Set<string>());
            setResults(new Set(initialData));
            setResultCounts(new Map());
        }
    }, [initialData, fieldName, field.name]);

    return {
        ...query,
        debouncedSearch,
        searches,
        results,
        resultCounts,
    };
};
