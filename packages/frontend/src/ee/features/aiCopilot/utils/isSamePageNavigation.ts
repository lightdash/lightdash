import { matchPath } from 'react-router';

type LocationLike = {
    pathname: string;
    search: string;
};

const CONTENT_ROUTE_PATTERNS = [
    '/projects/:projectUuid/:contentType/:contentUuid',
    '/projects/:projectUuid/:contentType/:contentUuid/view',
    '/projects/:projectUuid/:contentType/:contentUuid/view/tabs/:tabUuid',
    '/minimal/projects/:projectUuid/:contentType/:contentUuid',
    '/minimal/projects/:projectUuid/:contentType/:contentUuid/view/tabs/:tabUuid',
];

const getContentRouteIdentity = (pathname: string) => {
    const match = CONTENT_ROUTE_PATTERNS.map((pattern) =>
        matchPath(pattern, pathname),
    ).find(
        (matchedPath) =>
            matchedPath?.params.contentType === 'dashboards' ||
            matchedPath?.params.contentType === 'saved',
    );
    if (!match) return null;

    return {
        projectUuid: match.params.projectUuid,
        contentType: match.params.contentType,
        contentUuid: match.params.contentUuid,
    };
};

const normalizePathname = (pathname: string): string =>
    pathname.replace(/\/$/, '');

export function getInternalNavigationUrl(targetUrl: string): string;
export function getInternalNavigationUrl(
    targetUrl: unknown,
): string | undefined;
export function getInternalNavigationUrl(
    targetUrl: unknown,
): string | undefined {
    if (typeof targetUrl !== 'string' || targetUrl.length === 0) {
        return undefined;
    }

    const target = new URL(targetUrl, window.location.origin);
    const isInternalLightdashPath = /^\/(?:minimal\/)?projects\//.test(
        target.pathname,
    );

    if (target.origin === window.location.origin || isInternalLightdashPath) {
        return `${target.pathname}${target.search}${target.hash}`;
    }

    return targetUrl;
}

export const isSamePageNavigation = (
    targetUrl: string,
    location: LocationLike,
): boolean => {
    const target = new URL(targetUrl, window.location.origin);
    const currentContent = getContentRouteIdentity(location.pathname);
    const targetContent = getContentRouteIdentity(target.pathname);

    if (currentContent && targetContent) {
        return (
            currentContent.projectUuid === targetContent.projectUuid &&
            currentContent.contentType === targetContent.contentType &&
            currentContent.contentUuid === targetContent.contentUuid
        );
    }

    return (
        normalizePathname(target.pathname) ===
            normalizePathname(location.pathname) &&
        target.search === location.search
    );
};
