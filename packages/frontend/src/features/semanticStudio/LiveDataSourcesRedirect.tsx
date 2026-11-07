import { type FC } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { getLiveDataSourcesRedirectUrl } from './urls';

/**
 * Settings › Live data sources moved to the Semantic Layer page. Its old
 * URLs, including the one sign-in callbacks return to, open the same place
 * there.
 */
export const LiveDataSourcesRedirect: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { '*': rest = '' } = useParams();
    const { search } = useLocation();
    return (
        <Navigate
            replace
            to={getLiveDataSourcesRedirectUrl(projectUuid, rest, search)}
        />
    );
};
