import { type FC } from 'react';
import { Navigate } from 'react-router';
import { useProjectUuid } from '../hooks/useProjectUuid';

// Deep link kept for old bookmarks; the view lives on the Spaces page.
const SharedWithMe: FC = () => {
    const projectUuid = useProjectUuid()!;

    return (
        <Navigate
            to={`/projects/${projectUuid}/spaces?view=shared-with-me`}
            replace
        />
    );
};

export default SharedWithMe;
