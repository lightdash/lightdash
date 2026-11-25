import {
    type ApiCatalogResults,
    type ApiError,
    type CatalogField,
} from '@lightdash/common';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useState } from 'react';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import {
    searchProject,
    type FieldMatch,
    type Project,
    type ProjectTree,
} from './model';

const MIN_FIELD_SEARCH = 2;

/** Field matches across the project, from the data catalog search. */
const useFieldSearch = (projectUuid: string, query: string) => {
    const lightdashApi = useLightdashApi();
    const search = query.trim();
    return useQuery<FieldMatch[], ApiError>({
        queryKey: ['semantic-layer-field-search', projectUuid, search],
        enabled: search.length >= MIN_FIELD_SEARCH,
        keepPreviousData: true,
        staleTime: 60_000,
        queryFn: async () => {
            const items = await lightdashApi<ApiCatalogResults>({
                url: `/projects/${projectUuid}/dataCatalog?${new URLSearchParams(
                    { search, type: 'field' },
                ).toString()}`,
                method: 'GET',
                body: undefined,
            });
            return items
                .filter((item): item is CatalogField => item.type === 'field')
                .map((item) => ({
                    name: item.name,
                    label: item.label ?? item.name,
                    tableName: item.tableName,
                    fieldType:
                        item.fieldType === 'metric' ? 'metric' : 'dimension',
                }));
        },
    });
};

/**
 * The sidebar search. Sources, folders and explores match on every
 * keystroke, deferred so typing never waits on the list; fields come from the
 * catalog once typing pauses. Its state lives with the search box, so typing
 * never re-renders the page beside it.
 */
export const useProjectSearch = (project: Project, tree: ProjectTree) => {
    const [search, setSearch] = useState('');
    const deferredSearch = useDeferredValue(search);
    const [debouncedSearch] = useDebouncedValue(search, 200);
    const fieldSearch = useFieldSearch(project.id, debouncedSearch);
    const needle = deferredSearch.trim().toLowerCase();
    const fieldMatches = useMemo(() => {
        if (needle.length < MIN_FIELD_SEARCH || !fieldSearch.data) return [];
        // While a newer request runs, keep only the earlier matches that
        // still fit, so no stale field shows under the new text.
        return fieldSearch.isPreviousData ||
            debouncedSearch.trim().toLowerCase() !== needle
            ? fieldSearch.data.filter(
                  ({ label, name }) =>
                      label.toLowerCase().includes(needle) ||
                      name.toLowerCase().includes(needle),
              )
            : fieldSearch.data;
    }, [needle, fieldSearch.data, fieldSearch.isPreviousData, debouncedSearch]);
    const results = useMemo(
        () => searchProject(tree, deferredSearch, fieldMatches),
        [tree, deferredSearch, fieldMatches],
    );
    const isSearching = search.trim().length > 0;
    return {
        search,
        setSearch,
        /** The text the results match, a step behind what's typed. */
        query: deferredSearch,
        isSearching,
        results,
        isSearchingFields:
            isSearching &&
            needle.length >= MIN_FIELD_SEARCH &&
            (fieldSearch.isFetching || debouncedSearch !== search),
    };
};

export type ProjectSearch = ReturnType<typeof useProjectSearch>;
