import { ApiError, FieldMatchResult } from '@lightdash/common';
import { uniq } from 'lodash-es';
import { useState } from 'react';
import { useQuery, UseQueryOptions } from 'react-query';
import { useDebounce } from 'react-use';
import { lightdashApi } from '../api';

const getFieldValues = async (
    projectId: string,
    fieldId: string,
    search: string,
    limit: number,
) =>
    lightdashApi<FieldMatchResult>({
        url: `/projects/${projectId}/field/${fieldId}/search?value=${encodeURIComponent(
            search,
        )}&limit=${limit}`,
        method: 'GET',
        body: undefined,
    });

export const useFieldValues = (
    search: string,
    initialData: string[],
    projectId: string,
    fieldId: string,
    limit: number = 100,
    debounce: boolean = true,
    useQueryOptions?: UseQueryOptions<FieldMatchResult, ApiError>,
) => {
    const [debouncedSearch, setDebouncedSearch] = useState<string>(search);
    const [searches, setSearches] = useState<string[]>([search]);

    const [results, setResults] = useState<string[]>(initialData);

    const query = useQuery<FieldMatchResult, ApiError>(
        ['project', projectId, fieldId, 'search', debouncedSearch],
        () => getFieldValues(projectId, fieldId, debouncedSearch, limit),
        {
            // make sure we don't cache for too long
            staleTime: 60 * 1000, // 1 minute
            cacheTime: 60 * 1000, // 1 minute
            ...useQueryOptions,
            onSuccess: ({ results: newResults, search: newSearch }) => {
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
