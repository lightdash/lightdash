import {
    type AiPromptContext,
    type AiPromptContextInput,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useDashboardPageContextCuration } from '../../hooks/useDashboardPageContextCuration';
import { usePinnedContext } from '../../hooks/usePinnedContext';
import {
    pendingContextResolved,
    unpinContext,
} from '../../store/aiAgentLauncherSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import {
    mergeAiPromptContextInput,
    mergeAiPromptContextItems,
} from '../ChatElements/contentMentions';
import { getPromptContextItemKey } from '../ChatElements/contentReferenceUtils';
import {
    isPinnableContextItem,
    toPinnedContextEntries,
    type PinnableContextItem,
} from '../PinnedContextChips/pinnableContext';
import { PinnedContextChips } from '../PinnedContextChips/PinnedContextChips';

/** Loads the names of content asked about from a page, then pins it. */
export const useResolvePendingContext = (projectUuid: string) => {
    const dispatch = useAiAgentStoreDispatch();
    const pendingContext = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.pendingContext,
    );
    const { contextInput, previewItems, isReady } = usePinnedContext({
        projectUuid,
        chartUuidOrSlug: pendingContext?.chartUuid,
        dashboardUuidOrSlug: pendingContext?.dashboardUuid,
        dataAppUuidOrSlug: pendingContext?.dataAppUuid,
        documentUuid: pendingContext?.documentUuid,
        sqlChartUuid: pendingContext?.sqlChartUuid,
        composerChartUuid: pendingContext?.composerChartUuid,
    });

    useEffect(() => {
        if (!pendingContext || !isReady) return;
        dispatch(
            pendingContextResolved(
                toPinnedContextEntries(contextInput, previewItems),
            ),
        );
    }, [contextInput, dispatch, isReady, pendingContext, previewItems]);
};

type PromptContext = {
    context?: AiPromptContextInput;
    optimisticContext?: AiPromptContext;
};

type Args = {
    projectUuid: string;
    /** Context the thread has already been sent; empty for a new thread. */
    previousContext: AiPromptContext;
    threadId: string | null;
    boundDashboardUuid: string | null;
};

/**
 * What the next prompt carries besides its text: the pinned content plus the
 * dashboard on screen, and the chips that show it in the composer.
 */
export const useLauncherNextPromptContext = ({
    projectUuid,
    previousContext,
    threadId,
    boundDashboardUuid,
}: Args) => {
    const dispatch = useAiAgentStoreDispatch();
    const pinned = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.pinnedContext,
    );
    const isPageContextDismissed = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.pageContextDismissed,
    );
    const isReady = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.pendingContext === null,
    );
    const pinnedInputs = useMemo(
        () => pinned.map(({ input }) => input),
        [pinned],
    );
    const pinnedPreviews = useMemo(
        () => pinned.map(({ preview }) => preview),
        [pinned],
    );
    const curationHistory = useMemo(
        () => [...previousContext, ...pinnedInputs],
        [pinnedInputs, previousContext],
    );
    const { curateContext, recordSubmittedContext } =
        useDashboardPageContextCuration({
            previousContext: threadId ? previousContext : curationHistory,
            projectUuid,
            threadId: threadId ?? undefined,
            boundDashboardUuid,
        });

    const buildContext = useCallback(
        ({ context, optimisticContext }: PromptContext): PromptContext => {
            const withPinned = {
                context: mergeAiPromptContextInput(pinnedInputs, context),
                optimisticContext: mergeAiPromptContextItems(
                    pinnedPreviews,
                    optimisticContext,
                ),
            };
            return isPageContextDismissed
                ? withPinned
                : curateContext(withPinned);
        },
        [curateContext, isPageContextDismissed, pinnedInputs, pinnedPreviews],
    );

    const nextContext = useMemo(() => buildContext({}), [buildContext]);
    const contextInput = useMemo(
        () => nextContext.context ?? [],
        [nextContext.context],
    );
    const previewItems = useMemo(
        () => nextContext.optimisticContext ?? [],
        [nextContext.optimisticContext],
    );

    const handleRemove = useCallback(
        (item: PinnableContextItem) =>
            dispatch(
                unpinContext({
                    key: getPromptContextItemKey(item),
                    dashboardUuid:
                        item.type === 'dashboard' ? item.dashboardUuid : null,
                }),
            ),
        [dispatch],
    );

    const pinnedContextNode: ReactNode = previewItems.some(
        isPinnableContextItem,
    ) ? (
        <PinnedContextChips items={previewItems} onRemove={handleRemove} />
    ) : undefined;

    return {
        buildContext,
        // Says how to add more once something is pinned.
        placeholder: pinnedContextNode
            ? 'Ask, or use @ to pin more content'
            : null,
        contextInput,
        isReady,
        pinnedContextNode,
        pinnedPreviews,
        previewItems,
        recordSubmittedContext,
    };
};
