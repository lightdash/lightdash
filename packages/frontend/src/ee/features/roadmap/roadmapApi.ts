import {
    RoadmapProjectResultsSchema,
    RoadmapFollowProjectResultsSchema,
    type RoadmapFollowProjectRequest,
    type RoadmapFollowProjectResults,
    RoadmapProjectRequestsResultsSchema,
    type RoadmapProjectQuery,
    type RoadmapQuery,
    type RoadmapProjectResults,
    type RoadmapProjectRequestsResults,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
function queryString(query: RoadmapProjectQuery | RoadmapQuery) {
    return new URLSearchParams(
        Object.entries(query)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, String(value)]),
    ).toString();
}

async function getProjects(query: RoadmapProjectQuery) {
    return RoadmapProjectResultsSchema.parse(
        await lightdashApi<RoadmapProjectResults>({
            url: `/org/roadmap/projects?${queryString(query)}`,
            method: 'GET',
            body: undefined,
            version: 'v1',
        }),
    );
}

export const roadmapApi = {
    followProject: async ({
        projectId,
        note,
    }: RoadmapFollowProjectRequest & { projectId: string }) =>
        RoadmapFollowProjectResultsSchema.parse(
            await lightdashApi<RoadmapFollowProjectResults>({
                url: `/org/roadmap/projects/${encodeURIComponent(projectId)}/follow`,
                method: 'POST',
                sensitive: true,
                body: JSON.stringify({ note }),
                version: 'v1',
            }),
        ),
    getProjects,
    getRequests: async (query: RoadmapQuery) =>
        RoadmapProjectRequestsResultsSchema.parse(
            await lightdashApi<RoadmapProjectRequestsResults>({
                url: `/org/roadmap?${queryString(query)}`,
                method: 'GET',
                body: undefined,
                version: 'v1',
            }),
        ),
};
