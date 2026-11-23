/**
 * The two ways a Semantic Layer change is made: a draft kept in the app, or a
 * pull request on the project's dbt repository. WorkbenchView picks one and
 * renders what it returns; what one workflow lacks, its facts leave empty.
 */
import {
    isOpenWorkspace,
    type SemanticStudioCheckout,
    type SemanticStudioWorkspace,
} from '@lightdash/common';
import { Box, Menu, Text } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { type ReactNode, type RefObject } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { DRAFT_PARAM, DRAFT_REVIEW, VIEW_PARAM } from './modelCode';
import { DraftDevelopmentBar } from './SemanticLayerDraft';
import {
    type StudioPendingChange,
    type StudioPullRequest,
} from './studioChange';
import { DraftPickerMenu, StudioCheckoutPicker } from './StudioCheckoutPicker';
import { type StudioStage } from './studioStage';
import {
    describeBranchCompile,
    type useCompileCheckout,
} from './useSemanticLayerModel';
import { SOURCE_PARAM } from './useStudioSources';

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
    view: string | null;
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
    changesParams: Record<string, string>;
    isLookingAtChange: boolean;
    hasDraftChanges: boolean;
    development: StudioPullRequest | null;
    changeOnPage: StudioPullRequest | null;
    saving: StudioPendingChange | null;
    hasClosedPullRequest: boolean;
    hasProposal: boolean;
    isMerged: boolean;
};

type PiecesInput = {
    projectUuid: string;
    pane: Pane;
    stage: StudioStage | null;
    hasDraft: boolean;
    canEditModels: boolean;
    isChangeInSources: boolean;
    isOnMyChange: boolean;
    development: StudioPullRequest | null;
    saving: StudioPendingChange | null;
    shownWorkspace: SemanticStudioWorkspace | null;
    myWorkspaces: SemanticStudioWorkspace[];
    sourcesPrUrl: string | null;
    sourcesChangeName: string | null;
    changeName: string | undefined;
    draftCheckout: SemanticStudioCheckout | null | undefined;
    compileAgain: ReturnType<typeof useCompileCheckout>;
    lastSourceFile: RefObject<string | null>;
    onShowChanges: (() => void) | null;
    switchView: (next: string) => void;
    setStudioParams: (params: Record<string, string>) => void;
    startNewThread: () => void;
    startNewChange: () => void;
    checkOut: (workspace: SemanticStudioWorkspace) => void;
    pickLive: () => void;
    pickChange: (workspace: SemanticStudioWorkspace) => void;
};

type WorkflowPieces = {
    picker: ReactNode;
    developmentBar: ReactNode;
    showsChangeActions: boolean;
    showsStagePill: boolean;
    showSources: () => void;
    onCheckOut: ((workspace: SemanticStudioWorkspace) => void) | null;
};

export type WorkbenchWorkflow = {
    facts: (input: FactsInput) => WorkflowFacts;
    /** The workspace the open chat is on. */
    chatWorkspace: (workspaces: {
        active: SemanticStudioWorkspace | null;
        thread: SemanticStudioWorkspace | null;
    }) => SemanticStudioWorkspace | null;
    pieces: (input: PiecesInput) => WorkflowPieces;
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
    pieces: ({
        projectUuid,
        pane,
        stage,
        hasDraft,
        canEditModels,
        onShowChanges,
        switchView,
        startNewThread,
        checkOut,
    }) => ({
        picker: canEditModels ? (
            <StudioCheckoutPicker
                projectUuid={projectUuid}
                onShowChanges={onShowChanges}
            />
        ) : null,
        developmentBar: (
            <DraftDevelopmentBar
                projectUuid={projectUuid}
                onDiscarded={startNewThread}
            />
        ),
        // A checked-out draft keeps its actions on every tab; a draft's own page carries them in its header.
        showsChangeActions: pane !== 'changeSummary' && pane !== 'workspaces',
        // The bar says how an open draft is doing, so the pill shows only once it ends.
        showsStagePill: !!stage && stage.step !== 'proposed',
        showSources: () => switchView(hasDraft ? 'changes' : 'code'),
        onCheckOut: checkOut,
    }),
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
    pieces: ({
        pane,
        stage,
        isChangeInSources,
        isOnMyChange,
        development,
        saving,
        shownWorkspace,
        myWorkspaces,
        sourcesPrUrl,
        sourcesChangeName,
        changeName,
        draftCheckout,
        compileAgain,
        lastSourceFile,
        onShowChanges,
        setStudioParams,
        startNewChange,
        pickLive,
        pickChange,
    }) => {
        const myOpenChanges = myWorkspaces.filter(isOpenWorkspace);
        // The compile belongs to the server checkout, so it shows only on that draft.
        const branchCompile =
            isOnMyChange &&
            draftCheckout?.workspaceUuid === shownWorkspace?.workspaceUuid
                ? (draftCheckout?.branchCompile ?? null)
                : null;
        const compileDescription = branchCompile
            ? describeBranchCompile(branchCompile)
            : null;
        return {
            picker: (
                <DraftPickerMenu
                    currentName={
                        sourcesChangeName ??
                        (isOnMyChange ? (changeName ?? 'New draft') : null)
                    }
                    drafts={myOpenChanges.map((target) => ({
                        id: target.workspaceUuid,
                        name: target.name,
                        isCurrent:
                            !!sourcesPrUrl &&
                            sourcesPrUrl === target.pullRequest?.url,
                        updatedAt: target.updatedAt,
                    }))}
                    isBusy={false}
                    isEnded={stage?.step === 'live' || stage?.step === 'closed'}
                    status={null}
                    header={
                        branchCompile && compileDescription ? (
                            <>
                                <Box px="sm" py={6}>
                                    <Text fz="xs" fw={500}>
                                        {compileDescription}
                                    </Text>
                                    {branchCompile.error ? (
                                        <Text
                                            fz="xs"
                                            c="dimmed"
                                            lineClamp={3}
                                            title={branchCompile.error}
                                        >
                                            {branchCompile.error}
                                        </Text>
                                    ) : null}
                                </Box>
                                {branchCompile.status === 'failed' ? (
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon
                                                icon={IconRefresh}
                                                size={14}
                                            />
                                        }
                                        disabled={compileAgain.isLoading}
                                        onClick={() => compileAgain.mutate()}
                                    >
                                        Compile again
                                    </Menu.Item>
                                ) : null}
                            </>
                        ) : null
                    }
                    onPublished={pickLive}
                    onPick={(id) => {
                        const target = myOpenChanges.find(
                            ({ workspaceUuid }) => workspaceUuid === id,
                        );
                        if (target) pickChange(target);
                    }}
                    onNew={startNewChange}
                    onShowAll={onShowChanges}
                />
            ),
            developmentBar: null,
            showsChangeActions:
                isChangeInSources ||
                (pane !== 'changes' &&
                    pane !== 'workspaces' &&
                    isOnMyChange &&
                    (!!development || !!saving)),
            showsStagePill:
                !!stage &&
                isChangeInSources &&
                stage.step !== 'in_review' &&
                stage.step !== 'saving',
            showSources: () =>
                setStudioParams({
                    [VIEW_PARAM]: 'sources',
                    ...(lastSourceFile.current
                        ? { [SOURCE_PARAM]: lastSourceFile.current }
                        : {}),
                }),
            onCheckOut: null,
        };
    },
};
