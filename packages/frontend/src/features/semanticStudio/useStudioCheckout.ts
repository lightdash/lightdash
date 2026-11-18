import {
    type ApiError,
    type Explore,
    type SemanticLayerDraft,
    type SemanticLayerDraftModel,
    type SemanticStudioWorkspace,
    type SummaryExplore,
} from '@lightdash/common';
import { createContext, useContext, useRef } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import {
    useSemanticLayerStatus,
    useSemanticLayerWorkspaceDraft,
} from './useSemanticLayerModel';
import {
    useStudioWorkspaceAction,
    useStudioWorkspaces,
} from './useStudioWorkspaces';

/** What Models and Code show: Live, or one of your changes folded on live. */
export type StudioCheckout = {
    /** Null on Live. */
    workspace: SemanticStudioWorkspace | null;
    /** Null on Live, and on projects whose changes live in a repository. */
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

/** Checks out one of your changes, or Live; the page keeps showing the current one until the next has loaded. */
export const useCheckOut = (projectUuid: string) => {
    const action = useStudioWorkspaceAction(projectUuid);
    const { shown, isSwitching } = useStudioCheckout();
    const { showToastApiError } = useToaster();
    const isBusy = action.isLoading || isSwitching;
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
                onError: ({ error }) =>
                    showToastApiError({
                        title: `Could not check out ${target?.name ?? 'Live'}`,
                        apiError: error,
                    }),
            },
        );
    };
    const createChange = () => {
        if (isBusy) return;
        action.mutate(
            {
                kind: 'start',
                body: { threadUuid: null, name: 'Untitled change' },
            },
            {
                onError: ({ error }) =>
                    showToastApiError({
                        title: 'Could not start a change',
                        apiError: error,
                    }),
            },
        );
    };
    return { checkOut, createChange, isBusy, isError: action.isError };
};
