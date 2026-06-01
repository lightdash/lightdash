import { type AiAgentToolResult } from '../types';

type LocationLike = {
    pathname: string;
    search: string;
};

const normalizePathname = (pathname: string): string =>
    pathname.replace(/\/$/, '');

const isSameLocation = (targetUrl: string, location: LocationLike): boolean => {
    const target = new URL(targetUrl, window.location.origin);

    return (
        normalizePathname(target.pathname) ===
            normalizePathname(location.pathname) &&
        target.search === location.search
    );
};

const getDashboardSlugFromContentToolResult = (
    toolResult: AiAgentToolResult,
): string | null => {
    if (toolResult.isPreliminary) return null;

    switch (toolResult.toolName) {
        case 'createContent':
            if (toolResult.toolArgs.type !== 'dashboard') return null;
            if (toolResult.toolResult.metadata.status !== 'success')
                return null;

            return (
                toolResult.toolResult.metadata.slug ??
                toolResult.toolArgs.content.slug
            );
        case 'editContent':
            if (toolResult.toolArgs.type !== 'dashboard') return null;
            if (toolResult.toolResult.metadata.status !== 'success')
                return null;

            return (
                toolResult.toolResult.metadata.slug ?? toolResult.toolArgs.slug
            );
        default:
            return null;
    }
};

const getDashboardUrlFromContentToolResult = (
    projectUuid: string,
    toolResult: AiAgentToolResult,
): string | null => {
    if (
        (toolResult.toolName === 'createContent' ||
            toolResult.toolName === 'editContent') &&
        toolResult.toolArgs.type === 'dashboard' &&
        toolResult.toolResult.metadata.status === 'success'
    ) {
        return toolResult.toolResult.metadata.url;
    }

    const dashboardSlug = getDashboardSlugFromContentToolResult(toolResult);
    return dashboardSlug
        ? `/projects/${projectUuid}/dashboards/${dashboardSlug}`
        : null;
};

export const getDashboardNavigationUrlFromContentToolResult = (
    projectUuid: string,
    toolResult: AiAgentToolResult,
    location: LocationLike = window.location,
): string | null => {
    const dashboardUrl = getDashboardUrlFromContentToolResult(
        projectUuid,
        toolResult,
    );
    if (!dashboardUrl || isSameLocation(dashboardUrl, location)) return null;

    return dashboardUrl;
};
