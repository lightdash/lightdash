import {
    isSameDashboardRoute,
    isSameLocation,
} from '../../../../utils/dashboardRoutes';
import { type AiAgentToolResult } from '../types';

type LocationLike = Parameters<typeof isSameLocation>[1];

const getDashboardNavigationTargetFromContentToolResult = (
    toolResult: AiAgentToolResult,
):
    | {
          dashboardUrl: string;
          dashboardUuid: string;
          dashboardSlug: string;
      }
    | undefined => {
    if (toolResult.isPreliminary) return undefined;

    if (
        toolResult.toolName !== 'createContent' &&
        toolResult.toolName !== 'editContent'
    ) {
        return undefined;
    }
    if (toolResult.toolArgs.type !== 'dashboard') return undefined;
    if (toolResult.toolResult.metadata.status !== 'success') return undefined;

    return {
        dashboardUrl: toolResult.toolResult.metadata.href,
        dashboardUuid: toolResult.toolResult.metadata.uuid,
        dashboardSlug: toolResult.toolResult.metadata.slug,
    };
};

export const getDashboardNavigationUrlFromContentToolResult = (
    projectUuid: string,
    toolResult: AiAgentToolResult,
    location: LocationLike = window.location,
): string | null => {
    const target =
        getDashboardNavigationTargetFromContentToolResult(toolResult);
    if (
        !target ||
        isSameLocation(target.dashboardUrl, location) ||
        isSameDashboardRoute({
            location,
            projectUuid,
            dashboardUuid: target.dashboardUuid,
            dashboardSlug: target.dashboardSlug,
        })
    )
        return null;

    return target.dashboardUrl;
};
