import {
    type AiPromptContext,
    type AiPromptContextInput,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
    mergeAiPromptContextInput,
    mergeAiPromptContextItems,
} from '../components/ChatElements/contentMentions';
import {
    getCurrentDashboardOptimisticContext,
    getCurrentDashboardPromptContext,
    getLastDashboardContext,
} from '../store/dashboardPageContext';
import { useAiAgentStoreSelector } from '../store/hooks';

type PromptContext = Array<
    AiPromptContextInput[number] | AiPromptContext[number]
>;

type ContextToCurate = {
    context?: AiPromptContextInput;
    optimisticContext?: AiPromptContext;
};

export const useDashboardPageContextCuration = ({
    previousContext,
    projectUuid,
    threadId,
}: {
    previousContext: PromptContext;
    projectUuid: string;
    threadId?: string;
}) => {
    const currentDashboard = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.currentDashboard,
    );
    const previousDashboardContext = useMemo(
        () => getLastDashboardContext(previousContext),
        [previousContext],
    );
    const lastSubmittedDashboardContext = useRef<{
        threadId: string;
        context: ReturnType<typeof getLastDashboardContext>;
    } | null>(null);

    useEffect(() => {
        if (
            threadId &&
            previousDashboardContext &&
            lastSubmittedDashboardContext.current?.threadId !== threadId
        ) {
            lastSubmittedDashboardContext.current = {
                threadId,
                context: previousDashboardContext,
            };
        }
    }, [previousDashboardContext, threadId]);

    const curateContext = useCallback(
        ({ context, optimisticContext }: ContextToCurate) => {
            const comparisonDashboardContext =
                threadId &&
                lastSubmittedDashboardContext.current?.threadId === threadId
                    ? lastSubmittedDashboardContext.current.context
                    : previousDashboardContext;
            const explicitDashboardContext = getLastDashboardContext(
                context ?? [],
            );
            const shouldAttachPageContext =
                !explicitDashboardContext ||
                explicitDashboardContext.dashboardUuid ===
                    currentDashboard?.uuid;
            const pageComparisonDashboardContext =
                explicitDashboardContext ?? comparisonDashboardContext;
            const pagePromptContext = shouldAttachPageContext
                ? getCurrentDashboardPromptContext({
                      currentDashboard,
                      previousDashboardContext: pageComparisonDashboardContext,
                      projectUuid,
                  })
                : [];
            const pageOptimisticContext = shouldAttachPageContext
                ? getCurrentDashboardOptimisticContext({
                      currentDashboard,
                      previousDashboardContext: pageComparisonDashboardContext,
                      projectUuid,
                  })
                : [];

            return {
                context: mergeAiPromptContextInput(pagePromptContext, context),
                optimisticContext: mergeAiPromptContextItems(
                    pageOptimisticContext,
                    optimisticContext,
                ),
            };
        },
        [currentDashboard, previousDashboardContext, projectUuid, threadId],
    );

    const recordSubmittedContext = useCallback(
        (context: AiPromptContextInput | undefined) => {
            if (!threadId) return;

            const submittedDashboardContext = getLastDashboardContext(
                context ?? [],
            );
            if (submittedDashboardContext) {
                lastSubmittedDashboardContext.current = {
                    threadId,
                    context: submittedDashboardContext,
                };
            }
        },
        [threadId],
    );

    return { curateContext, recordSubmittedContext };
};
