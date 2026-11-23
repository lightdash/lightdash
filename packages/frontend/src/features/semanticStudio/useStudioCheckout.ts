import {
    type ApiError,
    type ApiExploresResults,
    type Explore,
    type SemanticLayerDraft,
    type SemanticLayerDraftModel,
    type SemanticStudioWorkspace,
    type SummaryExplore,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useRef } from 'react';
import { useStoredStudioThread } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useSemanticStudioChat';
import useToaster from '../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { DEVELOPMENT_VIEW_HEADER, PUBLISHED_VIEW } from './developmentView';
import {
    useSemanticLayerStatus,
    useSemanticLayerWorkspaceDraft,
} from './useSemanticLayerModel';
import {
    useStudioWorkspaceAction,
    useStudioWorkspaces,
} from './useStudioWorkspaces';

/** What Models and Code show: Published, or one of your drafts folded on it. */
export type StudioCheckout = {
    /** Null on Published. */
    workspace: SemanticStudioWorkspace | null;
    /** Null on Published, and on projects whose changes live in a repository. */
    draft: SemanticLayerDraft | null;
};

export type StudioCheckoutState = {
    /** Null until the first checkout is read. */
    shown: StudioCheckout | null;
    /** A newer checkout is confirmed but not loaded yet, so the shown one stays. */
    isSwitching: boolean;
    error: ApiError | null;
};

const LIVE: StudioCheckout = { workspace: null, draft: null };

/** Reads the person's checkout and keeps showing the last loaded one until the next one has loaded. */
export const useStudioCheckoutState = (
    projectUuid: string,
): StudioCheckoutState => {
    const status = useSemanticLayerStatus(projectUuid);
    const workspaces = useStudioWorkspaces(projectUuid);
    const active =
        workspaces.data?.mine.find(({ isActive }) => isActive) ?? null;
    const keepsDraft = status?.appliesAs !== 'dbt_pull_request';
    const draft = useSemanticLayerWorkspaceDraft(
        projectUuid,
        status?.enabled && keepsDraft ? (active?.workspaceUuid ?? null) : null,
    );
    const target = ((): StudioCheckout | null => {
        if (!status) return null;
        if (!status.enabled || workspaces.error) return LIVE;
        if (!workspaces.data) return null;
        if (!active || !keepsDraft) return { workspace: active, draft: null };
        return draft.data ? { workspace: active, draft: draft.data } : null;
    })();
    const shown = useRef<StudioCheckout | null>(null);
    if (
        target &&
        (target.workspace !== shown.current?.workspace ||
            target.draft !== shown.current?.draft)
    ) {
        shown.current = target;
    }
    return {
        shown: shown.current,
        isSwitching: target === null,
        error: draft.error ?? null,
    };
};

const StudioCheckoutContext = createContext<StudioCheckoutState>({
    shown: null,
    isSwitching: false,
    error: null,
});

export const StudioCheckoutProvider = StudioCheckoutContext.Provider;

export const useStudioCheckout = (): StudioCheckoutState =>
    useContext(StudioCheckoutContext);

/** The checked-out change's version of one model; null when it leaves the model as live. */
export const findCheckedOutModel = (
    checkout: StudioCheckout | null,
    model: string,
): SemanticLayerDraftModel | null =>
    checkout?.draft?.models.find((entry) => entry.model === model) ?? null;

const toSummary = (
    explore: Explore,
    warehouseConnectionUuid: string | null,
): SummaryExplore => {
    const base = explore.tables[explore.baseTable];
    return {
        name: explore.name,
        label: explore.label,
        tags: explore.tags,
        groupLabel: explore.groupLabel,
        groups: explore.groups,
        type: explore.type,
        preAggregateSource: explore.preAggregateSource,
        externalSource: explore.externalSource,
        aiHint: explore.aiHint,
        customMeta: explore.customMeta,
        warnings: explore.warnings,
        description: base?.description,
        schemaName: base?.schema ?? '',
        databaseName: base?.database ?? '',
        warehouseConnectionUuid,
    };
};

/**
 * The published explore list, asked for by name so a page on a draft reads it
 * too. A draft kept in the app is laid over it here, so leaving the draft shows
 * what is published at once.
 */
export const usePublishedExplores = (
    projectUuid: string | undefined,
    enabled: boolean,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiExploresResults, ApiError>({
        // Under `tables`, so whatever refreshes the explore list refreshes this.
        queryKey: ['tables', projectUuid, 'filtered', PUBLISHED_VIEW],
        queryFn: () =>
            lightdashApi<ApiExploresResults>({
                url: `/projects/${projectUuid}/explores?filtered=true&includePreAggregates=false`,
                method: 'GET',
                body: undefined,
                headers: { [DEVELOPMENT_VIEW_HEADER]: 'false' },
            }),
        enabled: !!projectUuid && enabled,
        retry: false,
    });
};

/** The explore list as a change leaves it: its additions, edits and removals on top of live. */
export const foldDraftExplores = (
    live: SummaryExplore[],
    draft: SemanticLayerDraft | null,
): SummaryExplore[] => {
    if (!draft || draft.models.length === 0) return live;
    const drafted = new Map(draft.models.map((entry) => [entry.model, entry]));
    const kept = live.flatMap((summary): SummaryExplore[] => {
        const entry = drafted.get(summary.name);
        if (!entry) return [summary];
        if (entry.contentAfter === null) return [];
        // A change that does not compile keeps the live entry; the review says why.
        return [
            entry.explore
                ? toSummary(entry.explore, summary.warehouseConnectionUuid)
                : summary,
        ];
    });
    const liveNames = new Set(live.map(({ name }) => name));
    const added = draft.models.flatMap(({ model, explore, contentAfter }) =>
        contentAfter !== null && explore && !liveNames.has(model)
            ? [toSummary(explore, null)]
            : [],
    );
    return [...kept, ...added];
};

export const isOpenWorkspace = ({
    finishedAt,
    pullRequest,
}: SemanticStudioWorkspace): boolean =>
    !finishedAt &&
    pullRequest?.state !== 'merged' &&
    pullRequest?.state !== 'closed';

/** Checks out one of your drafts, or Published; the page keeps showing the current one until the next has loaded. */
export const useCheckOut = (projectUuid: string) => {
    const action = useStudioWorkspaceAction(projectUuid);
    const { shown, isSwitching } = useStudioCheckout();
    const { showToastApiError } = useToaster();
    const [, setStoredThread] = useStoredStudioThread(projectUuid);
    const isBusy = action.isLoading || isSwitching;
    const onError = (title: string) => (error: ApiError) => {
        showToastApiError({ title, apiError: error.error });
    };
    const checkOut = (target: SemanticStudioWorkspace | null) => {
        if (isBusy) return;
        if (
            (target?.workspaceUuid ?? null) ===
            (shown?.workspace?.workspaceUuid ?? null)
        ) {
            return;
        }
        action.mutate(
            target
                ? { kind: 'activate', workspaceUuid: target.workspaceUuid }
                : { kind: 'leave' },
            {
                onError: onError(
                    `Could not switch to ${target?.name ?? 'Published'}`,
                ),
            },
        );
    };
    const createChange = () => {
        if (isBusy) return;
        action.mutate(
            {
                kind: 'start',
                body: { threadUuid: null, name: 'Untitled' },
            },
            {
                // A new draft starts its own chat.
                onSuccess: () => setStoredThread(null),
                onError: onError('Could not start a draft'),
            },
        );
    };
    return { checkOut, createChange, isBusy, isError: action.isError };
};

/** The open pull request the checked-out draft was already sent as, which sending again updates; null without one. */
export const useDraftPullRequest = (): string | null => {
    const pullRequest = useStudioCheckout().shown?.workspace?.pullRequest;
    return pullRequest?.state === 'open' ? pullRequest.url : null;
};
