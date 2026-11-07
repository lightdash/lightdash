import { type FC } from 'react';
import { Navigate, useLocation } from 'react-router';
import { getExternalSourcesRedirectUrl } from './urls';

/**
 * Settings › External sources moved to the Semantic Layer page. Its old URL
 * opens the same list there.
 */
export const ExternalSourcesRedirect: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { search } = useLocation();
    return (
        <Navigate
            replace
            to={getExternalSourcesRedirectUrl(projectUuid, search)}
        />
    );
};
