import { type SchedulerJobStatus } from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';

export type DestinationType = 'slack' | 'email' | 'msteams';

export const useLogsFilters = () => {
    const [search, setSearchState] = useState<string>('');
    const [selectedStatuses, setSelectedStatusesState] = useState<
        SchedulerJobStatus[]
    >([]);
    const [selectedCreatedByUserUuids, setSelectedCreatedByUserUuidsState] =
        useState<string[]>([]);
    const [selectedDestinations, setSelectedDestinationsState] = useState<
        DestinationType[]
    >([]);

    const setSearch = useCallback((newSearch: string) => {
        setSearchState(newSearch);
    }, []);

    const setSelectedStatuses = useCallback(
        (statuses: SchedulerJobStatus[]) => {
            setSelectedStatusesState(statuses);
        },
        [],
    );

    const setSelectedCreatedByUserUuids = useCallback((userUuids: string[]) => {
        setSelectedCreatedByUserUuidsState(userUuids);
    }, []);

    const setSelectedDestinations = useCallback(
        (destinations: DestinationType[]) => {
            setSelectedDestinationsState(destinations);
        },
        [],
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
    }, []);

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
