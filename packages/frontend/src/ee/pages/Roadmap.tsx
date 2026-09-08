import { lazy, Suspense } from 'react';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import useApp from '../../providers/App/useApp';
import { RoadmapProjects } from '../features/roadmap/RoadmapProjects';

const MockRoadmap = lazy(
    () => import('../features/roadmap/RoadmapMockContent'),
);

export default function Roadmap() {
    const { user } = useApp();
    if (import.meta.env.DEV && import.meta.env.VITE_ROADMAP_MOCK_API === 'true')
        return (
            <Suspense fallback={<EmptyStateLoader title="Loading roadmap" />}>
                <MockRoadmap scenario="populated" />
            </Suspense>
        );
    if (!user.data?.organizationUuid)
        return <EmptyStateLoader title="Loading roadmap" />;
    return (
        <RoadmapProjects
            key={user.data.organizationUuid}
            cacheKey={`${user.data.organizationUuid}:${user.data.userUuid}`}
        />
    );
}
