import { subject } from '@casl/ability';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import useApp from '../../providers/App/useApp';
import { RoadmapProjects } from '../features/roadmap/RoadmapProjects';

export default function Roadmap() {
    const { user } = useApp();
    if (!user.data?.organizationUuid)
        return <EmptyStateLoader title="Loading roadmap" />;
    return (
        <RoadmapProjects
            key={user.data.organizationUuid}
            cacheKey={`${user.data.organizationUuid}:${user.data.userUuid}`}
            canFollow={user.data.ability.can(
                'manage',
                subject('Roadmap', {
                    organizationUuid: user.data.organizationUuid,
                }),
            )}
        />
    );
}
