import {
    assertUnreachable,
    RoadmapItemPriority,
    RoadmapItemStatus,
    type RoadmapItem,
    type RoadmapFacets,
} from '@lightdash/common';
import type { ContentTableSortingState } from '../../components/common/ContentTable';

export type RoadmapSortOption =
    | 'status'
    | 'status-desc'
    | 'priority'
    | 'priority-desc'
    | 'updated-desc'
    | 'updated-asc'
    | 'created-desc'
    | 'created-asc';

const PRIORITY_ORDER: Record<RoadmapItemPriority, number> = {
    [RoadmapItemPriority.URGENT]: 0,
    [RoadmapItemPriority.HIGH]: 1,
    [RoadmapItemPriority.MEDIUM]: 2,
    [RoadmapItemPriority.LOW]: 3,
    [RoadmapItemPriority.NO_PRIORITY]: 4,
};

const STATUS_ORDER: Record<RoadmapItemStatus, number> = {
    [RoadmapItemStatus.BACKLOG]: 0,
    [RoadmapItemStatus.BUILDING]: 1,
    [RoadmapItemStatus.SHIPPED]: 2,
    [RoadmapItemStatus.CANCELED]: 3,
};

export const getStatusColor = (status: RoadmapItemStatus): string => {
    switch (status) {
        case RoadmapItemStatus.BUILDING:
            return 'blue';
        case RoadmapItemStatus.SHIPPED:
            return 'green';
        case RoadmapItemStatus.BACKLOG:
        case RoadmapItemStatus.CANCELED:
            return 'ldGray';
        default:
            return assertUnreachable(
                status,
                `Unknown roadmap status ${status}`,
            );
    }
};

export const getPriorityColor = (priority: RoadmapItemPriority): string => {
    switch (priority) {
        case RoadmapItemPriority.URGENT:
            return 'red';
        case RoadmapItemPriority.HIGH:
            return 'orange';
        case RoadmapItemPriority.MEDIUM:
            return 'yellow';
        case RoadmapItemPriority.LOW:
            return 'blue';
        case RoadmapItemPriority.NO_PRIORITY:
            return 'ldGray';
        default:
            return assertUnreachable(
                priority,
                `Unknown roadmap priority ${priority}`,
            );
    }
};

export const formatRoadmapDate = (date: string): string =>
    new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
    }).format(new Date(date));

export const formatRoadmapDetailDate = (date: string): string =>
    new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(new Date(date));

export const getRoadmapFacets = (items: RoadmapItem[]): RoadmapFacets => {
    const facets = {
        statusCounts: Object.fromEntries(
            Object.values(RoadmapItemStatus).map((status) => [status, 0]),
        ),
        priorityCounts: Object.fromEntries(
            Object.values(RoadmapItemPriority).map((priority) => [priority, 0]),
        ),
    } as RoadmapFacets;

    items.forEach((item) => {
        facets.statusCounts[item.status] += 1;
        facets.priorityCounts[item.priority] += 1;
    });

    return facets;
};

export const getRoadmapSortOption = (
    sorting: ContentTableSortingState,
): RoadmapSortOption => {
    const [sort] = sorting;
    if (!sort) {
        return 'priority';
    }

    switch (sort.id) {
        case 'status':
            return sort.desc ? 'status-desc' : 'status';
        case 'priority':
            return sort.desc ? 'priority-desc' : 'priority';
        case 'createdAt':
            return sort.desc ? 'created-desc' : 'created-asc';
        case 'updatedAt':
            return sort.desc ? 'updated-desc' : 'updated-asc';
        default:
            return 'priority';
    }
};

export const filterAndSortRoadmapItems = ({
    items,
    search,
    statuses,
    priorities,
    sortOption,
}: {
    items: RoadmapItem[];
    search: string;
    statuses: RoadmapItemStatus[];
    priorities: RoadmapItemPriority[];
    sortOption: RoadmapSortOption;
}): RoadmapItem[] => {
    const normalizedSearch = search.trim().toLowerCase();
    const filteredItems = items.filter((item) => {
        const matchesStatus =
            statuses.length === 0 || statuses.includes(item.status);
        const matchesPriority =
            priorities.length === 0 || priorities.includes(item.priority);
        const searchableText = [
            item.title,
            item.description,
            item.ticketId,
            item.status,
            item.priority,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        return (
            matchesStatus &&
            matchesPriority &&
            (!normalizedSearch || searchableText.includes(normalizedSearch))
        );
    });

    return filteredItems.sort((left, right) => {
        switch (sortOption) {
            case 'status':
                return (
                    STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
                    Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
                );
            case 'status-desc':
                return (
                    STATUS_ORDER[right.status] - STATUS_ORDER[left.status] ||
                    Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
                );
            case 'priority':
                return (
                    PRIORITY_ORDER[left.priority] -
                        PRIORITY_ORDER[right.priority] ||
                    Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
                );
            case 'priority-desc':
                return (
                    PRIORITY_ORDER[right.priority] -
                        PRIORITY_ORDER[left.priority] ||
                    Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
                );
            case 'updated-desc':
                return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
            case 'updated-asc':
                return Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
            case 'created-desc':
                return Date.parse(right.createdAt) - Date.parse(left.createdAt);
            case 'created-asc':
                return Date.parse(left.createdAt) - Date.parse(right.createdAt);
            default:
                return assertUnreachable(
                    sortOption,
                    `Unknown sort option ${sortOption}`,
                );
        }
    });
};
