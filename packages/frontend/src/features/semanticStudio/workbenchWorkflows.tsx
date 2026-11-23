/**
 * The two ways a Semantic Layer change is made: a draft kept in the app, or a
 * pull request on the project's dbt repository. WorkbenchView picks one and
 * renders what it returns; what one workflow lacks, its facts leave empty.
 */
import { type SemanticStudioWorkspace } from '@lightdash/common';
import { type FC } from 'react';
import {
    DRAFT_PARAM,
    DRAFT_REVIEW,
    VIEW_PARAM,
    type StudioParams,
    type StudioView,
} from './modelCode';
import {
    type StudioPendingChange,
    type StudioPullRequest,
} from './studioChange';
import {
    DbtToolbar,
    DraftToolbar,
    type ToolbarProps,
} from './WorkbenchToolbar';

/** What the workspace shows beside the rail. */
export type Pane =
    | 'code'
    | 'changeSummary'
    | 'sources'
    | 'changes'
    | 'workspaces'
    | 'review'
    | 'browse'
    | 'buildFirst'
    | 'empty';

type FactsInput = {
    hasChat: boolean;
    view: StudioView | null;
    isGithubProject: boolean;
    /** An agent is there to ask and a warehouse to build from. */
    canAskForModels: boolean;
    hasCheckout: boolean;
    routeWorkspace: SemanticStudioWorkspace | null;
    isRouteCheckedOut: boolean;
    isOnChangePage: boolean;
    pullRequest: StudioPullRequest | null;
    pendingChange: StudioPendingChange | null;
    proposal: string[];
    hasDraft: boolean;
    isBuildingFirstModel: boolean;
    isReviewingDraft: boolean;
};

type WorkflowFacts = {
    hasCodeView: boolean;
    /** The Code tab, on the model YAML kept here. */
    isCode: boolean;
    readsStoredModels: boolean;
    /** Code is read from the repository, in Sources. */
    readsSources: boolean;
    canBuildModels: boolean;
    /** Your chat and the server's active workspace follow each other. */
    chatFollowsWorkspace: boolean;
    /** Where the changes view is. */
    changesParams: StudioParams;
    /** Where the Code tab goes. */
    codeTab: Extract<StudioView, 'code' | 'changes' | 'sources'>;
    /** A change is checked out from the list of drafts. */
    canCheckOut: boolean;
    isLookingAtChange: boolean;
    hasDraftChanges: boolean;
    development: StudioPullRequest | null;
    changeOnPage: StudioPullRequest | null;
    saving: StudioPendingChange | null;
    hasClosedPullRequest: boolean;
    hasProposal: boolean;
    isMerged: boolean;
};

export type WorkbenchWorkflow = {
    facts: (input: FactsInput) => WorkflowFacts;
    /** The workspace the open chat is on. */
    chatWorkspace: (workspaces: {
        active: SemanticStudioWorkspace | null;
        thread: SemanticStudioWorkspace | null;
    }) => SemanticStudioWorkspace | null;
    /** The change you are on and its actions, after the views. */
    Toolbar: FC<ToolbarProps>;
};

/** Changes are drafts kept in the app, checked out to be seen and edited. */
export const DRAFT_WORKFLOW: WorkbenchWorkflow = {
    facts: ({
        hasChat,
        view,
        canAskForModels,
        hasCheckout,
        routeWorkspace,
        isRouteCheckedOut,
        hasDraft,
        isBuildingFirstModel,
        isReviewingDraft,
    }) => {
        const isCode = hasChat && view === 'code';
        return {
            hasCodeView: true,
            isCode,
            readsStoredModels: isCode || isReviewingDraft,
            readsSources: false,
            canBuildModels: canAskForModels,
            chatFollowsWorkspace: false,
            changesParams: { [DRAFT_PARAM]: DRAFT_REVIEW },
            codeTab: hasDraft ? 'changes' : 'code',
            canCheckOut: true,
            // A link to a change that is not checked out shows where it stands; its edits show once it is checked out.
            isLookingAtChange:
                hasCheckout && !!routeWorkspace && !isRouteCheckedOut,
            hasDraftChanges: hasDraft && !isBuildingFirstModel,
            development: null,
            changeOnPage: null,
            saving: null,
            hasClosedPullRequest: false,
            hasProposal: false,
            isMerged: false,
        };
    },
    chatWorkspace: ({ active }) => active,
    Toolbar: DraftToolbar,
};

/** A dbt project has no draft and no model code here: its files are in its repository, changed by pull request. */
export const DBT_WORKFLOW: WorkbenchWorkflow = {
    facts: ({
        hasChat,
        view,
        isGithubProject,
        routeWorkspace,
        isOnChangePage,
        pullRequest,
        pendingChange,
        proposal,
    }): WorkflowFacts => {
        const development = pullRequest?.isOpen ? pullRequest : null;
        return {
            // A dbt project's files are read through GitHub; another host has no Code tab to show.
            hasCodeView: isGithubProject,
            isCode: false,
            readsStoredModels: false,
            readsSources: hasChat && isGithubProject,
            canBuildModels: false,
            chatFollowsWorkspace: true,
            // On a change's own page the bare path shows it; elsewhere it is a view.
            changesParams: isOnChangePage ? {} : { [VIEW_PARAM]: 'changes' },
            codeTab: 'sources',
            canCheckOut: false,
            isLookingAtChange: false,
            hasDraftChanges: false,
            development,
            // A linked change shows whatever state it is in; otherwise only an open one is on the page.
            changeOnPage:
                routeWorkspace || view === 'changes'
                    ? pullRequest
                    : development,
            saving: pendingChange,
            // A dbt project's changes are tried through its pull request's preview, so there is nothing to try once that closes.
            hasClosedPullRequest: pullRequest?.state === 'closed',
            // A dbt project's changes are its conversation's: what it proposes, and what its pull request holds.
            hasProposal: proposal.length > 0,
            isMerged: pullRequest?.state === 'merged',
        };
    },
    chatWorkspace: ({ thread }) => thread,
    Toolbar: DbtToolbar,
};
