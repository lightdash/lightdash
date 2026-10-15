import {
    assertUnreachable,
    RoadmapItemStatus,
    RoadmapItemPriority,
    type RoadmapProject,
} from '@lightdash/common';
import i18n from '../../../i18n/i18n';

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

const PRIORITY_KEYS: Record<RoadmapItemPriority, string> = {
    [RoadmapItemPriority.URGENT]: 'urgent',
    [RoadmapItemPriority.HIGH]: 'high',
    [RoadmapItemPriority.MEDIUM]: 'medium',
    [RoadmapItemPriority.LOW]: 'low',
    [RoadmapItemPriority.NO_PRIORITY]: 'none',
};

export const getRoadmapPriorityLabel = (priority: RoadmapItemPriority) =>
    i18n.t(`roadmap.priority.${PRIORITY_KEYS[priority]}`, { ns: 'eeMisc' });

const STATUS_KEYS: Record<RoadmapItemStatus, string> = {
    [RoadmapItemStatus.BACKLOG]: 'backlog',
    [RoadmapItemStatus.BUILDING]: 'building',
    [RoadmapItemStatus.SHIPPED]: 'shipped',
    [RoadmapItemStatus.CANCELED]: 'canceled',
};

export const getRoadmapStatusLabel = (status: RoadmapItemStatus) =>
    i18n.t(`roadmap.status.${STATUS_KEYS[status]}`, { ns: 'eeMisc' });
