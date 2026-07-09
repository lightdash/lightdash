import {
    contentToolSuccessOutputSchema,
    type ContentToolSuccessMetadata,
} from '@lightdash/common';
import { z } from 'zod';
import { type StreamPart } from '../../ee/features/aiCopilot/store/aiAgentThreadStreamSlice';

const contentToolArgsSchema = z
    .object({
        type: z.union([z.literal('chart'), z.literal('dashboard')]),
    })
    .passthrough();

const createChartContentToolArgsSchema = z
    .object({
        type: z.literal('chart'),
        content: z
            .object({
                dashboardSlug: z.string().optional(),
            })
            .passthrough(),
    })
    .passthrough();

export type DashboardAiAgentChangeAction =
    | {
          type: 'refreshDashboard';
          focusChartSlug?: string;
      }
    | {
          type: 'refreshChart';
          chartSlug: string;
          focusTile: boolean;
      };

export type DashboardAiAgentChangePlan = {
    handledToolCallIds: string[];
    actions: DashboardAiAgentChangeAction[];
    pendingChartSlugToFocus: string | null;
};

const getSuccessfulContentToolMetadata = (
    part: StreamPart,
): ContentToolSuccessMetadata | null => {
    if (part.type !== 'toolCall') return null;
    if (part.toolName !== 'createContent' && part.toolName !== 'editContent') {
        return null;
    }
    if (part.isPreliminary !== false || !part.toolResult) return null;

    const output = contentToolSuccessOutputSchema.safeParse(part.toolResult);
    return output.success ? output.data.metadata : null;
};

const getTargetDashboardSlug = (toolArgs: unknown) => {
    const args = createChartContentToolArgsSchema.safeParse(toolArgs);
    return args.success ? args.data.content.dashboardSlug : undefined;
};

export const planDashboardAiAgentChanges = ({
    parts,
    handledToolCallIds,
    currentDashboardSlug,
    pendingChartSlugToFocus,
}: {
    parts: StreamPart[];
    handledToolCallIds: Set<string>;
    currentDashboardSlug: string;
    pendingChartSlugToFocus: string | null;
}): DashboardAiAgentChangePlan => {
    const actions: DashboardAiAgentChangeAction[] = [];
    const nextHandledToolCallIds: string[] = [];
    let nextPendingChartSlugToFocus = pendingChartSlugToFocus;

    for (const part of parts) {
        const metadata = getSuccessfulContentToolMetadata(part);
        if (!metadata) continue;
        if (part.type !== 'toolCall') continue;
        if (
            part.toolName !== 'createContent' &&
            part.toolName !== 'editContent'
        ) {
            continue;
        }
        if (handledToolCallIds.has(part.toolCallId)) continue;

        nextHandledToolCallIds.push(part.toolCallId);

        const contentSlug = metadata.slug;

        const args = contentToolArgsSchema.safeParse(part.toolArgs);
        if (!args.success) continue;

        switch (args.data.type) {
            case 'chart': {
                if (
                    part.toolName === 'createContent' &&
                    getTargetDashboardSlug(part.toolArgs) ===
                        currentDashboardSlug
                ) {
                    nextPendingChartSlugToFocus = contentSlug;
                    actions.push({
                        type: 'refreshDashboard',
                        focusChartSlug: contentSlug,
                    });
                    break;
                }

                actions.push({
                    type: 'refreshChart',
                    chartSlug: contentSlug,
                    focusTile: true,
                });
                break;
            }
            case 'dashboard': {
                if (contentSlug !== currentDashboardSlug) break;

                actions.push({
                    type: 'refreshDashboard',
                    focusChartSlug: nextPendingChartSlugToFocus ?? undefined,
                });
                break;
            }
        }
    }

    return {
        handledToolCallIds: nextHandledToolCallIds,
        actions,
        pendingChartSlugToFocus: nextPendingChartSlugToFocus,
    };
};
