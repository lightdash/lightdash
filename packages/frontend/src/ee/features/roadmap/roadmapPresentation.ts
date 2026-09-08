import {
    assertUnreachable,
    RoadmapItemStatus,
    RoadmapItemPriority,
} from '@lightdash/common';
import {
    IconBolt,
    IconCalendar,
    IconChartBar,
    IconFilter,
    IconFolder,
    IconSparkles,
    IconUsers,
} from '@tabler/icons-react';

export type RoadmapBoardStage =
    | 'backlog'
    | 'planned'
    | 'started'
    | 'paused'
    | 'completed'
    | 'canceled';
export type RoadmapProjectPresentation = {
    stage: RoadmapBoardStage;
    icon:
        | 'sparkles'
        | 'filter'
        | 'chart'
        | 'bolt'
        | 'calendar'
        | 'users'
        | 'folder';
    progress: number | null;
    priority: RoadmapItemPriority;
};
export const projectIcons = {
    sparkles: IconSparkles,
    filter: IconFilter,
    chart: IconChartBar,
    bolt: IconBolt,
    calendar: IconCalendar,
    users: IconUsers,
    folder: IconFolder,
};
export const defaultProjectPresentation: RoadmapProjectPresentation = {
    stage: 'backlog',
    icon: 'folder',
    progress: null,
    priority: RoadmapItemPriority.NO_PRIORITY,
};
export function ticketStage(status: RoadmapItemStatus): RoadmapBoardStage {
    switch (status) {
        case RoadmapItemStatus.BACKLOG:
            return 'backlog';
        case RoadmapItemStatus.BUILDING:
            return 'started';
        case RoadmapItemStatus.SHIPPED:
            return 'completed';
        case RoadmapItemStatus.CANCELED:
            return 'canceled';
        default:
            return assertUnreachable(status, 'Unknown ticket status');
    }
}
