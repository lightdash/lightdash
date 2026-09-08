import {
    RoadmapProjectResultsSchema,
    RoadmapProjectRequestsResultsSchema,
    type RoadmapProjectQuery,
    type RoadmapProjectRequestsQuery,
    type RoadmapProjectResults,
    type RoadmapProjectRequestsResults,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';

interface RoadmapApi {
    getProjects: (query: RoadmapProjectQuery) => Promise<RoadmapProjectResults>;
    getRequests: (
        query: RoadmapProjectRequestsQuery,
    ) => Promise<RoadmapProjectRequestsResults>;
}

function queryString(query: RoadmapProjectQuery | RoadmapProjectRequestsQuery) {
    return new URLSearchParams(
        Object.entries(query)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, String(value)]),
    ).toString();
}

export const roadmapApi: RoadmapApi = {
    getProjects: async (query) =>
        RoadmapProjectResultsSchema.parse(
            await lightdashApi<RoadmapProjectResults>({
                url: `/org/roadmap/projects?${queryString(query)}`,
                method: 'GET',
                body: undefined,
                version: 'v1',
            }),
        ),
    getRequests: async (query) =>
        RoadmapProjectRequestsResultsSchema.parse(
            await lightdashApi<RoadmapProjectRequestsResults>({
                url: `/org/roadmap?${queryString(query)}`,
                method: 'GET',
                body: undefined,
                version: 'v1',
            }),
        ),
};
