import { Navigate, useLocation, useParams } from 'react-router';

// The app viewer used to live at `/preview`; old bookmarked links must keep working.
const LegacyAppPreviewRedirect = () => {
    const { projectUuid, appUuid, version } = useParams();
    const location = useLocation();
    const basePath = `/projects/${projectUuid}/apps/${appUuid}`;

    return (
        <Navigate
            to={{
                pathname: version
                    ? `${basePath}/versions/${version}/view`
                    : `${basePath}/view`,
                search: location.search,
                hash: location.hash,
            }}
            replace
        />
    );
};

export default LegacyAppPreviewRedirect;
