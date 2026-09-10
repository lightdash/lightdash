import { type RoadmapProjectQuery, type RoadmapQuery } from '@lightdash/common';
import { useRoadmapProjects, useRoadmapRequests } from './useRoadmapProjects';

type BoardQueryOptions = {
    projectQuery: RoadmapProjectQuery;
    requestQuery: RoadmapQuery;
    cacheKey: string;
    showProjects: boolean;
    showTickets: boolean;
    enabled: boolean;
    statuses: string[];
};

async function fetchRemainingPages(
    query:
        | ReturnType<typeof useRoadmapProjects>
        | ReturnType<typeof useRoadmapRequests>,
) {
    const pages = query.data?.pages ?? [];
    const remaining = (pages[0]?.pagination.totalPages ?? 0) - pages.length;
    for (let page = 0; page < remaining; page += 1) {
        const result = await query.fetchNextPage();
        if (result.isError || !result.hasNextPage) break;
    }
}

function useColumn(
    id: 'planned' | 'started' | 'completed' | 'canceled',
    options: BoardQueryOptions,
) {
    const enabled =
        options.enabled &&
        (!options.statuses.length || options.statuses.includes(id));
    const statuses =
        id === 'planned'
            ? 'backlog,planned'
            : id === 'started'
              ? 'started,paused'
              : id;
    const projects = useRoadmapProjects(
        { ...options.projectQuery, statuses },
        options.cacheKey,
        enabled && options.showProjects,
    );
    const tickets = useRoadmapRequests(
        { ...options.requestQuery, statuses },
        options.cacheKey,
        enabled &&
            options.showTickets &&
            (!options.showProjects || projects.isSuccess),
    );
    const projectTotal = options.showProjects
        ? (projects.data?.pages[0]?.pagination.totalResults ?? 0)
        : 0;
    const ticketTotal = options.showTickets
        ? (tickets.data?.pages[0]?.pagination.totalIssues ?? 0)
        : 0;
    return {
        id,
        projects,
        tickets,
        total: projectTotal + ticketTotal,
        loading:
            enabled &&
            ((options.showProjects && projects.isInitialLoading) ||
                (options.showTickets && tickets.isInitialLoading)),
        error: enabled
            ? ((options.showProjects ? projects.error : null) ??
              (options.showTickets ? tickets.error : null))
            : null,
        hasNextPage:
            (options.showProjects && projects.hasNextPage) ||
            (options.showTickets && tickets.hasNextPage),
        fetchingMore:
            (options.showProjects && projects.isFetchingNextPage) ||
            (options.showTickets && tickets.isFetchingNextPage),
        fetchAll: () =>
            Promise.all([
                options.showProjects
                    ? fetchRemainingPages(projects)
                    : undefined,
                options.showTickets ? fetchRemainingPages(tickets) : undefined,
            ]),
    };
}

export function useRoadmapBoard(options: BoardQueryOptions) {
    const planned = useColumn('planned', options);
    const started = useColumn('started', options);
    const completed = useColumn('completed', options);
    const canceled = useColumn('canceled', options);
    return [planned, started, completed, canceled].filter(
        (column) =>
            !options.statuses.length || options.statuses.includes(column.id),
    );
}
