import { type SearchFilters } from '@lightdash/common';
import { useMemo } from 'react';
import { type SearchResultMap } from '../types/searchResultMap';
import useSearch, { hasMinQueryLength } from './useSearch';

const emptyResults: SearchResultMap = {
    spaces: [],
    dashboards: [],
    savedCharts: [],
    sqlCharts: [],
    tables: [],
    fields: [],
    pages: [],
    dashboardTabs: [],
    dataApps: [],
};

export const useOmnibarSearch = ({
    canManageExplore,
    enabled,
    ...params
}: {
    projectUuid: string;
    projectUrlIdentifier?: string;
    query?: string;
    filters?: SearchFilters;
    canManageExplore: boolean;
    enabled: boolean;
}) => {
    const splitResults =
        canManageExplore &&
        !params.filters?.type &&
        !params.filters?.verifiedOnly;
    const canSearch = enabled && hasMinQueryLength(params.query);
    const content = useSearch({
        ...params,
        source: 'omnibar',
        scope: splitResults ? 'content' : 'all',
        enabled: canSearch,
    });
    const explores = useSearch({
        ...params,
        source: 'omnibar',
        scope: 'explores',
        enabled: canSearch && splitResults,
    });

    const data = useMemo(() => {
        if (!splitResults) return content.data;
        if (!content.data && !explores.data) return undefined;
        return {
            ...(content.data ?? emptyResults),
            tables: explores.data?.tables ?? [],
            fields: explores.data?.fields ?? [],
        };
    }, [splitResults, content.data, explores.data]);

    return {
        data,
        isFetching: content.isFetching || (splitResults && explores.isFetching),
        error: content.error ?? (splitResults ? explores.error : null),
        retryFailed: () =>
            Promise.all([
                ...(content.isError ? [content.refetch()] : []),
                ...(splitResults && explores.isError
                    ? [explores.refetch()]
                    : []),
            ]),
    };
};
