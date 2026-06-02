import { type StreamPart } from '../../ee/features/aiCopilot/store/aiAgentThreadStreamSlice';

type SuccessfulContentToolCall = Extract<StreamPart, { type: 'toolCall' }> & {
    toolName: 'createContent' | 'editContent';
    isPreliminary: false;
    toolResult: {
        metadata: {
            status: 'success';
            slug: string;
        };
    };
};

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

const isSuccessfulContentToolCall = (
    part: StreamPart,
): part is SuccessfulContentToolCall =>
    part.type === 'toolCall' &&
    (part.toolName === 'createContent' || part.toolName === 'editContent') &&
    part.isPreliminary === false &&
    part.toolResult?.metadata.status === 'success';

const getContentSlug = (part: SuccessfulContentToolCall) =>
    part.toolResult.metadata.slug;

const getTargetDashboardSlug = (part: SuccessfulContentToolCall) =>
    part.toolName === 'createContent' &&
    'dashboardSlug' in part.toolArgs.content
        ? part.toolArgs.content.dashboardSlug
        : undefined;

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
        if (!isSuccessfulContentToolCall(part)) continue;
        if (handledToolCallIds.has(part.toolCallId)) continue;

        nextHandledToolCallIds.push(part.toolCallId);

        const contentSlug = getContentSlug(part);

        switch (part.toolArgs.type) {
            case 'chart': {
                const targetDashboardSlug = getTargetDashboardSlug(part);
                if (
                    part.toolName === 'createContent' &&
                    targetDashboardSlug === currentDashboardSlug
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
