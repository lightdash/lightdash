import { useCallback, type FC } from 'react';
import { useLocation } from 'react-router';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProject } from '../../hooks/useProject';
import ConnectionCredentialsSwitcher from './ConnectionCredentialsSwitcher';
import { isRouteThatNeedsWarehouseCredentials } from './routesThatNeedWarehouseCredentials';
import UserCredentialsSwitcher from './UserCredentialsSwitcher';

const ProjectCredentialsSwitcher: FC = () => {
    const location = useLocation();
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: activeProject } = useProject(activeProjectUuid);

    const reloadWhenPageNeedsCredentials = useCallback(() => {
        if (isRouteThatNeedsWarehouseCredentials(location)) {
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
