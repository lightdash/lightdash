import {
    getFilterRulesFromGroup,
    getItemId,
    isField,
    type AndFilterGroup,
    type ApiError,
    type FieldValueSearchResult,
    type FilterableItem,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebounce } from 'react-use';
import { lightdashApi } from '../api';
import useEmbed from '../ee/providers/Embed/useEmbed';

export const MAX_AUTOCOMPLETE_RESULTS = 100;

const getEmbedFilterValues = async (options: {
    embedToken: string;
    projectId: string;
    filterId: string;
    search: string;
    forceRefresh: boolean;
    filters: AndFilterGroup | undefined;
}) => {
    return lightdashApi<FieldValueSearchResult>({
        url: `/embed/${options.projectId}/filter/${options.filterId}/search`,
        method: 'POST',
        headers: {
            'Lightdash-Embed-Token': options.embedToken!,
        },
        body: JSON.stringify({
            search: options.search,
            limit: MAX_AUTOCOMPLETE_RESULTS,
            filters: options.filters,
            forceRefresh: options.forceRefresh,
        }),
    });
};

const getFieldValues = async (
    projectId: string,
    table: string | undefined,
    fieldId: string,
    search: string,
    forceRefresh: boolean,
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
            forceRefresh,
        }),
    });
};

export const useFieldValues = (
    search: string,
    initialData: string[],
    projectId: string | undefined,
    field: FilterableItem,
    filterId: string | undefined,
    filters: AndFilterGroup | undefined,
    debounce: boolean = true,
    forceRefresh: boolean = false,
    useQueryOptions?: UseQueryOptions<FieldValueSearchResult, ApiError>,
) => {
    const { embedToken } = useEmbed();
    const [fieldName, setFieldName] = useState<string>(field.name);
    const [debouncedSearch, setDebouncedSearch] = useState<string>(search);
    const [searches, setSearches] = useState(new Set<string>());
    const [results, setResults] = useState(new Set(initialData));
    const [resultCounts, setResultCounts] = useState<Map<string, number>>(
        new Map(),
    );
    const [refreshedAt, setRefreshedAt] = useState<Date>(new Date());

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
            setRefreshedAt(new Date(data.refreshedAt));
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
    const cachekey = [
        'project',
        projectId,
        tableName,
        fieldName,
        'search',
        debouncedSearch,
    ];
    const query = useQuery<FieldValueSearchResult, ApiError>(
        cachekey,
        () => {
            if (embedToken && filterId && projectId) {
                return getEmbedFilterValues({
                    embedToken,
                    projectId,
                    filterId,
                    search: debouncedSearch,
                    forceRefresh,
                    filters,
                });
            } else {
                return getFieldValues(
                    projectId!,
                    tableName,
                    fieldId,
                    debouncedSearch,
                    forceRefresh,
                    filters,
                );
            }
        },
        {
            // make sure we don't cache for too long
            cacheTime: 60 * 1000, // 1 minute
            ...useQueryOptions,
            enabled: !!tableName && !!projectId,
            staleTime: 0,
            onSuccess: (data) => {
                const { results: newResults, search: newSearch } = data;

                const normalizedNewResults = newResults.filter(
                    (result): result is string => typeof result === 'string',
                );

                const normalizedData = {
                    search: newSearch,
                    results: normalizedNewResults,
                    cached: data.cached,
                    refreshedAt: data.refreshedAt,
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
    }, [initialData, fieldName, field.name, forceRefresh]);

    return {
        ...query,
        debouncedSearch,
        searches,
        results,
        resultCounts,
        refreshedAt,
    };
};
