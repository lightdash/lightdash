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

const getProjectUuidFromPathname = (pathname: string) => {
    const match = matchPath('/projects/:projectUuid/*', pathname);

    return match?.params.projectUuid ?? null;
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

export const isSameDashboardRoute = ({
    location,
    projectUuid,
    dashboardUuid,
    dashboardSlug,
}: {
    location: LocationLike;
    projectUuid: string;
    dashboardUuid?: string;
    dashboardSlug?: string;
}) => {
    const currentProjectUuid = getProjectUuidFromPathname(location.pathname);
    if (currentProjectUuid !== projectUuid) return false;

    const currentDashboardIdentifier = getDashboardIdentifierFromPathname(
        location.pathname,
    );
    if (!currentDashboardIdentifier) return false;

    return [dashboardUuid, dashboardSlug].includes(currentDashboardIdentifier);
};
