import { subject } from '@casl/ability';
import { useTranslation } from 'react-i18next';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import useApp from '../../providers/App/useApp';
import { RoadmapProjects } from '../features/roadmap/RoadmapProjects';

export default function Roadmap() {
    const { t } = useTranslation('eeMisc');
    const { user } = useApp();
    if (!user.data?.organizationUuid)
        return <EmptyStateLoader title={t('roadmap.page.loading')} />;
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
