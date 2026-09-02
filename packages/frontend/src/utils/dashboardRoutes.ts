import { matchPath } from 'react-router';

type LocationLike = {
    pathname: string;
    search?: string;
};

const normalizePathname = (pathname: string): string =>
    pathname.replace(/\/$/, '');

const getDashboardIdentifierFromPathname = (pathname: string) => {
    const match =
        matchPath(
            '/projects/:projectUuid/dashboards/:dashboardIdentifier/*',
            pathname,
        ) ??
        matchPath(
            '/projects/:projectUuid/dashboards/:dashboardIdentifier',
            pathname,
        );

    return match?.params.dashboardIdentifier ?? null;
};

// A URL may carry the project's uuid or its slug, so this is an identifier
// rather than specifically a uuid.
const getProjectIdentifierFromPathname = (pathname: string) => {
    const match =
        matchPath('/projects/:projectIdentifier/*', pathname) ??
        matchPath('/projects/:projectIdentifier', pathname);

    return match?.params.projectIdentifier ?? null;
};

export const isSameLocation = (
    targetUrl: string,
    location: LocationLike,
): boolean => {
    const target = new URL(targetUrl, window.location.origin);

    return (
        normalizePathname(target.pathname) ===
            normalizePathname(location.pathname) &&
        target.search === (location.search ?? '')
    );
};

/**
 * Whether a location points at this dashboard, in this project.
 *
 * A URL may carry either the uuid or the slug for the project and for the
 * dashboard, in any combination, so both forms are accepted. Matching is on
 * whole path segments, and the project has to match too: dashboard slugs are
 * only unique within a project, so a same-named dashboard elsewhere is not
 * this one.
 */
export const isSameDashboardRoute = ({
    location,
    projectUuid,
    projectSlug,
    dashboardUuid,
    dashboardSlug,
}: {
    location: LocationLike;
    projectUuid?: string;
    projectSlug?: string;
    dashboardUuid?: string;
    dashboardSlug?: string;
}) => {
    const currentProjectIdentifier = getProjectIdentifierFromPathname(
        location.pathname,
    );
    if (!currentProjectIdentifier) return false;
    if (![projectUuid, projectSlug].includes(currentProjectIdentifier))
        return false;

    const currentDashboardIdentifier = getDashboardIdentifierFromPathname(
        location.pathname,
    );
    if (!currentDashboardIdentifier) return false;

    return [dashboardUuid, dashboardSlug].includes(currentDashboardIdentifier);
};
