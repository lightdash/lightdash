import { useCallback, type FC } from 'react';
import { matchRoutes, useLocation } from 'react-router';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProject } from '../../hooks/useProject';
import ConnectionCredentialsSwitcher from './ConnectionCredentialsSwitcher';
import { routesThatNeedWarehouseCredentials } from './routesThatNeedWarehouseCredentials';
import UserCredentialsSwitcher from './UserCredentialsSwitcher';

const ProjectCredentialsSwitcher: FC = () => {
    const location = useLocation();
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: activeProject } = useProject(activeProjectUuid);

    const reloadWhenPageNeedsCredentials = useCallback(() => {
        if (
            matchRoutes(
                routesThatNeedWarehouseCredentials.map((path) => ({ path })),
                location,
            )
        ) {
            window.location.reload();
        }
    }, [location]);

    if (activeProject?.connectionRoute === 'multi') {
        return (
            <ConnectionCredentialsSwitcher
                project={activeProject}
                onPreferenceSaved={reloadWhenPageNeedsCredentials}
            />
        );
    }
    return <UserCredentialsSwitcher />;
};

export default ProjectCredentialsSwitcher;
