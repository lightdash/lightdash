import { type SchedulerRunStatus } from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

export type DestinationType = 'slack' | 'email' | 'msteams' | 'googlechat';

type UseLogsFiltersOptions = {
    /**
     * When false, filter state is kept locally and not synced to URL search
     * params. Use this for embedded views (e.g. modal flows) where URL state
     * would leak across navigations.
     * @default true
     */
    persistToUrl?: boolean;
};

export const useLogsFilters = ({
    persistToUrl = true,
}: UseLogsFiltersOptions = {}) => {
    const [searchParams, setSearchParams] = useSearchParams();

    const initialSearch = persistToUrl
        ? searchParams.get('nameSearch') || ''
        : '';
    const initialStatuses: SchedulerRunStatus[] =
        persistToUrl && searchParams.get('status')
            ? (searchParams.get('status')!.split(',') as SchedulerRunStatus[])
            : [];
    const initialCreators =
        persistToUrl && searchParams.get('creator')
            ? searchParams.get('creator')!.split(',')
            : [];
    const initialDestinations: DestinationType[] =
        persistToUrl && searchParams.get('destination')
            ? (searchParams.get('destination')!.split(',') as DestinationType[])
            : [];
    const initialSchedulerUuid = persistToUrl
        ? searchParams.get('schedulerUuid') || ''
        : '';

    const [search, setSearchState] = useState<string>(initialSearch);
    const [selectedStatuses, setSelectedStatusesState] =
        useState<SchedulerRunStatus[]>(initialStatuses);
    const [selectedCreatedByUserUuids, setSelectedCreatedByUserUuidsState] =
        useState<string[]>(initialCreators);
    const [selectedDestinations, setSelectedDestinationsState] =
        useState<DestinationType[]>(initialDestinations);
    const [selectedSchedulerUuid, setSelectedSchedulerUuidState] =
        useState<string>(initialSchedulerUuid);

    // Sync state when URL parameters change (e.g., when navigating from status badge)
    useEffect(() => {
        if (!persistToUrl) return;
        const urlSchedulerUuid = searchParams.get('schedulerUuid') || '';
        if (urlSchedulerUuid !== selectedSchedulerUuid) {
            setSelectedSchedulerUuidState(urlSchedulerUuid);
        }
    }, [persistToUrl, searchParams, selectedSchedulerUuid]);

    const setSearch = useCallback(
        (newSearch: string) => {
            setSearchState(newSearch);
            if (!persistToUrl) return;
            const newParams = new URLSearchParams(searchParams);
            if (newSearch) {
                newParams.set('nameSearch', newSearch);
            } else {
                newParams.delete('nameSearch');
            }
            setSearchParams(newParams);
        },
        [persistToUrl, searchParams, setSearchParams],
    );

    const setSelectedStatuses = useCallback(
        (statuses: SchedulerRunStatus[]) => {
            setSelectedStatusesState(statuses);
            if (!persistToUrl) return;
            const newParams = new URLSearchParams(searchParams);
            if (statuses.length > 0) {
                newParams.set('status', statuses.join(','));
            } else {
                newParams.delete('status');
            }
            setSearchParams(newParams);
        },
        [persistToUrl, searchParams, setSearchParams],
    );

    const setSelectedCreatedByUserUuids = useCallback(
        (userUuids: string[]) => {
            setSelectedCreatedByUserUuidsState(userUuids);
            if (!persistToUrl) return;
            const newParams = new URLSearchParams(searchParams);
            if (userUuids.length > 0) {
                newParams.set('creator', userUuids.join(','));
            } else {
                newParams.delete('creator');
            }
            setSearchParams(newParams);
        },
        [persistToUrl, searchParams, setSearchParams],
    );

    const setSelectedDestinations = useCallback(
        (destinations: DestinationType[]) => {
            setSelectedDestinationsState(destinations);
            if (!persistToUrl) return;
            const newParams = new URLSearchParams(searchParams);
            if (destinations.length > 0) {
                newParams.set('destination', destinations.join(','));
            } else {
                newParams.delete('destination');
            }
            setSearchParams(newParams);
        },
        [persistToUrl, searchParams, setSearchParams],
    );

    const setSelectedSchedulerUuid = useCallback(
        (schedulerUuid: string) => {
            setSelectedSchedulerUuidState(schedulerUuid);
            if (!persistToUrl) return;
            const newParams = new URLSearchParams(searchParams);
            if (schedulerUuid) {
                newParams.set('schedulerUuid', schedulerUuid);
            } else {
                newParams.delete('schedulerUuid');
            }
            setSearchParams(newParams);
        },
        [persistToUrl, searchParams, setSearchParams],
    );

    const hasActiveFilters = useMemo(() => {
        return (
            search !== '' ||
            selectedStatuses.length > 0 ||
            selectedCreatedByUserUuids.length > 0 ||
            selectedDestinations.length > 0 ||
            selectedSchedulerUuid !== ''
        );
    }, [
        search,
        selectedStatuses,
        selectedCreatedByUserUuids,
        selectedDestinations,
        selectedSchedulerUuid,
    ]);

    const resetFilters = useCallback(() => {
        setSearchState('');
        setSelectedStatusesState([]);
        setSelectedCreatedByUserUuidsState([]);
        setSelectedDestinationsState([]);
        setSelectedSchedulerUuidState('');

        if (!persistToUrl) return;
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('nameSearch');
        newParams.delete('status');
        newParams.delete('creator');
        newParams.delete('destination');
        newParams.delete('schedulerUuid');
        setSearchParams(newParams);
    }, [persistToUrl, searchParams, setSearchParams]);

    return {
        search,
        selectedStatuses,
        selectedCreatedByUserUuids,
        selectedDestinations,
        selectedSchedulerUuid,
        setSearch,
        setSelectedStatuses,
        setSelectedCreatedByUserUuids,
        setSelectedDestinations,
        setSelectedSchedulerUuid,
        hasActiveFilters,
        resetFilters,
    };
};
