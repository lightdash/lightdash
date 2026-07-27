import type {
    AiAgentAdminMemoryFilters,
    AiAgentAdminMemorySort,
    AiAgentAdminMemorySortField,
    AiAgentMemoryScope,
    AiAgentMemoryStatus,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import useSearchParams from '../../../../hooks/useSearchParams';

const MEMORY_STATUSES: AiAgentMemoryStatus[] = [
    'active',
    'superseded',
    'retired',
];

const isMemoryStatus = (value: string): value is AiAgentMemoryStatus =>
    MEMORY_STATUSES.includes(value as AiAgentMemoryStatus);

// An absent `statuses` param means the default (active only), so clearing the
// status filter needs its own token to mean "every status"
const ALL_STATUSES_PARAM = 'all';

const MEMORY_SCOPES: AiAgentMemoryScope[] = ['user', 'project'];

const isMemoryScope = (value: string): value is AiAgentMemoryScope =>
    MEMORY_SCOPES.includes(value as AiAgentMemoryScope);

export interface AiAgentAdminMemoryFiltersState {
    search: AiAgentAdminMemoryFilters['search'];
    selectedProjectUuids: NonNullable<
        AiAgentAdminMemoryFilters['projectUuids']
    >;
    selectedUserUuids: NonNullable<AiAgentAdminMemoryFilters['userUuids']>;
    selectedStatuses: AiAgentMemoryStatus[];
    // Empty means every scope: unlike statuses, there is no default subset
    selectedScopes: AiAgentMemoryScope[];
    sortField: AiAgentAdminMemorySortField;
    sortDirection: AiAgentAdminMemorySort['direction'];
}

const DEFAULT_FILTERS: AiAgentAdminMemoryFiltersState = {
    search: undefined,
    selectedProjectUuids: [],
    selectedUserUuids: [],
    selectedStatuses: ['active'],
    selectedScopes: [],
    sortField: 'generatedAt',
    sortDirection: 'desc',
};

/** URL-persisted filter state for the admin memories table. */
export const useAiAgentAdminMemoryFilters = () => {
    const navigate = useNavigate();
    const { search: locationSearch, pathname } = useLocation();

    const searchParam = useSearchParams<string>('search');
    const projectsParam = useSearchParams<string>('projects');
    const usersParam = useSearchParams<string>('users');
    const statusesParam = useSearchParams<string>('statuses');
    const scopesParam = useSearchParams<string>('scopes');
    const sortByParam = useSearchParams<AiAgentAdminMemorySortField>('sortBy');
    const sortDirectionParam = useSearchParams<'asc' | 'desc'>('sortDirection');

    const currentFilters = useMemo<AiAgentAdminMemoryFiltersState>(
        () => ({
            search: searchParam || DEFAULT_FILTERS.search,
            selectedProjectUuids:
                projectsParam?.split(',').filter(Boolean) ||
                DEFAULT_FILTERS.selectedProjectUuids,
            selectedUserUuids:
                usersParam?.split(',').filter(Boolean) ||
                DEFAULT_FILTERS.selectedUserUuids,
            selectedStatuses:
                statusesParam === ALL_STATUSES_PARAM
                    ? []
                    : statusesParam?.split(',').filter(isMemoryStatus) ||
                      DEFAULT_FILTERS.selectedStatuses,
            selectedScopes:
                scopesParam?.split(',').filter(isMemoryScope) ||
                DEFAULT_FILTERS.selectedScopes,
            sortField: sortByParam || DEFAULT_FILTERS.sortField,
            sortDirection: sortDirectionParam || DEFAULT_FILTERS.sortDirection,
        }),
        [
            searchParam,
            projectsParam,
            usersParam,
            statusesParam,
            scopesParam,
            sortByParam,
            sortDirectionParam,
        ],
    );

    const updateUrl = useCallback(
        (newFilters: AiAgentAdminMemoryFiltersState) => {
            const searchParams = new URLSearchParams();

            if (newFilters.search) {
                searchParams.set('search', newFilters.search);
            }
            if (newFilters.selectedProjectUuids.length > 0) {
                searchParams.set(
                    'projects',
                    newFilters.selectedProjectUuids.join(','),
                );
            }
            if (newFilters.selectedUserUuids.length > 0) {
                searchParams.set(
                    'users',
                    newFilters.selectedUserUuids.join(','),
                );
            }
            if (newFilters.selectedStatuses.length === 0) {
                searchParams.set('statuses', ALL_STATUSES_PARAM);
            } else if (
                newFilters.selectedStatuses.join(',') !==
                DEFAULT_FILTERS.selectedStatuses.join(',')
            ) {
                searchParams.set(
                    'statuses',
                    newFilters.selectedStatuses.join(','),
                );
            }
            if (newFilters.selectedScopes.length > 0) {
                searchParams.set('scopes', newFilters.selectedScopes.join(','));
            }
            if (newFilters.sortField !== DEFAULT_FILTERS.sortField) {
                searchParams.set('sortBy', newFilters.sortField);
            }
            if (newFilters.sortDirection !== DEFAULT_FILTERS.sortDirection) {
                searchParams.set('sortDirection', newFilters.sortDirection);
            }

            const newSearch = searchParams.toString();
            if (newSearch !== new URLSearchParams(locationSearch).toString()) {
                void navigate(
                    { pathname, search: newSearch },
                    { replace: true },
                );
            }
        },
        [navigate, pathname, locationSearch],
    );

    const setSearch = useCallback(
        (search: AiAgentAdminMemoryFiltersState['search']) => {
            updateUrl({ ...currentFilters, search: search || undefined });
        },
        [updateUrl, currentFilters],
    );

    const setSelectedProjectUuids = useCallback(
        (projectUuids: string[]) => {
            updateUrl({
                ...currentFilters,
                selectedProjectUuids: projectUuids,
            });
        },
        [updateUrl, currentFilters],
    );

    const setSelectedUserUuids = useCallback(
        (userUuids: string[]) => {
            updateUrl({ ...currentFilters, selectedUserUuids: userUuids });
        },
        [updateUrl, currentFilters],
    );

    const setSelectedStatuses = useCallback(
        (statuses: string[]) => {
            updateUrl({
                ...currentFilters,
                selectedStatuses: statuses.filter(isMemoryStatus),
            });
        },
        [updateUrl, currentFilters],
    );

    const setSelectedScopes = useCallback(
        (scopes: string[]) => {
            updateUrl({
                ...currentFilters,
                selectedScopes: scopes.filter(isMemoryScope),
            });
        },
        [updateUrl, currentFilters],
    );

    const setSorting = useCallback(
        (
            sortField: AiAgentAdminMemorySortField,
            sortDirection: AiAgentAdminMemorySort['direction'],
        ) => {
            updateUrl({ ...currentFilters, sortField, sortDirection });
        },
        [updateUrl, currentFilters],
    );

    const resetFilters = useCallback(() => {
        updateUrl(DEFAULT_FILTERS);
    }, [updateUrl]);

    // Sorting is deliberately excluded: a plain sort click shouldn't surface
    // the "Clear all filters" button
    const hasActiveFilters = useMemo(
        () =>
            currentFilters.search !== DEFAULT_FILTERS.search ||
            currentFilters.selectedProjectUuids.length > 0 ||
            currentFilters.selectedUserUuids.length > 0 ||
            currentFilters.selectedStatuses.join(',') !==
                DEFAULT_FILTERS.selectedStatuses.join(',') ||
            currentFilters.selectedScopes.length > 0,
        [currentFilters],
    );

    const apiFilters = useMemo<AiAgentAdminMemoryFilters>(() => {
        const result: AiAgentAdminMemoryFilters = {};

        if (currentFilters.search) {
            result.search = currentFilters.search;
        }
        if (currentFilters.selectedProjectUuids.length > 0) {
            result.projectUuids = currentFilters.selectedProjectUuids;
        }
        if (currentFilters.selectedUserUuids.length > 0) {
            result.userUuids = currentFilters.selectedUserUuids;
        }
        if (currentFilters.selectedStatuses.length > 0) {
            result.statuses = currentFilters.selectedStatuses;
        }
        if (currentFilters.selectedScopes.length > 0) {
            result.scopes = currentFilters.selectedScopes;
        }

        return result;
    }, [currentFilters]);

    return {
        ...currentFilters,

        apiFilters,

        setSearch,
        setSelectedProjectUuids,
        setSelectedUserUuids,
        setSelectedStatuses,
        setSelectedScopes,
        setSorting,

        resetFilters,
        hasActiveFilters,
    };
};
