import {
    assertUnreachable,
    RoadmapItemStatus,
    RoadmapItemPriority,
    type RoadmapProject,
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
export type RoadmapProjectPresentation = Pick<
    RoadmapProject,
    'stage' | 'icon' | 'progress' | 'priority'
>;
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
    progress: 0,
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
