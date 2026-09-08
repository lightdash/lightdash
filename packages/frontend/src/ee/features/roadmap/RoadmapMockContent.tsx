import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RoadmapApiContext } from './roadmapApi';
import {
    createRoadmapMockApi,
    type RoadmapMockScenario,
} from './roadmapMockApi';
import { RoadmapProjects } from './RoadmapProjects';

export default function RoadmapMockContent({
    scenario,
}: {
    scenario: RoadmapMockScenario;
}) {
    const [client] = useState(
        () =>
            new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    );
    const [api] = useState(() => createRoadmapMockApi(scenario));
    return (
        <QueryClientProvider client={client}>
            <RoadmapApiContext.Provider value={api}>
                <RoadmapProjects
                    cacheKey={`preview-${scenario}`}
                    showDesignPartnerPreview
                />
            </RoadmapApiContext.Provider>
        </QueryClientProvider>
    );
}
