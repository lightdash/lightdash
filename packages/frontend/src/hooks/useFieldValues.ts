import {
    FeatureFlags,
    getFilterRulesFromGroup,
    getItemId,
    isField,
    QueryHistoryStatus,
    type AndFilterGroup,
    type ApiError,
    type ApiExecuteAsyncFieldValueSearchResults,
    type ApiGetAsyncQueryResults,
    type DashboardFilterRule,
    type FieldValueSearchResult,
    type FilterableItem,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebounce } from 'react-use';
import { lightdashApi } from '../api';
import useEmbed from '../ee/providers/Embed/useEmbed';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

export const MAX_AUTOCOMPLETE_RESULTS = 50;

/**
 * Strip tileTargets from filter rules before sending to the API.
 * tileTargets are only used client-side to determine filter-tile relationships
 * and can be very large (100+ entries per filter), bloating the request payload.
 */
const stripTileTargetsFromFilters = (
    filters: AndFilterGroup | undefined,
): AndFilterGroup | undefined => {
    if (!filters) return undefined;
    return {
        ...filters,
        and: filters.and.map((rule) => {
            if ('tileTargets' in rule) {
                const { tileTargets, ...rest } = rule as DashboardFilterRule;
                return rest;
            }
            return rule;
        }),
    };
};

const getEmbedFilterValues = async (options: {
    embedToken: string;
    projectId: string;
    filterId: string;
    search: string;
    forceRefresh: boolean;
    filters: AndFilterGroup | undefined;
    tableName: string | undefined;
    fieldId: string | undefined;
}) => {
    return lightdashApi<FieldValueSearchResult>({
        url: `/embed/${options.projectId}/filter/${options.filterId}/search`,
        method: 'POST',
        body: JSON.stringify({
            search: options.search,
            limit: MAX_AUTOCOMPLETE_RESULTS,
            filters: stripTileTargetsFromFilters(options.filters),
            forceRefresh: options.forceRefresh,
            tableName: options.tableName,
            fieldId: options.fieldId,
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
    parameterValues?: ParametersValuesMap,
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
            filters: stripTileTargetsFromFilters(filters),
            forceRefresh,
            parameters: parameterValues,
        }),
    });
};

export const MAX_POLL_ATTEMPTS = 30; // ~30s with backoff (250ms → 1s)

export const pollForFieldValueResults = async (
    projectUuid: string,
    queryUuid: string,
    backoffMs: number = 250,
    attempt: number = 0,
): Promise<ApiGetAsyncQueryResults> => {
    if (attempt >= MAX_POLL_ATTEMPTS) {
        throw new Error('Field value search timed out. Please try again.');
    }

    const results = await lightdashApi<ApiGetAsyncQueryResults>({
        url: `/projects/${projectUuid}/query/${queryUuid}`,
        version: 'v2',
        method: 'GET',
        body: undefined,
    });

    if (
        results.status === QueryHistoryStatus.PENDING ||
        results.status === QueryHistoryStatus.QUEUED ||
        results.status === QueryHistoryStatus.EXECUTING
    ) {
        const nextBackoff = Math.min(backoffMs * 2, 1000);
        await new Promise((resolve) => {
            setTimeout(resolve, backoffMs);
        });
        return pollForFieldValueResults(
            projectUuid,
            queryUuid,
            nextBackoff,
            attempt + 1,
        );
    }

    return results;
};

const getFieldValuesAsync = async (
    projectId: string,
    table: string | undefined,
    fieldId: string,
    search: string,
    forceRefresh: boolean,
    filters: AndFilterGroup | undefined,
    limit: number = MAX_AUTOCOMPLETE_RESULTS,
    parameterValues?: ParametersValuesMap,
): Promise<FieldValueSearchResult> => {
    if (!table) {
        throw new Error('Table is required to search for field values');
    }

    const executeResult =
        await lightdashApi<ApiExecuteAsyncFieldValueSearchResults>({
            url: `/projects/${projectId}/query/field-values`,
            version: 'v2',
            method: 'POST',
            body: JSON.stringify({
                table,
                fieldId,
                search,
                limit,
                filters: stripTileTargetsFromFilters(filters),
                forceRefresh,
                parameters: parameterValues,
            }),
        });

    const queryResult = await pollForFieldValueResults(
        projectId,
        executeResult.queryUuid,
    );

    if (
        queryResult.status === QueryHistoryStatus.ERROR ||
        queryResult.status === QueryHistoryStatus.EXPIRED
    ) {
        throw new Error(queryResult.error || 'Error fetching field values');
    }

    if (queryResult.status !== QueryHistoryStatus.READY) {
        throw new Error('Unexpected query status');
    }

    const results: string[] = queryResult.rows
        .map((row) => {
            const cell = row[fieldId];
            if (!cell?.value) return undefined;
            const { raw } = cell.value;
            if (raw === null || raw === undefined) return undefined;
            return String(raw);
        })
        .filter((v): v is string => v !== undefined);

    return {
        search,
        results,
        cached: executeResult.cacheMetadata.cacheHit,
        refreshedAt: executeResult.cacheMetadata.cacheUpdatedTime
            ? new Date(executeResult.cacheMetadata.cacheUpdatedTime)
            : new Date(),
    };
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
    parameterValues?: ParametersValuesMap,
) => {
    const { embedToken } = useEmbed();
    const { data: resultsCacheFlag } = useServerFeatureFlag(
        FeatureFlags.ResultsCacheEnabled,
    );
    const useAsyncPath = resultsCacheFlag?.enabled === true;
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
            setSearches((previousSearches) => {
                const nextSearches = new Set(previousSearches);
                nextSearches.add(data.search);
                return nextSearches;
            });

            setResultCounts((previousResultCounts) => {
                const nextResultCounts = new Map(previousResultCounts);
                nextResultCounts.set(data.search, data.results.length);
                return nextResultCounts;
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
        parameterValues,
        useAsyncPath ? 'v2' : 'v1',
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
                    tableName,
                    fieldId,
                });
            }
            if (useAsyncPath) {
                return getFieldValuesAsync(
                    projectId!,
                    tableName,
                    fieldId,
                    debouncedSearch,
                    forceRefresh,
                    filters,
                    undefined,
                    parameterValues,
                );
            }
            return getFieldValues(
                projectId!,
                tableName,
                fieldId,
                debouncedSearch,
                forceRefresh,
                filters,
                undefined,
                parameterValues,
            );
        },
        {
            // make sure we don't cache for too long
            cacheTime: 60 * 1000, // 1 minute
            ...useQueryOptions,
            enabled:
                !!tableName &&
                !!projectId &&
                useQueryOptions?.enabled !== false,
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

    const reset = useCallback(() => {
        setSearches(new Set<string>());
        setResults(new Set(initialData));
        setResultCounts(new Map());
    }, [initialData]);

    return {
        ...query,
        debouncedSearch,
        searches,
        results,
        resultCounts,
        refreshedAt,
        reset,
    };
};

// Wrapper hook that returns undefined for all values when field is undefined
export const useFieldValuesSafely = (
    search: string,
    initialData: string[],
    projectId: string | undefined,
    field: FilterableItem | undefined,
    filterId: string | undefined,
    filters: AndFilterGroup | undefined,
    debounce: boolean = true,
    forceRefresh: boolean = false,
    useQueryOptions?: UseQueryOptions<FieldValueSearchResult, ApiError>,
    parameterValues?: ParametersValuesMap,
) => {
    const fieldValuesResult = useFieldValues(
        search,
        initialData,
        projectId || '',
        field || {
            name: '',
            table: '',
            fieldType: 'dimension' as any,
            type: 'string' as any,
            label: '',
            tableLabel: '',
            sql: '',
            hidden: false,
        },
        filterId,
        filters,
        debounce,
        forceRefresh,
        {
            ...useQueryOptions,
            enabled: !!field && useQueryOptions?.enabled !== false,
        },
        parameterValues,
    );

    if (!field) {
        return {
            data: undefined,
            error: undefined,
            isLoading: undefined,
            isInitialLoading: undefined,
            isError: undefined,
            isSuccess: undefined,
            status: undefined,
            dataUpdatedAt: undefined,
            errorUpdatedAt: undefined,
            failureCount: undefined,
            failureReason: undefined,
            fetchStatus: undefined,
            isStale: undefined,
            isFetched: undefined,
            isFetchedAfterMount: undefined,
            isRefetching: undefined,
            isLoadingError: undefined,
            isRefetchError: undefined,
            refetch: undefined,
            remove: undefined,
            debouncedSearch: undefined,
            searches: undefined,
            results: undefined,
            resultCounts: undefined,
            refreshedAt: undefined,
            reset: undefined,
        };
    }

    return fieldValuesResult;
};
