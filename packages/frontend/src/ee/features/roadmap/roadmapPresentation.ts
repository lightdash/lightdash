import {
    assertUnreachable,
    RoadmapItemStatus,
    RoadmapItemPriority,
    type RoadmapProject,
} from '@lightdash/common';

export type RoadmapBoardStage =
    | 'backlog'
    | 'planned'
    | 'started'
    | 'paused'
    | 'completed'
    | 'canceled';
export type RoadmapProjectPresentation = Pick<
    RoadmapProject,
    'stage' | 'progress' | 'priority'
>;
export const defaultProjectPresentation: RoadmapProjectPresentation = {
    stage: 'backlog',
    progress: 0,
    priority: RoadmapItemPriority.NO_PRIORITY,
};
export function getProjectPresentation(
    project: RoadmapProjectPresentation,
): RoadmapProjectPresentation {
    return {
        ...project,
        progress:
            project.stage === 'started' || project.stage === 'paused'
                ? Math.min(project.progress, 99)
                : project.progress,
    };
}
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
