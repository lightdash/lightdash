import { contentToolSuccessOutputSchema } from '@lightdash/common';
import { z } from 'zod';
import {
    isSameDashboardRoute,
    isSameLocation,
} from '../../../../utils/dashboardRoutes';
import { type AiAgentToolResult } from '../types';

type LocationLike = Parameters<typeof isSameLocation>[1];

const dashboardContentToolArgsSchema = z.object({
    type: z.literal('dashboard'),
});

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
    const toolArgs = dashboardContentToolArgsSchema.safeParse(
        toolResult.toolArgs,
    );
    if (!toolArgs.success) return undefined;

    const output = contentToolSuccessOutputSchema.safeParse(
        toolResult.toolResult,
    );
    if (!output.success) return undefined;

    const { metadata } = output.data;
    return {
        dashboardUrl: metadata.href,
        dashboardUuid: metadata.uuid,
        dashboardSlug: metadata.slug,
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
