import type { ContentType } from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

export type DeletedContentFiltersState = {
    search: string | undefined;
    selectedContentTypes: ContentType[];
    selectedDeletedByUserUuids: string[];
};

const DEFAULT_FILTERS: DeletedContentFiltersState = {
    search: undefined,
    selectedContentTypes: [],
    selectedDeletedByUserUuids: [],
};

export const useDeletedContentFilters = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    const initialSearch = searchParams.get('search') ?? undefined;
    const initialContentTypes =
        (searchParams.get('contentTypes')?.split(',').filter(Boolean) as
            | ContentType[]
            | undefined) ?? [];
    const initialDeletedBy =
        searchParams.get('deletedBy')?.split(',').filter(Boolean) ?? [];

    const [search, setSearchState] = useState<string | undefined>(
        initialSearch,
    );
    const [selectedContentTypes, setSelectedContentTypesState] =
        useState<ContentType[]>(initialContentTypes);
    const [selectedDeletedByUserUuids, setSelectedDeletedByUserUuidsState] =
        useState<string[]>(initialDeletedBy);

    const setSearch = useCallback(
        (newSearch: string | undefined) => {
            setSearchState(newSearch);
            const newParams = new URLSearchParams(searchParams);
            if (newSearch) {
                newParams.set('search', newSearch);
            } else {
                newParams.delete('search');
            }
            setSearchParams(newParams);
        },
        [searchParams, setSearchParams],
    );

    const setSelectedContentTypes = useCallback(
        (types: ContentType[]) => {
            setSelectedContentTypesState(types);
            const newParams = new URLSearchParams(searchParams);
            if (types.length > 0) {
                newParams.set('contentTypes', types.join(','));
            } else {
                newParams.delete('contentTypes');
            }
            setSearchParams(newParams);
        },
        [searchParams, setSearchParams],
    );

    const setSelectedDeletedByUserUuids = useCallback(
        (uuids: string[]) => {
            setSelectedDeletedByUserUuidsState(uuids);
            const newParams = new URLSearchParams(searchParams);
            if (uuids.length > 0) {
                newParams.set('deletedBy', uuids.join(','));
            } else {
                newParams.delete('deletedBy');
            }
            setSearchParams(newParams);
        },
        [searchParams, setSearchParams],
    );

    const resetFilters = useCallback(() => {
        setSearchState(DEFAULT_FILTERS.search);
        setSelectedContentTypesState(DEFAULT_FILTERS.selectedContentTypes);
        setSelectedDeletedByUserUuidsState(
            DEFAULT_FILTERS.selectedDeletedByUserUuids,
        );

        const newParams = new URLSearchParams(searchParams);
        newParams.delete('search');
        newParams.delete('contentTypes');
        newParams.delete('deletedBy');
        setSearchParams(newParams);
    }, [searchParams, setSearchParams]);

    const hasActiveFilters = useMemo(() => {
        return (
            search !== DEFAULT_FILTERS.search ||
            selectedContentTypes.length !==
                DEFAULT_FILTERS.selectedContentTypes.length ||
            selectedDeletedByUserUuids.length !==
                DEFAULT_FILTERS.selectedDeletedByUserUuids.length
        );
    }, [search, selectedContentTypes, selectedDeletedByUserUuids]);

    const apiFilters = useMemo(() => {
        return {
            search,
            contentTypes:
                selectedContentTypes.length > 0
                    ? selectedContentTypes
                    : undefined,
            deletedByUserUuids:
                selectedDeletedByUserUuids.length > 0
                    ? selectedDeletedByUserUuids
                    : undefined,
        };
    }, [search, selectedContentTypes, selectedDeletedByUserUuids]);

    return {
        search,
        selectedContentTypes,
        selectedDeletedByUserUuids,

        apiFilters,

        setSearch,
        setSelectedContentTypes,
        setSelectedDeletedByUserUuids,

        resetFilters,
        hasActiveFilters,
    };
};
