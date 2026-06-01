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

const getDashboardUrlFromContentToolResult = (
    toolResult: AiAgentToolResult,
): string | null => {
    if (toolResult.isPreliminary) return null;

    if (toolResult.toolName === 'createContent') {
        if (toolResult.toolArgs.type !== 'dashboard') return null;
        if (toolResult.toolResult.metadata.status !== 'success') return null;

        return toolResult.toolResult.metadata.href;
    }

    if (toolResult.toolName === 'editContent') {
        if (toolResult.toolArgs.type !== 'dashboard') return null;
        if (toolResult.toolResult.metadata.status !== 'success') return null;

        return toolResult.toolResult.metadata.href;
    }

    return null;
};

export const getDashboardNavigationUrlFromContentToolResult = (
    projectUuid: string,
    toolResult: AiAgentToolResult,
    location: LocationLike = window.location,
): string | null => {
    const dashboardUrl = getDashboardUrlFromContentToolResult(toolResult);
    if (!dashboardUrl || isSameLocation(dashboardUrl, location)) return null;

    return dashboardUrl;
};
