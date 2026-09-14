import {
    RoadmapItemPriority,
    RoadmapItemStatus,
    type RoadmapProjectGroup,
    type RoadmapProjectResults,
} from '@lightdash/common';

export function mockRoadmapProject(projectId: string): RoadmapProjectGroup {
    return {
        project: {
            projectId,
            title: `Project ${projectId}`,
            description: 'A roadmap project',
            stage: 'planned',
            progress: 0,
            priority: RoadmapItemPriority.MEDIUM,
            issueStatusCounts: {
                [RoadmapItemStatus.BACKLOG]: 5,
                [RoadmapItemStatus.BUILDING]: 0,
                [RoadmapItemStatus.SHIPPED]: 0,
                [RoadmapItemStatus.CANCELED]: 0,
            },
            lastIssueUpdatedAt: null,
        },
        hasDirectNeed: false,
        ownRequestCount: 0,
    };
}

export function mockRoadmapResults(
    projects: RoadmapProjectGroup[],
): RoadmapProjectResults {
    return {
        projects,
        otherRequestCount: 0,
        expiresAt: '2099-01-01T00:00:00Z',
        pagination: {
            page: 1,
            pageSize: 100,
            totalResults: projects.length,
            totalPages: projects.length ? 1 : 0,
        },
    };
}
