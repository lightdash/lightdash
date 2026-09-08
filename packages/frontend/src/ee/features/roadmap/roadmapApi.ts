import {
    RoadmapProjectResultsSchema,
    RoadmapProjectRequestsResultsSchema,
    type RoadmapProjectQuery,
    type RoadmapProjectRequestsQuery,
    type RoadmapProjectResults,
    type RoadmapProjectRequestsResults,
} from '@lightdash/common';
import { createContext, useContext } from 'react';
import { lightdashApi } from '../../../api';

export interface RoadmapApi {
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

const roadmapApi: RoadmapApi = {
    getProjects: async (query) =>
        RoadmapProjectResultsSchema.parse(
            await lightdashApi<RoadmapProjectResults>({
                url: `/org/roadmap/projects?${queryString(query)}`,
                method: 'GET',
                body: undefined,
                version: 'v2',
            }),
        ),
    getRequests: async (query) =>
        RoadmapProjectRequestsResultsSchema.parse(
            await lightdashApi<RoadmapProjectRequestsResults>({
                url: `/org/roadmap/requests?${queryString(query)}`,
                method: 'GET',
                body: undefined,
                version: 'v2',
            }),
        ),
};

export const RoadmapApiContext = createContext(roadmapApi);
export const useRoadmapApi = () => useContext(RoadmapApiContext);
