import {
    ApiError,
    FieldValueSearchResult,
    FilterableField,
    FilterableItem,
    getItemId,
    isField,
} from '@lightdash/common';
import { uniq } from 'lodash-es';
import { useMemo, useState } from 'react';
import { useQuery, UseQueryOptions } from 'react-query';
import { useDebounce } from 'react-use';
import { lightdashApi } from '../api';

const getFieldValues = async (
    projectId: string,
    table: string | undefined,
    fieldId: string,
    search: string,
    limit: number = 100,
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
    const [debouncedSearch, setDebouncedSearch] = useState<string>(search);
    const [searches, setSearches] = useState<string[]>([search]);

    const [results, setResults] = useState<string[]>(initialData);

    const tableName = useMemo(
        () => (isField(field) ? field.table : undefined),
        [field],
    );

    const fieldId = useMemo(() => getItemId(field), [field]);

    const query = useQuery<FieldValueSearchResult, ApiError>(
        [
            'project',
            projectId,
            tableName,
            field.name,
            'search',
            debouncedSearch,
        ],
        () => getFieldValues(projectId, tableName, fieldId, debouncedSearch),
        {
            // make sure we don't cache for too long
            staleTime: 60 * 1000, // 1 minute
            cacheTime: 60 * 1000, // 1 minute
            ...useQueryOptions,
            enabled: !!tableName,
            onSuccess: (data) => {
                const { results: newResults, search: newSearch } = data;

                if (!searches.includes(newSearch)) {
                    setSearches((prevSearches) => [...prevSearches, newSearch]);
                }

                setResults((prevResults) => {
                    const normalizedNewResults = newResults.filter(
                        (result): result is string =>
                            typeof result === 'string',
                    );

                    const uniqResults = uniq([
                        ...prevResults,
                        ...normalizedNewResults,
                    ]);

                    const sortedResults = uniqResults.sort((a, b) =>
                        a.localeCompare(b, undefined, {
                            sensitivity: 'base',
                        }),
                    );

                    return sortedResults;
                });

                useQueryOptions?.onSuccess?.(data);
            },
        },
    );

    useDebounce(
        () => setDebouncedSearch(search),
        !debounce || searches.includes(search) ? 0 : 500,
        [search],
    );

    return { ...query, searches, results: results };
};
