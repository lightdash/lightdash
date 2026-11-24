/**
 * Semantic Layer: the tree on the left and the page beside it, at the width
 * settings pages use. Every page lives there: a kind, a source, a folder or
 * an explore and its fields. Breadcrumbs lead back up; fields open in a
 * modal.
 */
import {
    assertUnreachable,
    DbtProjectType,
    isOpenWorkspace,
    isPullRequestOpen,
    type SemanticLayerBlocker,
} from '@lightdash/common';
import {
    Anchor,
    Avatar,
    Box,
    Button,
    Group,
    Loader,
    Paper,
    Text,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconArrowUpRight,
    IconMessage,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import {
    createSearchParams,
    Link,
    useLocation,
    useNavigate,
    useSearchParams,
} from 'react-router';
import { EmptyState } from '../../components/common/EmptyState';
import MantineIcon from '../../components/common/MantineIcon';
import { SemanticStudioAgent } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/SemanticStudioAgent';
import { StudioChanges } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/StudioChanges';
import {
    StudioDevelopmentBar,
    StudioSavingBar,
} from '../../ee/features/aiCopilot/components/SemanticStudioAgent/StudioDevelopmentBar';
import { StudioFirstRequest } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/StudioFirstRequest';
import {
    useStudioAgent,
    useStudioThreadSwitch,
} from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useSemanticStudioChat';
import { useStartStudioThread } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useStartStudioThread';
import {
    useStudioPendingChange,
    useStudioProposal,
    useStudioPullRequest,
} from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useStudioPullRequest';
import { useSyncStudioWorkspace } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useSyncStudioWorkspace';
import { useAiOrganizationSettings } from '../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import { useProject } from '../../hooks/useProject';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { LiveSourceManager } from '../externalConnections/liveSources/LiveSourceManager';
import { ExternalSourceManager } from '../externalSources/components/ExternalSourceManager';
import { useDevelopmentView } from './developmentView';
import {
    DraftMarksContext,
    MarkPublishedContext,
    type DraftMarks,
} from './draftMarks';
import { BuildFirstModel, EmptyProject } from './EmptyProject';
import {
    ancestorKeys,
    containerOf,
    getSource,
    nodeKey,
    type NodeRef,
    type TreeNode,
} from './model';
import {
    countChangedLines,
    DRAFT_PARAM,
    DRAFT_REVIEW,
    FIELD_PARAM,
    getChangeKind,
    listFieldChanges,
    readStudioView,
    VIEW_PARAM,
    type StudioParams,
    type StudioView,
} from './modelCode';
import { ModelCodeView } from './ModelTabs';
import { DraftReview } from './SemanticLayerDraft';
import { useChatOpen, useStoredStudioThread } from './studioChange';
import {
    AddToStudioChatContext,
    sameStudioChatRef,
    type StudioChatRef,
} from './studioChatRefs';
import { stageOfWorkspace, type StudioStage } from './studioStage';
import { StudioStageLine } from './StudioStageLine';
import { StudioWorkspacesList } from './StudioWorkspacesList';
import {
    draftNameOfPullRequest,
    getNewAgentUrl,
    getSemanticStudioUrl,
    getSemanticStudioWorkspaceUrl,
    parseSemanticStudioWorkspaceUuid,
    pullRequestNumberOf,
} from './urls';
import { useDbtChangeSelection } from './useDbtChangeSelection';
import { useGoingLive } from './useGoingLive';
import { usePreAggregatesByModel } from './usePreAggregatesByModel';
import {
    useCanEditSemanticLayer,
    useKeepsSemanticLayerDraft,
    useSemanticLayerStatus,
    useDraftFreshness,
    useSemanticLayerDraft,
    useSemanticLayerStoredModels,
} from './useSemanticLayerModel';
import {
    useSemanticStudio,
    type SemanticStudioProps,
} from './useSemanticStudio';
import { useCheckOut, useStudioCheckout } from './useStudioCheckout';
import { modelNameOfSourcePath, SOURCE_PARAM } from './useStudioSources';
import {
    findThreadWorkspace,
    useStudioWorkspaceAction,
    useStudioWorkspaces,
} from './useStudioWorkspaces';
import { MainPane } from './WorkbenchMainPane';
import { CodeRail, Rail } from './WorkbenchRail';
import classes from './WorkbenchView.module.css';
import { DBT_WORKFLOW, DRAFT_WORKFLOW, type Pane } from './workbenchWorkflows';

dayjs.extend(relativeTime);

// The file tree and editor load only when Sources is opened.
const SourcePane = lazy(() =>
    import('./SourcesView').then((module) => ({ default: module.SourcePane })),
);
const SourcesRail = lazy(() =>
    import('./SourcesView').then((module) => ({ default: module.SourcesRail })),
);

/** Why the models cannot be changed here, for someone who would otherwise expect to. */
const BlockedNotice: FC<{ blocker: SemanticLayerBlocker }> = ({ blocker }) => {
    const text = ((): ReactNode => {
        switch (blocker) {
            // Someone without the right to deploy has nothing to be told.
            case 'no_access':
                return null;
            case 'unsupported_connection':
                return "Read-only. This dbt connection can't be written to.";
            case 'no_repository_access':
                return 'Read-only. You need write access to the repository.';
            case 'github_app_missing':
                return (
                    <>
                        Read-only until the GitHub App is installed.{' '}
                        <Anchor
                            component={Link}
                            to="/generalSettings/integrations"
                            inherit
                        >
                            Install it
                        </Anchor>
                    </>
                );
            case 'models_from_outside':
                return 'Read-only. These models were deployed from outside this app.';
            case 'preview_project':
                return 'Read-only. This is a preview of a pull request.';
            default:
                return assertUnreachable(blocker, 'Unknown blocker');
        }
    })();
    return text ? (
        <Group className={classes.toolbar} px="sm" role="note">
            <Text fz="xs" c="dimmed">
                {text}
            </Text>
        </Group>
    ) : null;
};

const FILE_PARAM = 'file';
const EDIT_PARAM = 'edit';

const BUILD_MODEL_PROMPT =
    'Look through my warehouse and suggest the first model and metrics to add.';

export const WorkbenchView: FC<SemanticStudioProps> = (props) => {
    const view = useSemanticStudio(props);
    const preAggregatesByModel = usePreAggregatesByModel(view.project.id);
    const [expanded, setExpanded] = useState<Set<string>>(() =>
        view.selected
            ? new Set(
                  ancestorKeys(
                      view.tree.nodes,
                      nodeKey(containerOf(view.selected)),
                  ),
              )
            : new Set(),
    );

    // Back, forward and links can land anywhere: open the tree down to it.
    const selectedContainerKey = view.selected
        ? nodeKey(containerOf(view.selected))
        : null;
    useEffect(() => {
        if (!selectedContainerKey) return;
        const ancestors = ancestorKeys(view.tree.nodes, selectedContainerKey);
        setExpanded((current) =>
            ancestors.every((key) => current.has(key))
                ? current
                : new Set([...current, ...ancestors]),
        );
    }, [selectedContainerKey, view.tree.nodes]);

    const toggle = (key: string) =>
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    const open = (ref: NodeRef) => {
        const key = nodeKey(containerOf(ref));
        setExpanded((current) => {
            const next = new Set(current);
            for (const ancestor of ancestorKeys(view.tree.nodes, key)) {
                next.add(ancestor);
            }
            return next;
        });
        view.select(ref);
    };

    const openNode = (node: TreeNode) => {
        open(node.ref);
        if (node.children.length > 0) {
            setExpanded((current) => new Set(current).add(node.key));
        }
    };

    const isEmpty = view.project.explores.length === 0;
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { pathname, key: visit } = useLocation();
    const routeWorkspaceUuid = parseSemanticStudioWorkspaceUuid(pathname);
    // Any other view leaves the change's page, so its id drops from the path.
    const setStudioParams = (params: StudioParams) => {
        if (!routeWorkspaceUuid) return setSearchParams(params);
        void navigate({
            pathname: getSemanticStudioUrl(view.project.id, { ref: null }),
            search: createSearchParams(params).toString(),
        });
    };
    const studioView = readStudioView(searchParams);
    const { data: draft } = useSemanticLayerDraft(view.project.id);
    useDraftFreshness(view.project.id);
    const { data: project } = useProject(view.project.id);
    const keepsDraft = useKeepsSemanticLayerDraft(view.project.id);
    const workflow = keepsDraft ? DRAFT_WORKFLOW : DBT_WORKFLOW;
    const canEditModels = useCanEditSemanticLayer(view.project.id);
    const status = useSemanticLayerStatus(view.project.id);
    const { shown: checkout, isSwitching } = useStudioCheckout();
    // A dbt project's checkout carries no draft.
    const checkedOutDraft = checkout?.draft ?? null;

    const {
        agent: studioAgent,
        thread: studioThread,
        isEnabled: hasChat,
        isLoadingAgents,
        hasAgents,
    } = useStudioAgent(view.project.id);
    const isCopilotEnabled =
        useAiOrganizationSettings().data?.isCopilotEnabled === true;
    const [isChatOpen, setIsChatOpen] = useChatOpen(view.project.id);
    const [askedPrompt, setAskedPrompt] = useState<string | null>(null);
    const agentAvailable = hasChat && !!studioAgent;
    const hasDraft = (draft?.changes.length ?? 0) > 0;
    const { data: workspaces } = useStudioWorkspaces(view.project.id);
    // Kept only while Studio is open: the marks are a receipt for a publish, not a record of it.
    const [published, setPublished] = useState<DraftMarks['published']>(
        () => new Map(),
    );
    const markPublished = useCallback(
        (next: DraftMarks['published']) =>
            setPublished((current) => new Map([...current, ...next])),
        [],
    );
    const draftMarks = useMemo<DraftMarks>(
        () => ({
            labels: new Map(
                (checkedOutDraft?.models ?? []).flatMap(
                    ({ model, explore }): [string, string][] =>
                        explore?.label ? [[model, explore.label]] : [],
                ),
            ),
            kinds: new Map(
                (checkedOutDraft?.models ?? []).map((entry) => [
                    entry.model,
                    getChangeKind(entry),
                ]),
            ),
            others: new Map(
                (draft?.othersDrafting ?? []).map(
                    ({ model, drafters }): [string, string[]] => [
                        model,
                        drafters.map(({ name }) => name),
                    ],
                ),
            ),
            inReview: new Map(
                (draft?.inReview ?? []).map((entry) => [
                    entry.model,
                    {
                        pullRequestUrl: entry.pullRequestUrl,
                        fields: listFieldChanges(
                            entry.model,
                            entry.changes,
                            entry,
                        ),
                    },
                ]),
            ),
            published,
        }),
        [checkedOutDraft, draft, published],
    );
    // With nothing live, what the draft adds is the page.
    const isBuildingFirstModel = isEmpty && hasDraft;
    // With changes to check and nothing else asked for, the changes are the page.
    const isDefaultView =
        view.selected === null && searchParams.get(VIEW_PARAM) === null;
    const openExplore =
        view.selected?.type === 'explore' || view.selected?.type === 'field'
            ? view.selected.exploreId
            : null;

    const modelled = useMemo(
        () =>
            view.project.explores
                .filter(
                    ({ sourceId }) =>
                        getSource(view.project, sourceId).kind === 'modelled',
                )
                .map(({ id }) => id),
        [view.project],
    );
    const lineCounts = useMemo(
        () =>
            new Map(
                (checkedOutDraft?.models ?? []).map((entry) => [
                    entry.model,
                    countChangedLines(entry),
                ]),
            ),
        [checkedOutDraft],
    );
    const [storedThread, setStoredThread] = useStoredStudioThread(
        view.project.id,
    );
    const allWorkspaces = useMemo(
        () => [
            ...(workspaces?.mine ?? []),
            ...(workspaces?.recent ?? []),
            ...(workspaces?.others ?? []),
        ],
        [workspaces],
    );
    const routeWorkspace =
        allWorkspaces.find(
            ({ workspaceUuid }) => workspaceUuid === routeWorkspaceUuid,
        ) ?? null;
    const isRouteCheckedOut =
        !!routeWorkspace &&
        routeWorkspace.workspaceUuid === checkout?.workspace?.workspaceUuid;
    // A draft there when the page opens is the page; one that lands later never swaps it.
    const opened = useRef<{ visit: string; hadDraft: boolean | null }>({
        visit,
        hadDraft: null,
    });
    if (opened.current.visit !== visit) {
        opened.current = { visit, hadDraft: null };
    }
    if (opened.current.hadDraft === null && draft) {
        opened.current.hadDraft = hasDraft;
    }
    const isReviewingDraft =
        isBuildingFirstModel ||
        (hasDraft &&
            (searchParams.get(DRAFT_PARAM) === DRAFT_REVIEW ||
                (isDefaultView &&
                    (isRouteCheckedOut || opened.current.hadDraft === true))));
    // A linked change is read from its own record, yours or someone else's; otherwise the one your chat is on.
    const pullRequest = useStudioPullRequest(view.project.id, routeWorkspace);
    const pendingChange = useStudioPendingChange(view.project.id);
    const { diffs: proposal, isSaving: isSavingProposal } = useStudioProposal(
        view.project.id,
    );
    const hasWarehouse = !!project?.warehouseConnection;
    const {
        hasCodeView,
        isCode,
        readsStoredModels,
        readsSources,
        canBuildModels,
        chatFollowsWorkspace,
        isLookingAtChange,
        hasDraftChanges,
        development,
        changeOnPage,
        saving,
        hasClosedPullRequest,
        hasProposal,
        isMerged,
        changesParams,
        codeTab,
        canCheckOut,
    } = workflow.facts({
        hasChat,
        view: studioView,
        isGithubProject: project?.dbtConnection.type === DbtProjectType.GITHUB,
        canAskForModels: agentAvailable && hasWarehouse,
        hasCheckout: checkout !== null,
        routeWorkspace,
        isRouteCheckedOut,
        isOnChangePage: !!routeWorkspaceUuid,
        pullRequest,
        pendingChange,
        proposal,
        hasDraft,
        isBuildingFirstModel,
        isReviewingDraft,
    });
    const { startNewThread } = useStudioThreadSwitch(view.project.id, {
        chatFollowsWorkspace,
    });
    const [isTryingChanges, setIsTryingChanges] = useDevelopmentView();
    useEffect(() => {
        if (hasClosedPullRequest && isTryingChanges) setIsTryingChanges(false);
    }, [hasClosedPullRequest, isTryingChanges, setIsTryingChanges]);
    // Nothing outside Studio says the app reads your changes, so leaving it switches that off.
    const switchOff = useRef<(() => void) | null>(null);
    switchOff.current = isTryingChanges
        ? () => setIsTryingChanges(false)
        : null;
    useEffect(() => () => switchOff.current?.(), []);
    // Home shows the changes when it opens with some; a change that lands later never swaps the page under you.
    const home = useRef({ visit, showsChanges: false, sawSave: false });
    if (home.current.visit !== visit) {
        home.current = { visit, showsChanges: false, sawSave: false };
    }
    if (saving) home.current.sawSave = true;
    if (changeOnPage && !home.current.sawSave) home.current.showsChanges = true;
    const homeShowsChanges = isDefaultView && home.current.showsChanges;
    const isChanges =
        (!!changeOnPage || hasProposal) &&
        (studioView === 'changes' || homeShowsChanges);
    const hasChanges = hasDraftChanges || !!development || hasProposal;
    const workspaceAction = useStudioWorkspaceAction(view.project.id);
    const activeWorkspace = useSyncStudioWorkspace(
        view.project.id,
        hasChanges || !!saving,
        chatFollowsWorkspace,
    );
    const threadWorkspace = findThreadWorkspace(
        allWorkspaces,
        storedThread?.threadUuid ?? null,
    );
    const chatWorkspace = workflow.chatWorkspace({
        active: activeWorkspace,
        thread: threadWorkspace,
    });
    // The workspace this page is about: the one in the link, else the one the open chat belongs to.
    const shownWorkspace = routeWorkspace ?? activeWorkspace ?? chatWorkspace;
    const hasWorkspaces = allWorkspaces.length > 0;
    const openWorkspace = useCallback(
        (
            target: (typeof allWorkspaces)[number],
            { navigateTo }: { navigateTo: boolean },
        ) => {
            // Someone else's change is only looked at: your chat and active change stay as they are.
            if (
                chatFollowsWorkspace &&
                target.isMine &&
                target.threadUuid &&
                target.agentUuid
            ) {
                setStoredThread({
                    threadUuid: target.threadUuid,
                    agentUuid: target.agentUuid,
                });
            }
            // Where changes are drafts here, only the picker or a check out action changes the checkout.
            if (
                chatFollowsWorkspace &&
                target.isMine &&
                !target.isActive &&
                !target.finishedAt
            ) {
                workspaceAction.mutate({
                    kind: 'activate',
                    workspaceUuid: target.workspaceUuid,
                });
            }
            if (navigateTo) {
                void navigate(
                    getSemanticStudioWorkspaceUrl(
                        view.project.id,
                        target.workspaceUuid,
                    ),
                );
            }
        },
        [
            chatFollowsWorkspace,
            navigate,
            setStoredThread,
            view.project.id,
            workspaceAction,
        ],
    );
    // A link to one of your workspaces opens it, here and in the chat.
    const openedFromRoute = useRef<string | null>(null);
    useEffect(() => {
        if (!routeWorkspace || openedFromRoute.current === routeWorkspaceUuid)
            return;
        openedFromRoute.current = routeWorkspaceUuid;
        openWorkspace(routeWorkspace, { navigateTo: false });
    }, [routeWorkspace, routeWorkspaceUuid, openWorkspace]);
    const goingLive = useGoingLive(view.project.id, pullRequest?.prUrl ?? null);
    const stage = ((): StudioStage | null => {
        if (saving) return { step: 'saving' };
        if (development) {
            return {
                step: 'in_review',
                pullRequestNumber: pullRequestNumberOf(development.prUrl),
            };
        }
        if (isMerged) return { step: 'live', update: goingLive };
        // A draft sent as a pull request is in review, though it can still be added to.
        if (
            hasProposal ||
            (hasDraftChanges &&
                !isLookingAtChange &&
                !isPullRequestOpen(shownWorkspace?.pullRequest ?? null))
        ) {
            return { step: 'proposed' };
        }
        if (hasClosedPullRequest) {
            return {
                step: 'closed',
                pullRequestNumber: pullRequestNumberOf(pullRequest?.prUrl),
            };
        }
        return stageOfWorkspace(shownWorkspace);
    })();
    // Changes asked for by view get the open chat's change address once it is known, so a reload or a link lands on it.
    const changeToAddress =
        studioView === 'changes' && !routeWorkspaceUuid
            ? (chatWorkspace?.workspaceUuid ?? null)
            : null;
    useEffect(() => {
        if (!changeToAddress) return;
        void navigate(
            getSemanticStudioWorkspaceUrl(view.project.id, changeToAddress),
            { replace: true },
        );
    }, [changeToAddress, navigate, view.project.id]);
    // The workspace the conversation made, named for where its changes stand.
    const workspace = saving
        ? { name: 'New draft', hint: 'The draft is being saved.' }
        : development
          ? {
                name: draftNameOfPullRequest(development.prUrl) ?? 'Draft',
                hint: 'Published stays as it is until you publish this draft.',
            }
          : hasProposal
            ? {
                  name: 'Proposed change',
                  hint: 'Not saved. Saving needs write access to the repository.',
              }
            : hasDraftChanges
              ? {
                    name: 'Draft',
                    hint: 'Only you see these changes until you publish them.',
                }
              : null;
    // Only models with YAML here have a file: a deployed model's YAML lives where it was deployed from.
    const {
        data: stored,
        error: storedError,
        refetch: retryStored,
        isRefetching: isRetryingStored,
    } = useSemanticLayerStoredModels(view.project.id, readsStoredModels);
    const files = useMemo(() => {
        const removed = new Set(
            checkedOutDraft?.models
                .filter(({ contentAfter }) => contentAfter === null)
                .map(({ model }) => model),
        );
        const drafted = (checkedOutDraft?.models ?? []).map(
            ({ model }) => model,
        );
        return [...new Set([...drafted, ...(stored?.models ?? [])])]
            .filter((name) => !removed.has(name))
            .sort();
    }, [checkedOutDraft, stored]);
    const requestedFile = searchParams.get(FILE_PARAM);
    const file =
        files.find((name) => name === requestedFile) ??
        files.find((name) => name === openExplore) ??
        files.at(0) ??
        null;
    const sourceFile = searchParams.get(SOURCE_PARAM);
    // Coming back to Sources reopens the file left open there.
    const lastSourceFile = useRef(sourceFile);
    const switchView = (next: StudioView) => {
        if (next === 'code') {
            setStudioParams({ [VIEW_PARAM]: 'code' });
        } else if (next === 'changes') {
            setSearchParams(changesParams);
        } else if (next === 'sources') {
            setStudioParams({
                [VIEW_PARAM]: 'sources',
                ...(lastSourceFile.current
                    ? { [SOURCE_PARAM]: lastSourceFile.current }
                    : {}),
            });
        } else if (requestedFile && modelled.includes(requestedFile)) {
            view.select({ type: 'explore', exploreId: requestedFile });
        } else {
            // Named, since with changes to check the bare page shows those.
            setStudioParams(hasChanges ? { [VIEW_PARAM]: 'models' } : {});
        }
    };

    const changeName = shownWorkspace?.name ?? workspace?.name;
    const startStudioThread = useStartStudioThread(view.project.id);
    const dbt = useDbtChangeSelection({
        projectUuid: view.project.id,
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
        studioAgentUuid: studioAgent?.uuid ?? null,
        startThread: startStudioThread,
        startNewThread,
        setIsTryingChanges,
        setIsChatOpen,
        openWorkspace,
        setStudioParams,
        switchView,
        sourceFile,
    });
    const isSources =
        dbt.opensInSources || (readsSources && studioView === 'sources');
    if (isSources && sourceFile) lastSourceFile.current = sourceFile;

    const canBuildFirstModel = isEmpty && canBuildModels;
    const canNudge = canBuildModels && modelled.length === 0;
    const pane = ((): Pane => {
        if (studioView === 'workspaces') return 'workspaces';
        if (isCode) return 'code';
        if (isLookingAtChange) return 'changeSummary';
        if (isSources) return 'sources';
        if (isChanges) return 'changes';
        if (isReviewingDraft) return 'review';
        if (!isEmpty) return 'browse';
        if (!canBuildFirstModel) return 'empty';
        return 'buildFirst';
    })();
    // An empty project asks its first question in the page, and the chat opens once it is asked.
    const waitsForFirstAsk =
        pane === 'buildFirst' && !studioThread && askedPrompt === null;
    const showsChat = isChatOpen && !waitsForFirstAsk;
    const { track } = useTracking();
    // A ref, so a new track identity (such as when analytics loads) does not count a view twice.
    const trackRef = useRef(track);
    trackRef.current = track;
    const projectId = view.project.id;
    // Until the draft and checkout first load, the pane is a placeholder, not a view.
    const hasLoaded = useRef(false);
    if (!isSwitching && draft !== undefined) hasLoaded.current = true;
    const isPaneSettled = hasLoaded.current;
    useEffect(() => {
        if (!isPaneSettled) return;
        trackRef.current({
            name: EventName.SEMANTIC_STUDIO_PANE_VIEWED,
            properties: { projectId, pane },
        });
    }, [projectId, pane, isPaneSettled]);
    useEffect(() => {
        if (openExplore === null) return;
        trackRef.current({
            name: EventName.SEMANTIC_STUDIO_ITEM_OPENED,
            properties: { projectId, kind: 'model' },
        });
    }, [projectId, openExplore]);
    useEffect(() => {
        if (requestedFile === null) return;
        trackRef.current({
            name: EventName.SEMANTIC_STUDIO_ITEM_OPENED,
            properties: { projectId, kind: 'file' },
        });
    }, [projectId, requestedFile]);
    // Reviewing changes takes the full width: the tree is for browsing models.
    const isReviewPane =
        pane === 'changes' || pane === 'workspaces' || pane === 'changeSummary';
    // A draft's overview sits in Code, above the files it changes.
    const isCodeTab =
        pane === 'sources' || pane === 'code' || pane === 'review';
    const showsCodeRail =
        (pane === 'code' || pane === 'review') &&
        (files.length > 0 || hasDraft);
    const isChangeOpen =
        (pane === 'changes' || pane === 'review') &&
        !!(shownWorkspace || workspace);
    const hasChangesTab = hasWorkspaces || hasChanges || !!saving;
    const showChanges = () =>
        hasWorkspaces
            ? setStudioParams({ [VIEW_PARAM]: 'workspaces' })
            : switchView('changes');
    // What the chat is told the person has open: in the code view that is the file, not the page behind it.
    const openModel = isCode
        ? { modelName: file, fieldName: searchParams.get(FIELD_PARAM) }
        : isSources
          ? {
                modelName:
                    sourceFile === null
                        ? null
                        : modelNameOfSourcePath(sourceFile),
                fieldName: null,
            }
          : {
                modelName: openExplore,
                fieldName:
                    view.selected?.type === 'field'
                        ? view.selected.fieldId
                        : null,
            };
    const [attached, setAttached] = useState<StudioChatRef[]>([]);
    const attachToChat = (ref: StudioChatRef) => {
        setAttached((current) =>
            current.some((item) => sameStudioChatRef(item, ref))
                ? current
                : [...current, ref],
        );
        setIsChatOpen(true);
    };
    const askAgent = (prompt: string) => {
        setIsChatOpen(true);
        setAskedPrompt(prompt);
    };

    // Why a model's code on a project that keeps a draft is read and not edited, or null when it can be.
    const codeReadOnlyReason = !canEditModels
        ? "You don't have permission to change this project's models."
        : routeWorkspace && !routeWorkspace.isMine
          ? `Only ${routeWorkspace.owner.name} can edit this draft.`
          : null;
    // Your chat's proposal belongs to its own change, not to whichever one is open.
    const shownProposal =
        hasProposal &&
        // While the agent saves the code is read only, and what it is saving is still shown.
        dbt.sourcesOwnerReason === null &&
        (!shownWorkspace ||
            shownWorkspace.threadUuid === storedThread?.threadUuid)
            ? proposal
            : [];
    const { checkOut, isBusy: isCheckingOut } = useCheckOut(view.project.id);
    const changeActions = (
        <Group gap="xs" wrap="nowrap" miw={0} ml="auto">
            {saving ? (
                <StudioSavingBar
                    projectUuid={view.project.id}
                    change={saving}
                    pullRequest={development}
                />
            ) : development ? (
                <StudioDevelopmentBar
                    projectUuid={view.project.id}
                    pullRequest={development}
                />
            ) : null}
        </Group>
    );
    const changeUrl =
        development?.prUrl ??
        pullRequest?.prUrl ??
        shownWorkspace?.pullRequest?.url ??
        null;
    // Once everyone has it, the first model it changed is where to see it.
    const liveModel =
        stage?.step === 'live' && stage.update === 'done'
            ? (pullRequest?.changedModels[0] ?? null)
            : null;
    const goBack = hasWorkspaces ? showChanges : dbt.showLive;
    // Explore named after the model, so a renamed explore misses
    const changeLinks = liveModel ? (
        <Anchor
            component={Link}
            to={`/projects/${view.project.id}/tables/${encodeURIComponent(liveModel)}`}
            className={classes.changeLink}
        >
            Open {liveModel} in Explore
            <MantineIcon icon={IconArrowUpRight} size={12} />
        </Anchor>
    ) : null;
    // The open change heads its own column, so its name, progress and diff share one edge.
    const changeHeader = (
        <header className={classes.changeHeader}>
            <UnstyledButton className={classes.back} onClick={goBack}>
                <MantineIcon icon={IconArrowLeft} size={14} />
                {hasWorkspaces ? 'All drafts' : 'Back to Published'}
            </UnstyledButton>
            <div className={classes.changeTitleRow}>
                <Tooltip
                    label={workspace?.hint ?? 'What this draft does'}
                    disabled={!workspace?.hint}
                >
                    <Title
                        order={1}
                        lineClamp={2}
                        className={classes.changeTitle}
                    >
                        {changeName}
                    </Title>
                </Tooltip>
                {isLookingAtChange ? null : changeActions}
            </div>
            <div className={classes.changeMeta}>
                {shownWorkspace ? (
                    <Tooltip
                        label={`Started by ${shownWorkspace.isMine ? 'you' : shownWorkspace.owner.name}`}
                    >
                        <Avatar
                            size={20}
                            radius="xl"
                            color="initials"
                            name={shownWorkspace.owner.name}
                            aria-label={`Started by ${shownWorkspace.owner.name}`}
                        />
                    </Tooltip>
                ) : null}
                {stage ? (
                    <StudioStageLine stage={stage} href={changeUrl} />
                ) : null}
                {shownWorkspace ? (
                    <Text component="span" fz="xs" c="dimmed">
                        Updated {dayjs(shownWorkspace.updatedAt).fromNow()}
                    </Text>
                ) : null}
                {changeLinks}
            </div>
        </header>
    );

    const renderPane = () => {
        switch (pane) {
            case 'changes':
                return (
                    <StudioChanges
                        header={isChangeOpen ? changeHeader : null}
                        projectUuid={view.project.id}
                        pullRequest={changeOnPage}
                        proposal={shownProposal}
                        isSaving={isSavingProposal}
                    />
                );
            case 'workspaces':
                return (
                    <StudioWorkspacesList
                        projectUuid={view.project.id}
                        saving={saving}
                        onOpen={(target) =>
                            openWorkspace(target, { navigateTo: true })
                        }
                        onCheckOut={canCheckOut ? checkOut : null}
                        isCheckingOut={isCheckingOut}
                    />
                );
            case 'changeSummary':
                return routeWorkspace ? (
                    <StudioChanges
                        header={
                            <>
                                {changeHeader}
                                {routeWorkspace.isMine &&
                                isOpenWorkspace(routeWorkspace) ? (
                                    <Paper p="md">
                                        <Group
                                            justify="space-between"
                                            wrap="nowrap"
                                            gap="sm"
                                        >
                                            <Text fz="sm">
                                                Check out this draft to see it
                                                in Models and Code, then review
                                                and publish it.
                                            </Text>
                                            <Button
                                                size="xs"
                                                flex="none"
                                                loading={isCheckingOut}
                                                onClick={() =>
                                                    checkOut(routeWorkspace)
                                                }
                                            >
                                                Check out
                                            </Button>
                                        </Group>
                                    </Paper>
                                ) : !routeWorkspace.isMine &&
                                  isOpenWorkspace(routeWorkspace) ? (
                                    <Text fz="sm" c="dimmed">
                                        Only {routeWorkspace.owner.name} sees
                                        these edits until they publish them.
                                    </Text>
                                ) : null}
                            </>
                        }
                        projectUuid={view.project.id}
                        pullRequest={null}
                        proposal={[]}
                        isSaving={false}
                    />
                ) : null;
            case 'code':
                return file ? (
                    <ModelCodeView
                        key={file}
                        projectUuid={view.project.id}
                        modelName={file}
                        fieldName={searchParams.get(FIELD_PARAM)}
                        readOnlyReason={codeReadOnlyReason}
                        startsEditing={searchParams.get(EDIT_PARAM) === 'true'}
                    />
                ) : storedError ? (
                    <EmptyState
                        title="The model code could not be read"
                        description={storedError.error.message}
                        maw={460}
                        titleProps={{ order: 5 }}
                        descriptionProps={{ fz: 'sm' }}
                    >
                        <Button
                            size="xs"
                            variant="subtle"
                            color="gray"
                            loading={isRetryingStored}
                            onClick={() => void retryStored()}
                        >
                            Try again
                        </Button>
                    </EmptyState>
                ) : !stored ? null : (
                    <EmptyState
                        title="No model code here yet"
                        description={
                            modelled.length > 0
                                ? 'These models were deployed from outside this app, so there is no YAML to show.'
                                : 'Ask the agent to build a model and its YAML shows up here.'
                        }
                        maw={460}
                        titleProps={{ order: 5 }}
                        descriptionProps={{ fz: 'sm' }}
                    />
                );
            case 'sources':
                if (
                    !sourceFile &&
                    !dbt.sourcesPrUrl &&
                    shownProposal.length === 0
                ) {
                    // No file is open and there is no pull request or change being saved to show: say where things stand.
                    const empty = saving
                        ? {
                              icon: <Loader size="sm" color="gray" />,
                              title: 'Saving your change',
                              description:
                                  'Its files show here when the save finishes.',
                          }
                        : !dbt.isOnLive && (workspace || dbt.isStartingChange)
                          ? {
                                icon: null,
                                title: 'Nothing in this draft yet',
                                description: studioAgent
                                    ? 'Ask for a change in the chat, or open a file from the list and edit it.'
                                    : 'Open a file from the list and edit it.',
                            }
                          : {
                                icon: null,
                                title: 'Pick a file',
                                description:
                                    'Open one from the list to read it. Editing a file starts a draft.',
                            };
                    return (
                        <EmptyState
                            {...empty}
                            maw={460}
                            titleProps={{ order: 5 }}
                            descriptionProps={{ fz: 'sm' }}
                        />
                    );
                }
                return !sourceFile ? (
                    <StudioChanges
                        header={null}
                        projectUuid={view.project.id}
                        pullRequest={changeOnPage}
                        proposal={shownProposal}
                        isSaving={isSavingProposal}
                    />
                ) : (
                    <Suspense fallback={null}>
                        <SourcePane
                            target={dbt.sourcesTarget}
                            // Once the commit lands the file is read from the change, so its diffs are not applied again.
                            proposal={
                                isSavingProposal && !saving ? [] : shownProposal
                            }
                            isSaving={isSavingProposal}
                            onSaved={dbt.onSourcesSaved}
                            onAddToChat={attachToChat}
                        />
                    </Suspense>
                );
            case 'review':
                return draft ? (
                    <DraftReview
                        projectUuid={view.project.id}
                        draft={draft}
                        onAskAgent={askAgent}
                        onOpenFile={(model) =>
                            setSearchParams({
                                [VIEW_PARAM]: 'code',
                                [FILE_PARAM]: model,
                                [EDIT_PARAM]: 'true',
                            })
                        }
                    />
                ) : null;
            case 'browse':
                return (
                    <MainPane
                        view={view}
                        onOpen={(ref) => (ref ? open(ref) : view.select(null))}
                        onOpenNode={openNode}
                        onBuildModel={
                            canNudge ? () => askAgent(BUILD_MODEL_PROMPT) : null
                        }
                    />
                );
            case 'buildFirst':
                return (
                    <BuildFirstModel
                        view={view}
                        onAsk={showsChat ? null : askAgent}
                        firstRequest={
                            showsChat ? null : (
                                <StudioFirstRequest
                                    projectUuid={view.project.id}
                                    onAsk={askAgent}
                                />
                            )
                        }
                    />
                );
            case 'empty':
                return <EmptyProject view={view} hasAgents={hasAgents} />;
            default:
                return assertUnreachable(pane, 'Unknown pane');
        }
    };

    return (
        <DraftMarksContext.Provider value={draftMarks}>
            <MarkPublishedContext.Provider value={markPublished}>
                <LiveSourceManager
                    projectUuid={view.project.id}
                    enabled={view.permissions.live}
                    onRemoved={() =>
                        view.select(
                            { type: 'kind', kind: 'live' },
                            { replace: true },
                        )
                    }
                >
                    <ExternalSourceManager
                        projectUuid={view.project.id}
                        enabled={view.permissions.files}
                        onRemoved={() =>
                            view.select(
                                { type: 'kind', kind: 'files' },
                                { replace: true },
                            )
                        }
                    >
                        <Box
                            className={classes.shell}
                            data-no-chat={
                                !hasChat ||
                                (!isLoadingAgents &&
                                    (!studioAgent || !showsChat))
                            }
                        >
                            {hasChat && !waitsForFirstAsk && (
                                <SemanticStudioAgent
                                    projectUuid={view.project.id}
                                    {...openModel}
                                    attached={attached}
                                    onAttach={attachToChat}
                                    onDetach={(ref) =>
                                        setAttached((current) =>
                                            current.filter(
                                                (item) =>
                                                    !sameStudioChatRef(
                                                        item,
                                                        ref,
                                                    ),
                                            ),
                                        )
                                    }
                                    onAttachedSent={() => setAttached([])}
                                    prompt={askedPrompt}
                                    onPromptTaken={() => setAskedPrompt(null)}
                                    showStarters={canBuildFirstModel}
                                    keepsDraft={keepsDraft}
                                />
                            )}
                            <Box className={classes.workspace}>
                                {!hasChat ? (
                                    status?.blocker ? (
                                        <BlockedNotice
                                            blocker={status.blocker}
                                        />
                                    ) : null
                                ) : (
                                    <>
                                        <Group
                                            className={classes.toolbar}
                                            justify="space-between"
                                            wrap="nowrap"
                                            gap="sm"
                                        >
                                            <div
                                                className={classes.views}
                                                role="tablist"
                                                aria-label="Views"
                                            >
                                                <UnstyledButton
                                                    role="tab"
                                                    className={classes.view}
                                                    aria-selected={
                                                        !isCodeTab &&
                                                        !isReviewPane
                                                    }
                                                    onClick={() =>
                                                        switchView('models')
                                                    }
                                                >
                                                    Models
                                                </UnstyledButton>
                                                {hasCodeView ? (
                                                    <UnstyledButton
                                                        role="tab"
                                                        className={classes.view}
                                                        aria-selected={
                                                            isCodeTab
                                                        }
                                                        onClick={() =>
                                                            switchView(codeTab)
                                                        }
                                                    >
                                                        Code
                                                    </UnstyledButton>
                                                ) : null}
                                            </div>
                                            <workflow.Toolbar
                                                projectUuid={view.project.id}
                                                pane={pane}
                                                stage={stage}
                                                changeUrl={changeUrl}
                                                canEditModels={canEditModels}
                                                development={development}
                                                saving={saving}
                                                shownWorkspace={shownWorkspace}
                                                myWorkspaces={
                                                    workspaces?.mine ?? []
                                                }
                                                changeName={changeName}
                                                changeLinks={changeLinks}
                                                changeActions={changeActions}
                                                onShowChanges={
                                                    hasChangesTab
                                                        ? showChanges
                                                        : null
                                                }
                                                startNewThread={startNewThread}
                                                dbt={dbt.toolbarFor(pane)}
                                            >
                                                {agentAvailable &&
                                                !isChatOpen &&
                                                !waitsForFirstAsk ? (
                                                    <Button
                                                        size="xs"
                                                        variant="subtle"
                                                        color="gray"
                                                        flex="none"
                                                        leftSection={
                                                            <MantineIcon
                                                                icon={
                                                                    IconMessage
                                                                }
                                                                size={14}
                                                            />
                                                        }
                                                        onClick={() =>
                                                            setIsChatOpen(true)
                                                        }
                                                    >
                                                        Chat
                                                    </Button>
                                                ) : null}
                                                {!studioAgent &&
                                                !isLoadingAgents &&
                                                isCopilotEnabled ? (
                                                    <Button
                                                        size="xs"
                                                        variant="subtle"
                                                        color="gray"
                                                        flex="none"
                                                        component={Link}
                                                        to={getNewAgentUrl(
                                                            view.project.id,
                                                        )}
                                                    >
                                                        Create an agent
                                                    </Button>
                                                ) : null}
                                            </workflow.Toolbar>
                                        </Group>
                                    </>
                                )}
                                <AddToStudioChatContext.Provider
                                    value={agentAvailable ? attachToChat : null}
                                >
                                    <Box
                                        className={classes.workspaceBody}
                                        data-sources={
                                            pane === 'sources' || undefined
                                        }
                                        data-no-rail={
                                            isReviewPane ||
                                            ((pane === 'code' ||
                                                pane === 'review') &&
                                                !showsCodeRail) ||
                                            (!isCodeTab && isEmpty)
                                        }
                                    >
                                        {(pane === 'code' ||
                                            pane === 'review') &&
                                        !showsCodeRail ? null : showsCodeRail ? (
                                            <CodeRail
                                                files={files}
                                                overview={
                                                    hasDraft
                                                        ? {
                                                              isOpen:
                                                                  pane ===
                                                                  'review',
                                                              onOpen: () =>
                                                                  switchView(
                                                                      'changes',
                                                                  ),
                                                          }
                                                        : null
                                                }
                                                selected={
                                                    pane === 'review'
                                                        ? null
                                                        : file
                                                }
                                                selectedPart={searchParams.get(
                                                    FIELD_PARAM,
                                                )}
                                                lineCounts={lineCounts}
                                                preAggregates={
                                                    preAggregatesByModel
                                                }
                                                onOpen={(next, part) =>
                                                    setSearchParams({
                                                        [VIEW_PARAM]: 'code',
                                                        [FILE_PARAM]: next,
                                                        ...(part
                                                            ? {
                                                                  [FIELD_PARAM]:
                                                                      part,
                                                              }
                                                            : {}),
                                                    })
                                                }
                                            />
                                        ) : pane === 'sources' ? (
                                            <Suspense fallback={null}>
                                                <SourcesRail
                                                    target={dbt.sourcesTarget}
                                                    proposal={shownProposal}
                                                    isSaving={isSavingProposal}
                                                    hasOverview={
                                                        !!dbt.sourcesPrUrl
                                                    }
                                                />
                                            </Suspense>
                                        ) : isEmpty || isReviewPane ? null : (
                                            <Rail
                                                view={view}
                                                expanded={expanded}
                                                onToggle={toggle}
                                                onOpen={open}
                                            />
                                        )}
                                        {pane === 'browse' ? (
                                            renderPane()
                                        ) : (
                                            <Box
                                                className={classes.main}
                                                data-full={
                                                    pane === 'code' ||
                                                    pane === 'review' ||
                                                    pane === 'sources' ||
                                                    pane === 'changes' ||
                                                    pane === 'changeSummary'
                                                }
                                            >
                                                {renderPane()}
                                            </Box>
                                        )}
                                    </Box>
                                </AddToStudioChatContext.Provider>
                            </Box>
                        </Box>
                    </ExternalSourceManager>
                </LiveSourceManager>
            </MarkPublishedContext.Provider>
        </DraftMarksContext.Provider>
    );
};
