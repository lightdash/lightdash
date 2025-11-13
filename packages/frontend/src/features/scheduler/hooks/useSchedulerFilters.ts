import { type SchedulerFormat } from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

export type DestinationType = 'slack' | 'email' | 'msteams';

export type SchedulerFilters = {
    search?: string;
    createdByUserUuids?: string[];
    formats?: SchedulerFormat[];
    resourceType?: 'chart' | 'dashboard';
    resourceUuids?: string[];
    destinations?: DestinationType[];
};

export interface SchedulerFiltersState {
    search: SchedulerFilters['search'];
    selectedCreatedByUserUuids: NonNullable<
        SchedulerFilters['createdByUserUuids']
    >;
    selectedFormats: NonNullable<SchedulerFilters['formats']>;
    selectedResourceType: 'all' | SchedulerFilters['resourceType'];
    selectedResourceUuids: NonNullable<SchedulerFilters['resourceUuids']>;
    selectedDestinations: DestinationType[];
    sortField: 'name' | 'createdAt';
    sortDirection: 'asc' | 'desc';
}

const DEFAULT_FILTERS: SchedulerFiltersState = {
    search: undefined,
    selectedCreatedByUserUuids: [],
    selectedFormats: [],
    selectedResourceType: 'all',
    selectedResourceUuids: [],
    selectedDestinations: [],
    sortField: 'name',
    sortDirection: 'asc',
};

/**
 * Custom hook to manage Scheduler filters
 */
export const useSchedulerFilters = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    // Initialize from URL params
    const initialSearch = searchParams.get('nameSearch') ?? undefined;

    const initialFormats =
        (searchParams.get('format')?.split(',').filter(Boolean) as
            | SchedulerFormat[]
            | undefined) ?? [];

    const initialResourceType = searchParams.get('type') as
        | 'chart'
        | 'dashboard'
        | null;

    const initialCreators =
        searchParams.get('creator')?.split(',').filter(Boolean) ?? [];

    const initialDestinations =
        (searchParams.get('destination')?.split(',').filter(Boolean) as
            | DestinationType[]
            | undefined) ?? [];

    const [search, setSearchState] =
        useState<SchedulerFiltersState['search']>(initialSearch);
    const [selectedCreatedByUserUuids, setSelectedCreatedByUserUuidsState] =
        useState<NonNullable<SchedulerFilters['createdByUserUuids']>>(
            initialCreators,
        );
    const [selectedFormats, setSelectedFormatsState] =
        useState<NonNullable<SchedulerFilters['formats']>>(initialFormats);
    const [selectedResourceType, setSelectedResourceTypeState] = useState<
        SchedulerFiltersState['selectedResourceType']
    >(initialResourceType || 'all');
    const [selectedResourceUuids, setSelectedResourceUuidsState] = useState<
        NonNullable<SchedulerFilters['resourceUuids']>
    >(DEFAULT_FILTERS.selectedResourceUuids);
    const [selectedDestinations, setSelectedDestinationsState] =
        useState<DestinationType[]>(initialDestinations);
    const [sortField, setSortFieldState] = useState<
        SchedulerFiltersState['sortField']
    >(DEFAULT_FILTERS.sortField);
    const [sortDirection, setSortDirectionState] = useState<
        SchedulerFiltersState['sortDirection']
    >(DEFAULT_FILTERS.sortDirection);

    const setSearch = useCallback(
        (newSearch: SchedulerFiltersState['search']) => {
            setSearchState(newSearch);
            const newParams = new URLSearchParams(searchParams);
            if (newSearch) {
                newParams.set('nameSearch', newSearch);
            } else {
                newParams.delete('nameSearch');
            }
            setSearchParams(newParams);
        },
        [searchParams, setSearchParams],
    );

    const setSelectedCreatedByUserUuids = useCallback(
        (userUuids: NonNullable<SchedulerFilters['createdByUserUuids']>) => {
            setSelectedCreatedByUserUuidsState(userUuids);
            const newParams = new URLSearchParams(searchParams);
            if (userUuids.length > 0) {
                newParams.set('creator', userUuids.join(','));
            } else {
                newParams.delete('creator');
            }
            setSearchParams(newParams);
        },
        [searchParams, setSearchParams],
    );

    const setSelectedFormats = useCallback(
        (formats: NonNullable<SchedulerFilters['formats']>) => {
            setSelectedFormatsState(formats);
            const newParams = new URLSearchParams(searchParams);
            if (formats.length > 0) {
                newParams.set('format', formats.join(','));
            } else {
                newParams.delete('format');
            }
            setSearchParams(newParams);
        },
        [searchParams, setSearchParams],
    );

    const setSelectedResourceType = useCallback(
        (resourceType: SchedulerFiltersState['selectedResourceType']) => {
            setSelectedResourceTypeState(resourceType);
            const newParams = new URLSearchParams(searchParams);
            if (resourceType && resourceType !== 'all') {
                newParams.set('type', resourceType);
            } else {
                newParams.delete('type');
            }
            setSearchParams(newParams);
        },
        [searchParams, setSearchParams],
    );

    const setSelectedResourceUuids = useCallback(
        (resourceUuids: NonNullable<SchedulerFilters['resourceUuids']>) => {
            setSelectedResourceUuidsState(resourceUuids);
        },
        [],
    );

    const setSelectedDestinations = useCallback(
        (destinations: DestinationType[]) => {
            setSelectedDestinationsState(destinations);
            const newParams = new URLSearchParams(searchParams);
            if (destinations.length > 0) {
                newParams.set('destination', destinations.join(','));
            } else {
                newParams.delete('destination');
            }
            setSearchParams(newParams);
        },
        [searchParams, setSearchParams],
    );

    const setSorting = useCallback(
        (
            newSortField: SchedulerFiltersState['sortField'],
            newSortDirection: SchedulerFiltersState['sortDirection'],
        ) => {
            setSortFieldState(newSortField);
            setSortDirectionState(newSortDirection);
        },
        [],
    );

    const resetFilters = useCallback(() => {
        setSearchState(DEFAULT_FILTERS.search);
        setSelectedCreatedByUserUuidsState(
            DEFAULT_FILTERS.selectedCreatedByUserUuids,
        );
        setSelectedFormatsState(DEFAULT_FILTERS.selectedFormats);
        setSelectedResourceTypeState(DEFAULT_FILTERS.selectedResourceType);
        setSelectedResourceUuidsState(DEFAULT_FILTERS.selectedResourceUuids);
        setSelectedDestinationsState(DEFAULT_FILTERS.selectedDestinations);
        setSortFieldState(DEFAULT_FILTERS.sortField);
        setSortDirectionState(DEFAULT_FILTERS.sortDirection);

        // Clear filter-related URL params
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('nameSearch');
        newParams.delete('format');
        newParams.delete('type');
        newParams.delete('creator');
        newParams.delete('destination');
        setSearchParams(newParams);
    }, [searchParams, setSearchParams]);

    const hasActiveFilters = useMemo(() => {
        return (
            search !== DEFAULT_FILTERS.search ||
            selectedCreatedByUserUuids.length !==
                DEFAULT_FILTERS.selectedCreatedByUserUuids.length ||
            selectedFormats.length !== DEFAULT_FILTERS.selectedFormats.length ||
            selectedResourceType !== DEFAULT_FILTERS.selectedResourceType ||
            selectedResourceUuids.length !==
                DEFAULT_FILTERS.selectedResourceUuids.length ||
            selectedDestinations.length !==
                DEFAULT_FILTERS.selectedDestinations.length ||
            sortField !== DEFAULT_FILTERS.sortField ||
            sortDirection !== DEFAULT_FILTERS.sortDirection
        );
    }, [
        search,
        selectedCreatedByUserUuids,
        selectedFormats,
        selectedResourceType,
        selectedResourceUuids,
        selectedDestinations,
        sortField,
        sortDirection,
    ]);

    const apiFilters = useMemo(() => {
        const result: SchedulerFilters = {};

        if (search) {
            result.search = search;
        }

        if (selectedCreatedByUserUuids.length > 0) {
            result.createdByUserUuids = selectedCreatedByUserUuids;
        }

        if (selectedFormats.length > 0) {
            result.formats = selectedFormats;
        }

        if (selectedResourceType !== 'all') {
            result.resourceType = selectedResourceType;
        }

        if (selectedResourceUuids.length > 0) {
            result.resourceUuids = selectedResourceUuids;
        }

        if (selectedDestinations.length > 0) {
            result.destinations = selectedDestinations;
        }

        return result;
    }, [
        search,
        selectedCreatedByUserUuids,
        selectedFormats,
        selectedResourceType,
        selectedResourceUuids,
        selectedDestinations,
    ]);

    return {
        search,
        selectedCreatedByUserUuids,
        selectedFormats,
        selectedResourceType,
        selectedResourceUuids,
        selectedDestinations,
        sortField,
        sortDirection,

        apiFilters,

        setSearch,
        setSelectedCreatedByUserUuids,
        setSelectedFormats,
        setSelectedResourceType,
        setSelectedResourceUuids,
        setSelectedDestinations,
        setSorting,

        resetFilters,
        hasActiveFilters,
    };
};
