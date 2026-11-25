import {
    isOpenWorkspace,
    isPullRequestOpen,
    type SemanticStudioWorkspace,
} from '@lightdash/common';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { VIEW_PARAM, type StudioParams, type StudioView } from './modelCode';
import { type SourcesTarget } from './SourcesView';
import {
    type StartStudioThread,
    type StoredThread,
    type StudioPendingChange,
    type StudioPullRequest,
} from './studioChange';
import { type StudioStage } from './studioStage';
import { draftNameOfPullRequest, getSemanticStudioUrl } from './urls';
import { SOURCE_PARAM } from './useStudioSources';
import { type Pane } from './workbenchWorkflows';

/** What the dbt toolbar shows of the change you are on, and how it moves to another. */
export type DbtToolbarSelection = {
    isOnMyChange: boolean;
    isChangeInSources: boolean;
    sourcesPrUrl: string | null;
    sourcesChangeName: string | null;
    startNewChange: () => void;
    pickLive: () => void;
    pickChange: (workspace: SemanticStudioWorkspace) => void;
};

type DbtChangeSelectionInput = {
    projectUuid: string;
    routeWorkspaceUuid: string | null;
    routeWorkspace: SemanticStudioWorkspace | null;
    readsSources: boolean;
    changeOnPage: StudioPullRequest | null;
    development: StudioPullRequest | null;
    pullRequest: StudioPullRequest | null;
    saving: StudioPendingChange | null;
    hasProposal: boolean;
    shownWorkspace: SemanticStudioWorkspace | null;
    stage: StudioStage | null;
    studioView: StudioView | null;
    homeShowsChanges: boolean;
    changeName: string | undefined;
    storedThread: StoredThread | null;
    setStoredThread: (thread: StoredThread | null) => void;
    studioAgentUuid: string | null;
    startThread: StartStudioThread;
    startNewThread: () => void;
    setIsTryingChanges: (isTrying: boolean) => void;
    setIsChatOpen: (isOpen: boolean) => void;
    openWorkspace: (
        target: SemanticStudioWorkspace,
        options: { navigateTo: boolean },
    ) => void;
    setStudioParams: (params: StudioParams) => void;
    switchView: (next: StudioView) => void;
    sourceFile: string | null;
};

/** Which change of a dbt project Sources reads and saves to, or live, and the toolbar's ways between them. */
export const useDbtChangeSelection = ({
    projectUuid,
    routeWorkspaceUuid,
    routeWorkspace,
    readsSources,
    changeOnPage,
    development,
    pullRequest,
    saving,
    hasProposal,
    shownWorkspace,
    stage,
    studioView,
    homeShowsChanges,
    changeName,
    storedThread,
    setStoredThread,
    studioAgentUuid,
    startThread,
    startNewThread,
    setIsTryingChanges,
    setIsChatOpen,
    openWorkspace,
    setStudioParams,
    switchView,
    sourceFile,
}: DbtChangeSelectionInput) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [isOnLive, setIsOnLive] = useState(false);
    // Opening a change's page, from anywhere, puts you on that change.
    useEffect(() => {
        if (routeWorkspaceUuid) setIsOnLive(false);
    }, [routeWorkspaceUuid]);
    // Sources reads the change you are on, or live; saving from live opens a change.
    const [openedPrUrl, setOpenedPrUrl] = useState<string | null>(null);
    // A new change has no pull request until its first save, but you are on it.
    const [isStartingChange, setIsStartingChange] = useState(false);
    // Every change is read in one place, Sources, starting on its overview; only your open one is edited there.
    const opensInSources =
        !isOnLive &&
        readsSources &&
        !!changeOnPage &&
        (!!routeWorkspace || studioView === 'changes' || homeShowsChanges);
    const isMyOpenWorkspace =
        !!shownWorkspace?.isMine && isOpenWorkspace(shownWorkspace);
    const isOnMyChange =
        !isOnLive &&
        !(routeWorkspace && !routeWorkspace.isMine) &&
        (isStartingChange ||
            !!saving ||
            hasProposal ||
            !!development ||
            !!openedPrUrl ||
            isMyOpenWorkspace);
    // Sources edits your own change only; a teammate's is looked at on its page.
    const changePrUrl =
        opensInSources && changeOnPage
            ? changeOnPage.prUrl
            : ((development?.isMine ? development.prUrl : null) ??
              (shownWorkspace?.isMine &&
              isPullRequestOpen(shownWorkspace.pullRequest)
                  ? shownWorkspace.pullRequest.url
                  : null) ??
              openedPrUrl);
    const sourcesPrUrl = isOnLive ? null : changePrUrl;
    // Whose change the page shows decides whether its code can be edited, and whether your chat's proposal belongs on it.
    const sourcesOwnerReason = ((): string | null => {
        if (!opensInSources) return null;
        if (stage?.step === 'live' || stage?.step === 'closed') {
            return 'This draft has ended, so it can no longer be edited.';
        }
        if (!changeOnPage?.isMine) {
            return `Only ${shownWorkspace?.owner.name ?? 'its owner'} can edit this draft.`;
        }
        return changeOnPage.state === 'open'
            ? null
            : `This draft's pull request is ${changeOnPage.state}, so it can no longer be edited.`;
    })();
    // A save by the agent commits over a hand save to the same file, so they take turns.
    const sourcesReadOnlyReason =
        saving && !isOnLive
            ? 'The agent is saving. You can edit when it finishes.'
            : sourcesOwnerReason;
    const sourcesTarget: SourcesTarget = {
        projectUuid,
        prUrl: sourcesPrUrl,
        head:
            sourcesPrUrl && sourcesPrUrl === pullRequest?.prUrl
                ? pullRequest.revision
                : null,
        // On Published a save starts a draft of its own, not one for the last conversation.
        threadUuid: isOnMyChange ? (storedThread?.threadUuid ?? null) : null,
        newChangeAgentUuid:
            !isOnMyChange || !storedThread ? studioAgentUuid : null,
        startThread,
        changeName: sourcesPrUrl
            ? (changeName ?? draftNameOfPullRequest(sourcesPrUrl) ?? 'Draft #')
            : null,
        readOnlyReason: sourcesReadOnlyReason,
    };
    const onSourcesSaved = (prUrl: string, thread: StoredThread | null) => {
        if (prUrl === sourcesPrUrl) return;
        // A save from live started a change of its own, with a conversation to ask about it in.
        if (thread) setStoredThread(thread);
        else if (!sourcesTarget.threadUuid) setStoredThread(null);
        setOpenedPrUrl(prUrl);
        setIsOnLive(false);
        setIsChatOpen(true);
    };
    const showLive = () => {
        setIsTryingChanges(false);
        setIsOnLive(true);
        switchView('models');
    };
    const toolbarFor = (pane: Pane): DbtToolbarSelection => {
        const isSourcesView = pane === 'sources' || pane === 'code';
        return {
            isOnMyChange,
            // Like a git branch: which change you are on, or live, and the way to the others.
            isChangeInSources: pane === 'sources' && !!sourcesPrUrl,
            sourcesPrUrl,
            sourcesChangeName: sourcesTarget.changeName,
            startNewChange: () => {
                startNewThread();
                setIsTryingChanges(false);
                setIsOnLive(false);
                setOpenedPrUrl(null);
                setIsStartingChange(true);
                setIsChatOpen(true);
                // From a list or a change's page a new change starts in Sources; elsewhere you stay where you are.
                if (pane === 'workspaces' || pane === 'changes') {
                    setStudioParams({ [VIEW_PARAM]: 'sources' });
                } else if (routeWorkspaceUuid) {
                    void navigate(
                        `${getSemanticStudioUrl(projectUuid, { ref: null })}${isSourcesView ? `?${searchParams.toString()}` : ''}`,
                    );
                }
            },
            pickLive: () => {
                setIsOnLive(true);
                setIsStartingChange(false);
                setIsTryingChanges(false);
                if (!isSourcesView) switchView('models');
                // A change's page or overview is that change, so live leaves it for the live files.
                else if (routeWorkspaceUuid || !sourceFile) {
                    setStudioParams({
                        [VIEW_PARAM]: 'sources',
                        ...(sourceFile ? { [SOURCE_PARAM]: sourceFile } : {}),
                    });
                }
            },
            pickChange: (target) => {
                setIsOnLive(false);
                setOpenedPrUrl(null);
                setIsStartingChange(false);
                setIsChatOpen(true);
                openWorkspace(target, { navigateTo: !isSourcesView });
            },
        };
    };
    return {
        isOnLive,
        isStartingChange,
        opensInSources,
        sourcesPrUrl,
        sourcesOwnerReason,
        sourcesTarget,
        onSourcesSaved,
        showLive,
        toolbarFor,
    };
};
