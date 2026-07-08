import type {
    McpActivityFilters,
    McpActivitySort,
    McpActivitySortField,
    McpActivityStatus,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import useSearchParams from '../../../../hooks/useSearchParams';

type McpActivityFiltersState = {
    selectedProjectUuids: NonNullable<McpActivityFilters['projectUuids']>;
    selectedAgentUuids: NonNullable<McpActivityFilters['agentUuids']>;
    selectedStatus: 'all' | McpActivityStatus;
    sortField: McpActivitySortField;
    sortDirection: McpActivitySort['direction'];
};

const DEFAULT_FILTERS: McpActivityFiltersState = {
    selectedProjectUuids: [],
    selectedAgentUuids: [],
    selectedStatus: 'all',
    sortField: 'createdAt',
    sortDirection: 'desc',
};

/**
 * Manages MCP activity filters with URL persistence, mirroring
 * useAiAgentAdminFilters.
 */
export const useMcpActivityFilters = () => {
    const navigate = useNavigate();
    const { search: locationSearch, pathname } = useLocation();

    const projectsParam = useSearchParams<string>('projects');
    const agentsParam = useSearchParams<string>('agents');
    const statusParam = useSearchParams<McpActivityStatus>('status');
    const sortByParam = useSearchParams<McpActivitySortField>('sortBy');
    const sortDirectionParam = useSearchParams<'asc' | 'desc'>('sortDirection');

    const currentFilters = useMemo<McpActivityFiltersState>(
        () => ({
            selectedProjectUuids:
                projectsParam?.split(',').filter(Boolean) ||
                DEFAULT_FILTERS.selectedProjectUuids,
            selectedAgentUuids:
                agentsParam?.split(',').filter(Boolean) ||
                DEFAULT_FILTERS.selectedAgentUuids,
            selectedStatus: statusParam || DEFAULT_FILTERS.selectedStatus,
            sortField: sortByParam || DEFAULT_FILTERS.sortField,
            sortDirection: sortDirectionParam || DEFAULT_FILTERS.sortDirection,
        }),
        [
            projectsParam,
            agentsParam,
            statusParam,
            sortByParam,
            sortDirectionParam,
        ],
    );

    const updateUrl = useCallback(
        (newFilters: McpActivityFiltersState) => {
            const searchParams = new URLSearchParams();

            if (newFilters.selectedProjectUuids.length > 0) {
                searchParams.set(
                    'projects',
                    newFilters.selectedProjectUuids.join(','),
                );
            }
            if (newFilters.selectedAgentUuids.length > 0) {
                searchParams.set(
                    'agents',
                    newFilters.selectedAgentUuids.join(','),
                );
            }
            if (newFilters.selectedStatus !== DEFAULT_FILTERS.selectedStatus) {
                searchParams.set('status', newFilters.selectedStatus);
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

    const setSelectedProjectUuids = useCallback(
        (projectUuids: string[]) => {
            updateUrl({
                ...currentFilters,
                selectedProjectUuids: projectUuids,
            });
        },
        [updateUrl, currentFilters],
    );

    const setSelectedAgentUuids = useCallback(
        (agentUuids: string[]) => {
            updateUrl({ ...currentFilters, selectedAgentUuids: agentUuids });
        },
        [updateUrl, currentFilters],
    );

    const setSelectedStatus = useCallback(
        (status: McpActivityFiltersState['selectedStatus']) => {
            updateUrl({ ...currentFilters, selectedStatus: status });
        },
        [updateUrl, currentFilters],
    );

    const setSorting = useCallback(
        (
            sortField: McpActivitySortField,
            sortDirection: McpActivitySort['direction'],
        ) => {
            updateUrl({ ...currentFilters, sortField, sortDirection });
        },
        [updateUrl, currentFilters],
    );

    const resetFilters = useCallback(() => {
        updateUrl(DEFAULT_FILTERS);
    }, [updateUrl]);

    const hasActiveFilters = useMemo(
        () =>
            currentFilters.selectedProjectUuids.length > 0 ||
            currentFilters.selectedAgentUuids.length > 0 ||
            currentFilters.selectedStatus !== DEFAULT_FILTERS.selectedStatus,
        [currentFilters],
    );

    const apiFilters = useMemo(() => {
        const result: McpActivityFilters = {};
        if (currentFilters.selectedProjectUuids.length > 0) {
            result.projectUuids = currentFilters.selectedProjectUuids;
        }
        if (currentFilters.selectedAgentUuids.length > 0) {
            result.agentUuids = currentFilters.selectedAgentUuids;
        }
        if (currentFilters.selectedStatus !== 'all') {
            result.status = currentFilters.selectedStatus;
        }
        return result;
    }, [currentFilters]);

    return {
        ...currentFilters,
        apiFilters,
        setSelectedProjectUuids,
        setSelectedAgentUuids,
        setSelectedStatus,
        setSorting,
        resetFilters,
        hasActiveFilters,
    };
};
