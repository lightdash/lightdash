import type {
    AiAgentAdminFilters,
    AiAgentAdminSort,
    AiAgentAdminSortField,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import useSearchParams from '../../../../hooks/useSearchParams';

export interface AiAgentAdminFiltersState {
    search: AiAgentAdminFilters['search'];
    selectedProjectUuids: NonNullable<AiAgentAdminFilters['projectUuids']>;
    selectedAgentUuids: NonNullable<AiAgentAdminFilters['agentUuids']>;
    selectedSource: 'all' | AiAgentAdminFilters['createdFrom'];
    selectedFeedback: 'all' | 'thumbs_up' | 'thumbs_down';
    sortField: AiAgentAdminSortField;
    sortDirection: AiAgentAdminSort['direction'];
}

const DEFAULT_FILTERS: AiAgentAdminFiltersState = {
    search: undefined,
    selectedProjectUuids: [],
    selectedAgentUuids: [],
    selectedSource: 'all',
    selectedFeedback: 'all',
    sortField: 'createdAt',
    sortDirection: 'desc',
};

/**
 * Custom hook to manage AI Agent Admin filters with URL persistence
 */
export const useAiAgentAdminFilters = () => {
    const navigate = useNavigate();
    const { search: locationSearch, pathname } = useLocation();

    const searchParam = useSearchParams<string>('search');
    const projectsParam = useSearchParams<string>('projects');
    const agentsParam = useSearchParams<string>('agents');
    const sourceParam = useSearchParams<'web_app' | 'slack'>('source');
    const feedbackParam = useSearchParams<'thumbs_up' | 'thumbs_down'>(
        'feedback',
    );
    const sortByParam = useSearchParams<AiAgentAdminSortField>('sortBy');
    const sortDirectionParam = useSearchParams<'asc' | 'desc'>('sortDirection');

    const currentFilters = useMemo(
        () => ({
            search: searchParam || DEFAULT_FILTERS.search,
            selectedProjectUuids:
                projectsParam?.split(',').filter(Boolean) ||
                DEFAULT_FILTERS.selectedProjectUuids,
            selectedAgentUuids:
                agentsParam?.split(',').filter(Boolean) ||
                DEFAULT_FILTERS.selectedAgentUuids,
            selectedSource: sourceParam || DEFAULT_FILTERS.selectedSource,
            selectedFeedback: feedbackParam || DEFAULT_FILTERS.selectedFeedback,
            sortField: sortByParam || DEFAULT_FILTERS.sortField,
            sortDirection: sortDirectionParam || DEFAULT_FILTERS.sortDirection,
        }),
        [
            searchParam,
            projectsParam,
            agentsParam,
            sourceParam,
            feedbackParam,
            sortByParam,
            sortDirectionParam,
        ],
    );

    const updateUrl = useCallback(
        (newFilters: AiAgentAdminFiltersState) => {
            const searchParams = new URLSearchParams();

            if (newFilters.search) {
                searchParams.set('search', newFilters.search);
            }

            if (
                newFilters.selectedProjectUuids &&
                newFilters.selectedProjectUuids.length > 0
            ) {
                searchParams.set(
                    'projects',
                    newFilters.selectedProjectUuids.join(','),
                );
            }

            if (
                newFilters.selectedAgentUuids &&
                newFilters.selectedAgentUuids.length > 0
            ) {
                searchParams.set(
                    'agents',
                    newFilters.selectedAgentUuids.join(','),
                );
            }

            if (
                newFilters.selectedSource &&
                newFilters.selectedSource !== DEFAULT_FILTERS.selectedSource
            ) {
                searchParams.set('source', newFilters.selectedSource);
            }

            if (
                newFilters.selectedFeedback !== DEFAULT_FILTERS.selectedFeedback
            ) {
                searchParams.set('feedback', newFilters.selectedFeedback);
            }

            if (newFilters.sortField !== DEFAULT_FILTERS.sortField) {
                searchParams.set('sortBy', newFilters.sortField);
            }

            if (newFilters.sortDirection !== DEFAULT_FILTERS.sortDirection) {
                searchParams.set('sortDirection', newFilters.sortDirection);
            }

            const newSearch = searchParams.toString();

            // Only navigate if the search params actually changed
            if (newSearch !== new URLSearchParams(locationSearch).toString()) {
                void navigate(
                    {
                        pathname,
                        search: newSearch,
                    },
                    { replace: true },
                );
            }
        },
        [navigate, pathname, locationSearch],
    );

    const setSearch = useCallback(
        (search: AiAgentAdminFiltersState['search']) => {
            updateUrl({ ...currentFilters, search: search || undefined });
        },
        [updateUrl, currentFilters],
    );

    const setSelectedProjectUuids = useCallback(
        (projectUuids: NonNullable<AiAgentAdminFilters['projectUuids']>) => {
            updateUrl({
                ...currentFilters,
                selectedProjectUuids: projectUuids,
            });
        },
        [updateUrl, currentFilters],
    );

    const setSelectedAgentUuids = useCallback(
        (agentUuids: NonNullable<AiAgentAdminFilters['agentUuids']>) => {
            updateUrl({ ...currentFilters, selectedAgentUuids: agentUuids });
        },
        [updateUrl, currentFilters],
    );

    const setSelectedSource = useCallback(
        (source: AiAgentAdminFiltersState['selectedSource']) => {
            updateUrl({ ...currentFilters, selectedSource: source });
        },
        [updateUrl, currentFilters],
    );

    const setSelectedFeedback = useCallback(
        (feedback: AiAgentAdminFiltersState['selectedFeedback']) => {
            updateUrl({ ...currentFilters, selectedFeedback: feedback });
        },
        [updateUrl, currentFilters],
    );

    const setSorting = useCallback(
        (
            sortField: AiAgentAdminSortField,
            sortDirection: AiAgentAdminSort['direction'],
        ) => {
            updateUrl({ ...currentFilters, sortField, sortDirection });
        },
        [updateUrl, currentFilters],
    );

    const resetFilters = useCallback(() => {
        updateUrl(DEFAULT_FILTERS);
    }, [updateUrl]);

    const hasActiveFilters = useMemo(() => {
        return (
            currentFilters.search !== DEFAULT_FILTERS.search ||
            (currentFilters.selectedProjectUuids &&
                currentFilters.selectedProjectUuids.length !==
                    DEFAULT_FILTERS.selectedProjectUuids?.length) ||
            (currentFilters.selectedAgentUuids &&
                currentFilters.selectedAgentUuids.length !==
                    DEFAULT_FILTERS.selectedAgentUuids?.length) ||
            currentFilters.selectedSource !== DEFAULT_FILTERS.selectedSource ||
            currentFilters.selectedFeedback !==
                DEFAULT_FILTERS.selectedFeedback ||
            currentFilters.sortField !== DEFAULT_FILTERS.sortField ||
            currentFilters.sortDirection !== DEFAULT_FILTERS.sortDirection
        );
    }, [currentFilters]);

    const apiFilters = useMemo(() => {
        const result: AiAgentAdminFilters = {};

        if (currentFilters.search) {
            result.search = currentFilters.search;
        }

        if (
            currentFilters.selectedProjectUuids &&
            currentFilters.selectedProjectUuids.length > 0
        ) {
            result.projectUuids = currentFilters.selectedProjectUuids;
        }

        if (
            currentFilters.selectedAgentUuids &&
            currentFilters.selectedAgentUuids.length > 0
        ) {
            result.agentUuids = currentFilters.selectedAgentUuids;
        }

        if (currentFilters.selectedSource !== 'all') {
            result.createdFrom = currentFilters.selectedSource;
        }

        if (currentFilters.selectedFeedback === 'thumbs_up') {
            result.humanScore = 1;
        } else if (currentFilters.selectedFeedback === 'thumbs_down') {
            result.humanScore = -1;
        }

        return result;
    }, [currentFilters]);

    return {
        ...currentFilters,

        apiFilters,

        setSearch,
        setSelectedProjectUuids,
        setSelectedAgentUuids,
        setSelectedSource,
        setSelectedFeedback,
        setSorting,

        resetFilters,
        hasActiveFilters,
    };
};
