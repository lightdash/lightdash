import {
    AndFilterGroup,
    ApiError,
    FieldValueSearchResult,
    FilterableItem,
    getFilterRulesFromGroup,
    getItemId,
    isField,
} from '@lightdash/common';
import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebounce } from 'react-use';
import { lightdashApi } from '../api';

export const MAX_AUTOCOMPLETE_RESULTS = 100;

const getFieldValues = async (
    projectId: string,
    table: string | undefined,
    fieldId: string,
    search: string,
    filters: AndFilterGroup | undefined,
    limit: number = MAX_AUTOCOMPLETE_RESULTS,
) => {
    if (!table) {
        throw new Error('Table is required to search for field values');
    }

    return lightdashApi<FieldValueSearchResult>({
        url: `/projects/${projectId}/field/${fieldId}/search`,
        method: 'POST',
        body: JSON.stringify({
            search,
            limit,
            table,
            filters,
        }),
    });
};

export const useFieldValues = (
    search: string,
    initialData: string[],
    projectId: string,
    field: FilterableItem,
    filters: AndFilterGroup | undefined,
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
            if (getFilterRulesFromGroup(filters).length > 0) {
                setSearches(new Set<string>());
                setResults(new Set(initialData));
                setResultCounts(new Map());
            }
            setSearches((s) => {
                return s.add(data.search);
            });

            setResultCounts((map) => {
                return map.set(data.search, data.results.length);
            });

            setResults((oldSet) => {
                return new Set(
                    [...oldSet, ...data.results].sort((a, b) =>
                        a.localeCompare(b),
                    ),
                );
            });
        },
        [filters, initialData],
    );
    const query = useQuery<FieldValueSearchResult, ApiError>(
        ['project', projectId, tableName, fieldName, 'search', debouncedSearch],
        () =>
            getFieldValues(
                projectId,
                tableName,
                fieldId,
                debouncedSearch,
                filters,
            ),
        {
            // make sure we don't cache for too long
            cacheTime: 60 * 1000, // 1 minute
            ...useQueryOptions,
            enabled: !!tableName,
            staleTime: 0,
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
