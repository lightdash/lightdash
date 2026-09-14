import {
    assertUnreachable,
    RoadmapItemPriority,
    RoadmapItemStatus,
} from '@lightdash/common';

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

export const formatRoadmapDetailDate = (date: string): string =>
    new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(new Date(date));
