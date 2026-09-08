import { type FC } from 'react';
import { Navigate, useParams } from 'react-router';
import { useProjectUuid } from '../../hooks/useProjectUuid';

export const RedirectToResource: FC = () => {
    const { savedQueryUuid, dashboardUuid } = useParams();
    const projectUuid = useProjectUuid();
    if (dashboardUuid) {
        return (
            <Navigate
                to={`/minimal/projects/${projectUuid}/dashboards/${dashboardUuid}`}
                replace
            />
        );
    }
    if (savedQueryUuid) {
        return (
            <Navigate
                to={`/minimal/projects/${projectUuid}/saved/${savedQueryUuid}`}
                replace
            />
        );
    }
    return <Navigate to="/no-mobile-page" />;
};
