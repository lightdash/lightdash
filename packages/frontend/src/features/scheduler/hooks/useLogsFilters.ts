import { type SchedulerJobStatus } from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

export type DestinationType = 'slack' | 'email' | 'msteams';

export const useLogsFilters = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    // Initialize from URL params
    const initialSearch = searchParams.get('nameSearch') || '';
    const initialStatuses = searchParams.get('status')
        ? (searchParams.get('status')!.split(',') as SchedulerJobStatus[])
        : [];
    const initialCreators = searchParams.get('creator')
        ? searchParams.get('creator')!.split(',')
        : [];
    const initialDestinations = searchParams.get('destination')
        ? (searchParams.get('destination')!.split(',') as DestinationType[])
        : [];

    const [search, setSearchState] = useState<string>(initialSearch);
    const [selectedStatuses, setSelectedStatusesState] =
        useState<SchedulerJobStatus[]>(initialStatuses);
    const [selectedCreatedByUserUuids, setSelectedCreatedByUserUuidsState] =
        useState<string[]>(initialCreators);
    const [selectedDestinations, setSelectedDestinationsState] =
        useState<DestinationType[]>(initialDestinations);

    const setSearch = useCallback(
        (newSearch: string) => {
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

    const setSelectedStatuses = useCallback(
        (statuses: SchedulerJobStatus[]) => {
            setSelectedStatusesState(statuses);
            const newParams = new URLSearchParams(searchParams);
            if (statuses.length > 0) {
                newParams.set('status', statuses.join(','));
            } else {
                newParams.delete('status');
            }
            setSearchParams(newParams);
        },
        [searchParams, setSearchParams],
    );

    const setSelectedCreatedByUserUuids = useCallback(
        (userUuids: string[]) => {
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

    const hasActiveFilters = useMemo(() => {
        return (
            search !== '' ||
            selectedStatuses.length > 0 ||
            selectedCreatedByUserUuids.length > 0 ||
            selectedDestinations.length > 0
        );
    }, [
        search,
        selectedStatuses,
        selectedCreatedByUserUuids,
        selectedDestinations,
    ]);

    const resetFilters = useCallback(() => {
        setSearchState('');
        setSelectedStatusesState([]);
        setSelectedCreatedByUserUuidsState([]);
        setSelectedDestinationsState([]);

        // Clear filter-related URL params
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('nameSearch');
        newParams.delete('status');
        newParams.delete('creator');
        newParams.delete('destination');
        setSearchParams(newParams);
    }, [searchParams, setSearchParams]);

    return {
        search,
        selectedStatuses,
        selectedCreatedByUserUuids,
        selectedDestinations,
        setSearch,
        setSelectedStatuses,
        setSelectedCreatedByUserUuids,
        setSelectedDestinations,
        hasActiveFilters,
        resetFilters,
    };
};
