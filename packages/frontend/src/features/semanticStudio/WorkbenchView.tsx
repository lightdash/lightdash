/**
 * Semantic Layer: the tree on the left and the page beside it, at the width
 * settings pages use. Every page lives there: a kind, a source, a folder or
 * an explore and its fields. Breadcrumbs lead back up; fields open in a
 * modal.
 */
import {
    assertUnreachable,
    type PreAggregateMaterializationSummary,
    type SemanticLayerBlocker,
} from '@lightdash/common';
import {
    Anchor,
    Avatar,
    Box,
    Breadcrumbs,
    Menu,
    Button,
    Center,
    Group,
    Loader,
    Paper,
    Text,
    TextInput,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconArrowUpRight,
    IconBolt,
    IconChevronRight,
    IconFileCode,
    IconMessage,
    IconRefresh,
    IconSearch,
} from '@tabler/icons-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
    createContext,
    Fragment,
    lazy,
    Suspense,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
    type KeyboardEvent,
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
import {
    useChatOpen,
    useStoredStudioThread,
    useStudioAgent,
} from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useSemanticStudioChat';
import {
    useStudioPendingChange,
    useStudioProposal,
    useStudioPullRequest,
} from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useStudioPullRequest';
import { useSyncStudioWorkspace } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useSyncStudioWorkspace';
import { useProject } from '../../hooks/useProject';
import { LiveSourceBetaBadge } from '../externalConnections/liveSources/LiveSourceBetaBadge';
import { useDevelopmentView } from './developmentView';
import { useExternalSourceActions } from './externalSources/externalSourceActions';
import { ExternalSourceManager } from './externalSources/ExternalSourceManager';
import {
    ExternalSourceHeaderActions,
    ExternalSourceSummary,
    ExternalSourcesTable,
} from './externalSources/ExternalSourcesView';
import { useManagedExternalSource } from './externalSources/useManagedExternalSource';
import { JoinDiagram } from './JoinDiagram';
import { useLiveSourceActions } from './liveSources/liveSourceActions';
import { LiveSourceManager } from './liveSources/LiveSourceManager';
import {
    LiveSourceHeaderActions,
    LiveSourceSummary,
    LiveSourcesTable,
} from './liveSources/LiveSourcesView';
import { useManagedLiveSource } from './liveSources/useManagedLiveSource';
import {
    ancestorKeys,
    containerOf,
    fieldGroups,
    findNode,
    pageNodes,
    flattenTree,
    getExplore,
    getSource,
    nodeKey,
    searchResultId,
    summaryOf,
    trailTo,
    type NodeRef,
    type TreeNode,
} from './model';
import {
    DRAFT_PARAM,
    DRAFT_REVIEW,
    FIELD_PARAM,
    getModelCodeSearch,
    VIEW_PARAM,
} from './modelCode';
import { ModelCodeView, ModelTabs } from './ModelTabs';
import { getPreAggregateStatus } from './preAggregateSummary';
import { DraftDevelopmentBar, DraftReview } from './SemanticLayerDraft';
import {
    AddSourceButton,
    BuildFirstModel,
    EmptyProject,
    FieldDetailModal,
    FieldList,
    FieldListToolbar,
    NodeIcon,
    SearchResultsList,
    SemanticLayerNudge,
    SettingsLink,
} from './shared';
import { type SourcesTarget } from './SourcesView';
import {
    AddToStudioChatContext,
    useAddToStudioChat,
    sameStudioChatRef,
    startStudioChatRefDrag,
    type StudioChatRef,
} from './studioChatRefs';
import { DraftPickerMenu, StudioCheckoutPicker } from './StudioCheckoutPicker';
import { StudioStageLine, type StudioStage } from './StudioStageLine';
import { StudioWorkspacesList } from './StudioWorkspacesList';
import {
    getSemanticStudioUrl,
    getSemanticStudioWorkspaceUrl,
    parseSemanticStudioWorkspaceUuid,
    pullRequestNumberOf,
} from './urls';
import { useExploreFields } from './useExploreFields';
import { useGoingLive } from './useGoingLive';
import { usePreAggregatesByModel } from './usePreAggregatesByModel';
import {
    describeBranchCompile,
    useCanEditSemanticLayer,
    useCompileCheckout,
    useDraftCheckout,
    useKeepsSemanticLayerDraft,
    useSemanticLayerStatus,
    useDraftFreshness,
    useSemanticLayerDraft,
    useSemanticLayerModel,
    useSemanticLayerStoredModels,
} from './useSemanticLayerModel';
import {
    useFieldListState,
    useProjectSearch,
    useSemanticStudio,
    type SemanticStudioProps,
    type ViewModel,
} from './useSemanticStudio';
import {
    findCheckedOutModel,
    isOpenWorkspace,
    useCheckOut,
    useStudioCheckout,
} from './useStudioCheckout';
import { SOURCE_PARAM } from './useStudioSources';
import {
    useStudioWorkspaceAction,
    useStudioWorkspaces,
} from './useStudioWorkspaces';
import classes from './WorkbenchView.module.css';

dayjs.extend(relativeTime);

// The file tree and editor load only when Sources is opened.
const SourcePane = lazy(() =>
    import('./SourcesView').then((module) => ({ default: module.SourcePane })),
);
const SourcesRail = lazy(() =>
    import('./SourcesView').then((module) => ({ default: module.SourcesRail })),
);

const ROW_HEIGHT = 28;

/** What the workspace shows beside the rail. */
type Pane =
    | 'code'
    | 'changeSummary'
    | 'sources'
    | 'changes'
    | 'workspaces'
    | 'review'
    | 'browse'
    | 'buildFirst'
    | 'empty';

type DraftMarks = {
    /** Each drafted model's name as the draft leaves it. */
    labels: Map<string, string>;
    /** Who else has unpublished changes to each model. */
    others: Map<string, string[]>;
};

// Read once for the page: every row asking the draft itself costs a subscription per row.
const DraftMarksContext = createContext<DraftMarks>({
    labels: new Map(),
    others: new Map(),
});

/** Says whose unpublished work a model has: this person's, someone else's, or both. */
const DraftMarker: FC<{ model: string; isMine: boolean }> = ({
    model,
    isMine,
}) => {
    const others = useContext(DraftMarksContext).others.get(model) ?? [];
    if (!isMine && others.length === 0) return null;
    const whose = [...(isMine ? ['you'] : []), ...others].join(', ');
    return (
        <Tooltip label={`Draft by ${whose}. Not published yet.`}>
            <Box
                className={classes.draftDot}
                data-others={!isMine || undefined}
            />
        </Tooltip>
    );
};

/** A model's name as this person's draft leaves it, so the list and the review say the same thing. */
const ModelLabel: FC<{ model: string; label: string }> = ({ model, label }) =>
    useContext(DraftMarksContext).labels.get(model) ?? label;

/** Why the models cannot be changed here, for someone who would otherwise expect to. */
const BlockedNotice: FC<{ blocker: SemanticLayerBlocker }> = ({ blocker }) => {
    const text = ((): ReactNode => {
        switch (blocker) {
            // Someone without the right to deploy has nothing to be told.
            case 'no_access':
                return null;
            case 'unsupported_connection':
                return "Models can't be changed here: this project's dbt connection is not one that can be written to.";
            case 'no_repository_access':
                return "You can browse models. Changing them needs write access to this project's repository.";
            case 'github_app_missing':
                return (
                    <>
                        Changing models here needs the GitHub App.{' '}
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
                return "These models were deployed from outside this app, so they can't be changed here yet.";
            case 'preview_project':
                return 'This is a preview of a pull request. Change models from the project it previews.';
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

const Tree: FC<{
    view: ViewModel;
    expanded: Set<string>;
    /** Models this person's draft touches. */
    drafted: Set<string>;
    onToggle: (key: string) => void;
    onSelect: (node: TreeNode) => void;
}> = ({ view, expanded, drafted, onToggle, onSelect }) => {
    const canDrag = useAddToStudioChat() !== null;
    const parentRef = useRef<HTMLDivElement>(null);
    const rows = useMemo(
        () => flattenTree(view.tree.nodes, expanded),
        [view.tree.nodes, expanded],
    );
    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 20,
    });
    const selectedTreeKey = view.selected
        ? nodeKey(containerOf(view.selected))
        : null;
    const selectedIndex = rows.findIndex(
        ({ node }) => node.key === selectedTreeKey,
    );
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const current = rows[selectedIndex];
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const next =
                rows[
                    Math.min(rows.length - 1, Math.max(0, selectedIndex + step))
                ];
            if (next) {
                // Arrowing through the tree shouldn't fill the back button.
                view.select(next.node.ref, { replace: true });
                virtualizer.scrollToIndex(rows.indexOf(next));
            }
        } else if (current && event.key === 'ArrowRight') {
            if (!expanded.has(current.node.key) && current.node.children.length)
                onToggle(current.node.key);
        } else if (current && event.key === 'ArrowLeft') {
            if (expanded.has(current.node.key)) onToggle(current.node.key);
        }
    };

    return (
        <Box
            ref={parentRef}
            className={classes.treeScroll}
            tabIndex={0}
            role="tree"
            aria-label="Semantic Layer"
            onKeyDown={onKeyDown}
        >
            <Box className={classes.treeInner} h={virtualizer.getTotalSize()}>
                {virtualizer.getVirtualItems().map((item) => {
                    const { node, depth } = rows[item.index];
                    const isContainer = node.children.length > 0;
                    const isOpen = expanded.has(node.key);
                    return (
                        <Box
                            key={node.key}
                            role="treeitem"
                            aria-level={depth + 1}
                            aria-expanded={isContainer ? isOpen : undefined}
                            aria-selected={node.key === selectedTreeKey}
                            className={classes.treeRow}
                            data-selected={node.key === selectedTreeKey}
                            top={item.start}
                            pl={depth * 14 + 4}
                            draggable={canDrag && node.ref.type === 'explore'}
                            onDragStart={(event) => {
                                if (node.ref.type !== 'explore') return;
                                startStudioChatRefDrag(event.dataTransfer, {
                                    modelName: node.ref.exploreId,
                                    fieldName: null,
                                    modelLabel: node.label,
                                    fieldLabel: null,
                                    code: null,
                                });
                            }}
                            onClick={() => {
                                onSelect(node);
                                if (isContainer) onToggle(node.key);
                            }}
                        >
                            <Box className={classes.chevron} data-open={isOpen}>
                                {isContainer ? (
                                    <MantineIcon
                                        icon={IconChevronRight}
                                        size={12}
                                    />
                                ) : null}
                            </Box>
                            <Box flex="none" display="flex">
                                <NodeIcon
                                    project={view.project}
                                    nodeRef={node.ref}
                                    size={14}
                                />
                            </Box>
                            <Text truncate className={classes.treeLabel}>
                                {node.ref.type === 'explore' ? (
                                    <ModelLabel
                                        model={node.ref.exploreId}
                                        label={node.label}
                                    />
                                ) : (
                                    node.label
                                )}
                            </Text>
                            {node.ref.type === 'explore' ? (
                                <DraftMarker
                                    model={node.ref.exploreId}
                                    isMine={drafted.has(node.ref.exploreId)}
                                />
                            ) : null}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
};

const CHILD_ROW_HEIGHT = 40;

/** Every child of the selection, virtualised: a folder can hold thousands. */
const ChildrenList: FC<{
    view: ViewModel;
    nodes: TreeNode[];
    onOpen: (node: TreeNode) => void;
}> = ({ view, nodes, onOpen }) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const virtualizer = useVirtualizer({
        count: nodes.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => CHILD_ROW_HEIGHT,
        overscan: 12,
    });
    // Explores have no contents to count; they show their description,
    // when any has one.
    const exploresOnly = nodes.every(({ ref }) => ref.type === 'explore');
    const descriptionOf = (node: TreeNode) =>
        node.ref.type === 'explore'
            ? summaryOf(
                  getExplore(view.project, node.ref.exploreId).description,
              )
            : '';
    const describe = exploresOnly && nodes.some(descriptionOf);
    return (
        <Box className={classes.table}>
            <Box
                className={classes.childRow}
                data-head
                data-describe={describe}
                data-name-only={exploresOnly && !describe}
            >
                <span>Name</span>
                {describe ? (
                    <span>Description</span>
                ) : exploresOnly ? null : (
                    <span className={classes.alignRight}>Contents</span>
                )}
            </Box>
            <Box ref={parentRef} className={classes.childScroll}>
                <Box
                    className={classes.childInner}
                    h={virtualizer.getTotalSize()}
                >
                    {virtualizer.getVirtualItems().map((item) => {
                        const node = nodes[item.index];
                        return (
                            <Box
                                key={node.key}
                                className={classes.childRow}
                                data-virtual
                                data-describe={describe}
                                data-name-only={exploresOnly && !describe}
                                top={item.start}
                                onClick={() => onOpen(node)}
                            >
                                <Group gap={10} wrap="nowrap" miw={0}>
                                    <Box flex="none" display="flex">
                                        <NodeIcon
                                            project={view.project}
                                            nodeRef={node.ref}
                                        />
                                    </Box>
                                    <Text
                                        truncate
                                        className={classes.childLabel}
                                        title={node.label}
                                    >
                                        {node.label}
                                    </Text>
                                </Group>
                                {describe ? (
                                    <Text
                                        truncate
                                        className={classes.childDescription}
                                    >
                                        {descriptionOf(node)}
                                    </Text>
                                ) : exploresOnly ? null : (
                                    <Text className={classes.count} ta="right">
                                        {node.ref.type === 'explore'
                                            ? ''
                                            : `${node.exploreCount.toLocaleString()} explore${node.exploreCount === 1 ? '' : 's'}`}
                                    </Text>
                                )}
                            </Box>
                        );
                    })}
                </Box>
            </Box>
        </Box>
    );
};

const ExploreBody: FC<{
    view: ViewModel;
    exploreId: string;
    openFieldId: string | null;
}> = ({ view, exploreId, openFieldId }) => {
    const explore = getExplore(view.project, exploreId);
    const source = getSource(view.project, explore.sourceId);
    const { data: draft } = useSemanticLayerDraft(view.project.id);
    const modelDraft = findCheckedOutModel(
        useStudioCheckout().shown,
        exploreId,
    );
    const othersHere =
        draft?.othersDrafting.find(({ model }) => model === exploreId)
            ?.drafters ?? [];
    const {
        fields: loaded,
        isLoading,
        error,
    } = useExploreFields({
        projectUuid: view.project.id,
        explore,
        source,
        canManageLive: view.permissions.live,
        draft: modelDraft,
    });
    const allFields = useMemo(() => loaded ?? [], [loaded]);
    const groups = useMemo(() => fieldGroups(allFields), [allFields]);
    const { fields, hiddenCount, onShowHidden, toolbarProps } =
        useFieldListState(allFields, openFieldId);
    const openField = openFieldId
        ? allFields.find(({ id }) => id === openFieldId)
        : undefined;
    const closeField = () =>
        view.select({ type: 'explore', exploreId }, { replace: true });
    const navigate = useNavigate();
    const { data: model } = useSemanticLayerModel(view.project.id, exploreId);
    // A joined field is defined in its own model, which has its own page.
    const viewFieldCode =
        model &&
        openField &&
        view.project.explores.some(({ id }) => id === openField.table)
            ? () =>
                  void navigate({
                      pathname: getSemanticStudioUrl(view.project.id, {
                          ref: { type: 'explore', exploreId: openField.table },
                      }),
                      search: getModelCodeSearch(openField.name),
                  })
            : null;
    // A link to a field this explore doesn't have opens the explore.
    const missingField = loaded !== undefined && openFieldId && !openField;
    useEffect(() => {
        if (missingField) closeField();
        // closeField is new each render; the check is what matters.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [missingField]);

    if (isLoading) {
        return (
            <Center py="xl">
                <Loader size="sm" color="gray" />
            </Center>
        );
    }
    if (error || !loaded) {
        return (
            <Text fz="sm" c="dimmed" ta="center" py="xl">
                {error ?? 'Could not load the fields of this explore.'}
            </Text>
        );
    }
    return (
        <>
            {modelDraft || othersHere.length > 0 ? (
                <Group gap="sm" mb="sm" wrap="nowrap">
                    <Text fz="xs" c="dimmed">
                        {[
                            modelDraft
                                ? 'Only you see this until you publish.'
                                : null,
                            ...othersHere.map(
                                ({ name, paths }) =>
                                    `${name} is changing ${paths.length > 0 ? paths.join(', ') : 'this model'}, in a draft.`,
                            ),
                        ]
                            .filter(Boolean)
                            .join(' ')}
                    </Text>
                </Group>
            ) : null}
            <FieldList
                view={view}
                explore={explore}
                fields={fields}
                hiddenCount={hiddenCount}
                onShowHidden={onShowHidden}
                openFieldId={openFieldId}
                toolbar={<FieldListToolbar {...toolbarProps} />}
                // The open field is in the URL; opening and closing replaces
                // the entry rather than stacking up the back button.
                onOpen={(field) =>
                    view.select(
                        { type: 'field', exploreId, fieldId: field.id },
                        { replace: true },
                    )
                }
            />
            {openField ? (
                <FieldDetailModal
                    key={openField.id}
                    view={view}
                    explore={explore}
                    field={openField}
                    groups={groups}
                    onClose={closeField}
                    onViewCode={viewFieldCode}
                />
            ) : null}
        </>
    );
};

/** The way back up: the project, then each level above this page. */
const Crumbs: FC<{
    view: ViewModel;
    trail: TreeNode[];
    onOpen: (ref: NodeRef | null) => void;
}> = ({ view, trail, onOpen }) => (
    <Breadcrumbs
        separator="/"
        separatorMargin={6}
        classNames={{ root: classes.crumbs, separator: classes.crumbSeparator }}
    >
        <Anchor
            component="button"
            className={classes.crumb}
            onClick={() => onOpen(null)}
        >
            {view.project.name}
        </Anchor>
        {trail.map((node) => (
            <Anchor
                key={node.key}
                component="button"
                className={classes.crumb}
                title={node.label}
                onClick={() => onOpen(node.ref)}
            >
                {node.label}
            </Anchor>
        ))}
    </Breadcrumbs>
);

const MainPane: FC<{
    view: ViewModel;
    onOpen: (ref: NodeRef | null) => void;
    onOpenNode: (node: TreeNode) => void;
    onBuildModel: (() => void) | null;
}> = ({ view, onOpen, onOpenNode, onBuildModel }) => {
    const canDrag = useAddToStudioChat() !== null;
    const selected = view.selected;
    const ref = selected ? containerOf(selected) : null;
    const node = ref ? findNode(view.tree.nodes, nodeKey(ref)) : undefined;
    const nodes = pageNodes(view.project, view.tree, ref);
    const explore =
        ref?.type === 'explore'
            ? getExplore(view.project, ref.exploreId)
            : null;
    const openFieldId = selected?.type === 'field' ? selected.fieldId : null;
    // A model the checked-out change adds has no live explore to draw joins from yet.
    const { shown: checkout } = useStudioCheckout();
    const isAdded =
        !!explore &&
        findCheckedOutModel(checkout, explore.id)?.contentBefore === null;
    // The source whose settings this page links to. Every source of a kind
    // shares one settings page, so a kind links to it too.
    const source =
        ref?.type === 'source' || ref?.type === 'group'
            ? getSource(view.project, ref.sourceId)
            : explore
              ? getSource(view.project, explore.sourceId)
              : ref?.type === 'kind'
                ? (view.project.sources.find(({ kind }) => kind === ref.kind) ??
                  null)
                : !ref
                  ? (view.tree.rootSource ?? null)
                  : null;
    // Admins manage live data sources here: the list on their kind's page,
    // and each source's usage and controls above its explores and fields.
    const liveActions = useLiveSourceActions();
    const isLiveSourcesPage =
        !!liveActions && ref?.type === 'kind' && ref.kind === 'live';
    const sourceExploreLabels = source
        ? view.project.explores
              .filter(({ sourceId }) => sourceId === source.id)
              .map(({ label }) => label)
        : [];
    // A source with several explores shows its usage and controls on its own
    // page, not on each explore's
    const isLiveSourcePage =
        ref?.type !== 'kind' &&
        (ref?.type !== 'explore' || sourceExploreLabels.length === 1);
    const liveConnection = useManagedLiveSource(
        view.project.id,
        isLiveSourcePage && source?.kind === 'live'
            ? source.connectionUuid
            : undefined,
    );
    // External sources likewise: the list on their kind's page, and each
    // file's or sheet's state and controls above its fields.
    const externalActions = useExternalSourceActions();
    const isExternalSourcesPage =
        !!externalActions && ref?.type === 'kind' && ref.kind === 'files';
    const externalSource = useManagedExternalSource(
        view.project.id,
        ref?.type !== 'kind' && source?.kind === 'files'
            ? source.id
            : undefined,
    );
    const trail = node ? trailTo(view.tree.nodes, node.key) : [];
    // A page sits under its parent.
    const crumbs = trail.slice(0, -1);
    const showCrumbs = ref !== null;

    const title =
        node?.label ??
        (isLiveSourcesPage
            ? 'Live data sources'
            : isExternalSourcesPage
              ? 'External sources'
              : ref?.type === 'source' && source
                ? source.name
                : view.project.name);
    const icon = ref ? (
        <NodeIcon project={view.project} nodeRef={ref} size={20} />
    ) : null;

    return (
        <Box className={classes.main}>
            <Box className={classes.mainHeader}>
                {showCrumbs ? (
                    <Crumbs view={view} trail={crumbs} onOpen={onOpen} />
                ) : null}
                <Group justify="space-between" wrap="nowrap" gap="md">
                    <Group gap={10} wrap="nowrap" miw={0}>
                        {icon ? (
                            <Box flex="none" display="flex">
                                {icon}
                            </Box>
                        ) : null}
                        <Title
                            order={3}
                            className={classes.title}
                            title={title}
                            draggable={canDrag && ref?.type === 'explore'}
                            onDragStart={(event) => {
                                if (ref?.type !== 'explore') return;
                                startStudioChatRefDrag(event.dataTransfer, {
                                    modelName: ref.exploreId,
                                    fieldName: null,
                                    modelLabel: title,
                                    fieldLabel: null,
                                    code: null,
                                });
                            }}
                        >
                            {title}
                        </Title>
                        {isLiveSourcesPage ? <LiveSourceBetaBadge /> : null}
                    </Group>
                    <Group gap={4} wrap="nowrap" flex="none">
                        {liveConnection ? (
                            <LiveSourceHeaderActions
                                projectUuid={view.project.id}
                                connection={liveConnection}
                            />
                        ) : null}
                        {externalSource ? (
                            <ExternalSourceHeaderActions
                                projectUuid={view.project.id}
                                source={externalSource}
                            />
                        ) : null}
                        {source && ref?.type !== 'explore' ? (
                            <SettingsLink
                                view={view}
                                source={source}
                                variant="subtle"
                            />
                        ) : null}
                    </Group>
                </Group>
            </Box>
            <Box className={classes.mainBody}>
                {onBuildModel && !ref ? (
                    <SemanticLayerNudge onBuild={onBuildModel} />
                ) : null}
                {liveConnection ? (
                    <LiveSourceSummary
                        projectUuid={view.project.id}
                        connection={liveConnection}
                        exploreLabels={sourceExploreLabels}
                    />
                ) : null}
                {externalSource ? (
                    <ExternalSourceSummary source={externalSource} />
                ) : null}
                {isLiveSourcesPage ? (
                    <LiveSourcesTable
                        projectUuid={view.project.id}
                        onOpen={(connectionUuid) =>
                            onOpen({ type: 'source', sourceId: connectionUuid })
                        }
                    />
                ) : isExternalSourcesPage ? (
                    <ExternalSourcesTable
                        projectUuid={view.project.id}
                        onOpen={(sourceUuid) =>
                            onOpen({ type: 'source', sourceId: sourceUuid })
                        }
                    />
                ) : explore ? (
                    <ModelTabs
                        key={explore.id}
                        projectUuid={view.project.id}
                        modelName={explore.id}
                        exploreName={explore.name}
                        isModelled={source?.kind === 'modelled'}
                        lineage={
                            source?.kind === 'modelled' && !isAdded ? (
                                <JoinDiagram
                                    projectUuid={view.project.id}
                                    exploreName={explore.name}
                                />
                            ) : null
                        }
                        fields={
                            <ExploreBody
                                key={explore.id}
                                view={view}
                                exploreId={explore.id}
                                openFieldId={openFieldId}
                            />
                        }
                    />
                ) : nodes.length > 0 ? (
                    <ChildrenList
                        view={view}
                        nodes={nodes}
                        onOpen={onOpenNode}
                    />
                ) : null}
            </Box>
        </Box>
    );
};

/**
 * The left rail: search, add and the tree. The search lives here, so
 * typing re-renders only the rail, never the page beside it. The search box
 * drives the results: arrows move, Enter opens, Esc clears.
 */
const Rail: FC<{
    view: ViewModel;
    expanded: Set<string>;
    drafted: Set<string>;
    onToggle: (key: string) => void;
    onOpen: (ref: NodeRef) => void;
}> = ({ view, expanded, drafted, onToggle, onOpen }) => {
    const search = useProjectSearch(view.project, view.tree);
    const [activeResult, setActiveResult] = useState(0);
    const { results } = search.results;
    // Result rows are memoised, so they get one stable handler.
    const onOpenRef = useRef(onOpen);
    useEffect(() => {
        onOpenRef.current = onOpen;
    });
    const { setSearch } = search;
    const openResult = useCallback(
        (ref: NodeRef) => {
            onOpenRef.current(ref);
            setSearch('');
        },
        [setSearch],
    );
    const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            search.setSearch('');
            return;
        }
        if (!search.isSearching || results.length === 0) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActiveResult((index) =>
                Math.min(Math.max(index + step, 0), results.length - 1),
            );
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const result = results[Math.min(activeResult, results.length - 1)];
            if (result) openResult(result.ref);
        }
    };

    return (
        <Box className={classes.rail}>
            <Box className={classes.railHeader}>
                <TextInput
                    size="xs"
                    flex={1}
                    placeholder="Search"
                    aria-label="Search explores and fields"
                    leftSection={<MantineIcon icon={IconSearch} size={14} />}
                    value={search.search}
                    onChange={(event) => {
                        search.setSearch(event.currentTarget.value);
                        setActiveResult(0);
                    }}
                    onKeyDown={handleSearchKeyDown}
                    role="combobox"
                    aria-expanded={search.isSearching}
                    aria-controls="semantic-search-results"
                    aria-activedescendant={
                        search.isSearching && results.length > 0
                            ? searchResultId(activeResult)
                            : undefined
                    }
                />
                <AddSourceButton view={view} />
            </Box>
            {search.isSearching ? (
                <SearchResultsList
                    view={view}
                    search={search}
                    activeIndex={activeResult}
                    onOpen={openResult}
                />
            ) : (
                <Tree
                    view={view}
                    expanded={expanded}
                    drafted={drafted}
                    onToggle={onToggle}
                    onSelect={(node) => view.select(node.ref)}
                />
            )}
        </Box>
    );
};

/**
 * The Code view's rail: every model with YAML behind it, and any the draft adds.
 * Not virtualised; only native YAML projects get here, so add it if one reaches thousands of models.
 */
const CodeRail: FC<{
    files: string[];
    selected: string | null;
    drafted: Set<string>;
    /** The pre-aggregate open in the file, so its row reads as selected and not the file's. */
    selectedPart: string | null;
    preAggregates: Map<string, PreAggregateMaterializationSummary[]>;
    onOpen: (file: string, part: string | null) => void;
}> = ({ files, selected, selectedPart, drafted, preAggregates, onOpen }) => (
    <Box className={classes.rail}>
        <Box className={classes.treeScroll}>
            {files.map((file) => (
                <Fragment key={file}>
                    <Box
                        component="button"
                        className={classes.fileRow}
                        data-selected={file === selected && !selectedPart}
                        onClick={() => onOpen(file, null)}
                    >
                        <MantineIcon
                            icon={IconFileCode}
                            size={14}
                            color="dimmed"
                        />
                        <Text
                            truncate
                            className={classes.treeLabel}
                            title={file}
                        >
                            {file}.yml
                        </Text>
                        <DraftMarker model={file} isMine={drafted.has(file)} />
                    </Box>
                    {/* A pre-aggregate lives in its model's file; its row jumps to where it is defined. */}
                    {(preAggregates.get(file) ?? []).map((summary) => {
                        const status = getPreAggregateStatus(summary);
                        return (
                            <Tooltip
                                key={summary.preAggregateDefinitionUuid}
                                label={`Pre-aggregate · ${status.label}`}
                                position="right"
                            >
                                <Box
                                    component="button"
                                    className={classes.fileRow}
                                    data-part
                                    data-selected={
                                        file === selected &&
                                        selectedPart ===
                                            summary.preAggregateName
                                    }
                                    onClick={() =>
                                        onOpen(file, summary.preAggregateName)
                                    }
                                >
                                    <MantineIcon
                                        icon={IconBolt}
                                        size={14}
                                        color="dimmed"
                                    />
                                    <Text
                                        truncate
                                        className={classes.treeLabel}
                                    >
                                        {summary.preAggregateName}
                                    </Text>
                                    <Box
                                        className={classes.statusDot}
                                        data-status={status.color ?? 'none'}
                                    />
                                </Box>
                            </Tooltip>
                        );
                    })}
                </Fragment>
            ))}
        </Box>
    </Box>
);

const FILE_PARAM = 'file';

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
    // On a change's own page the bare path shows it; elsewhere it is a view.
    const changesParams = useMemo(
        (): Record<string, string> =>
            routeWorkspaceUuid ? {} : { [VIEW_PARAM]: 'changes' },
        [routeWorkspaceUuid],
    );
    // Any other view leaves the change's page, so its id drops from the path.
    const setStudioParams = (params: Record<string, string>) => {
        if (!routeWorkspaceUuid) return setSearchParams(params);
        void navigate({
            pathname: getSemanticStudioUrl(view.project.id, { ref: null }),
            search: createSearchParams(params).toString(),
        });
    };
    const { data: draft } = useSemanticLayerDraft(view.project.id);
    useDraftFreshness(view.project.id);
    const { data: project } = useProject(view.project.id);
    // A dbt project has no draft and no model code here: its files are in its repository.
    const keepsDraft = useKeepsSemanticLayerDraft(view.project.id);
    const canEditModels = useCanEditSemanticLayer(view.project.id);
    const status = useSemanticLayerStatus(view.project.id);
    const checkout = useStudioCheckout().shown;
    const checkedOutDraft = keepsDraft ? (checkout?.draft ?? null) : null;

    const {
        startNewThread,
        agent: studioAgent,
        isEnabled: hasChat,
        isLoadingAgents,
    } = useStudioAgent(view.project.id);
    const [isChatOpen, setIsChatOpen] = useChatOpen(view.project.id);
    const [askedPrompt, setAskedPrompt] = useState<string | null>(null);
    const agentAvailable = hasChat && !!studioAgent;
    const hasDraft = (draft?.changes.length ?? 0) > 0;
    const draftMarks = useMemo<DraftMarks>(
        () => ({
            labels: new Map(
                (checkedOutDraft?.models ?? []).flatMap(
                    ({ model, explore }): [string, string][] =>
                        explore?.label ? [[model, explore.label]] : [],
                ),
            ),
            others: new Map(
                (draft?.othersDrafting ?? []).map(
                    ({ model, drafters }): [string, string[]] => [
                        model,
                        drafters.map(({ name }) => name),
                    ],
                ),
            ),
        }),
        [checkedOutDraft, draft],
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
    const drafted = useMemo(
        () => new Set(checkedOutDraft?.models.map(({ model }) => model)),
        [checkedOutDraft],
    );
    const { data: workspaces } = useStudioWorkspaces(view.project.id);
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
    // A link to a change that is not checked out shows where it stands; its edits show once it is checked out.
    const isLookingAtChange =
        keepsDraft &&
        checkout !== null &&
        !!routeWorkspace &&
        !isRouteCheckedOut;
    const isReviewingDraft =
        isBuildingFirstModel ||
        (hasDraft &&
            (searchParams.get(DRAFT_PARAM) === DRAFT_REVIEW ||
                (isDefaultView && isRouteCheckedOut)));
    // A linked change is read from its own record, yours or someone else's; otherwise the one your chat is on.
    const pullRequest = useStudioPullRequest(
        view.project.id,
        routeWorkspace ?? undefined,
    );
    const development = !keepsDraft && pullRequest?.isOpen ? pullRequest : null;
    // A linked change shows whatever state it is in; otherwise only an open one is on the page.
    const changeOnPage =
        !keepsDraft &&
        (routeWorkspace || searchParams.get(VIEW_PARAM) === 'changes')
            ? pullRequest
            : development;
    const pendingChange = useStudioPendingChange(view.project.id);
    const saving = keepsDraft ? null : pendingChange;
    const [isTryingChanges, setIsTryingChanges] = useDevelopmentView();
    // A dbt project's changes are tried through its pull request's preview, so there is nothing to try once that closes.
    const hasClosedPullRequest = !keepsDraft && pullRequest?.state === 'closed';
    useEffect(() => {
        if (hasClosedPullRequest && isTryingChanges) setIsTryingChanges(false);
    }, [hasClosedPullRequest, isTryingChanges, setIsTryingChanges]);
    // Nothing outside Studio says the app reads your changes, so leaving it switches that off.
    const switchOff = useRef<(() => void) | null>(null);
    switchOff.current = isTryingChanges
        ? () => setIsTryingChanges(false)
        : null;
    useEffect(() => () => switchOff.current?.(), []);
    const isCode =
        hasChat && keepsDraft && searchParams.get(VIEW_PARAM) === 'code';
    const [isOnLive, setIsOnLive] = useState(false);
    // Opening a change's page, from anywhere, puts you on that change.
    useEffect(() => {
        if (routeWorkspaceUuid) setIsOnLive(false);
    }, [routeWorkspaceUuid]);
    // Home shows the changes when it opens with some; a change that lands later never swaps the page under you.
    const home = useRef({ visit, showsChanges: false, sawSave: false });
    if (home.current.visit !== visit) {
        home.current = { visit, showsChanges: false, sawSave: false };
    }
    if (saving) home.current.sawSave = true;
    if (changeOnPage && !home.current.sawSave) home.current.showsChanges = true;
    const homeShowsChanges = isDefaultView && home.current.showsChanges;
    // Every change is read in one place, Sources, starting on its overview; only your open one is edited there.
    const opensInSources =
        !isOnLive &&
        hasChat &&
        !keepsDraft &&
        !!changeOnPage &&
        (!!routeWorkspace ||
            searchParams.get(VIEW_PARAM) === 'changes' ||
            homeShowsChanges);
    const isSources =
        opensInSources ||
        (hasChat && !keepsDraft && searchParams.get(VIEW_PARAM) === 'sources');
    const proposal = useStudioProposal(view.project.id);
    const hasProposal = !keepsDraft && proposal.length > 0;
    // A dbt project's changes are its conversation's: what it proposes, and what its pull request holds.
    const isChanges =
        !keepsDraft &&
        (!!changeOnPage || hasProposal) &&
        (searchParams.get(VIEW_PARAM) === 'changes' || homeShowsChanges);
    const hasChanges = keepsDraft
        ? hasDraft && !isBuildingFirstModel
        : !!development || hasProposal;
    const workspaceAction = useStudioWorkspaceAction(view.project.id);
    const activeWorkspace = useSyncStudioWorkspace(
        view.project.id,
        hasChanges || !!saving,
        !keepsDraft,
    );
    // The workspace this page is about: the one in the link, else the one the open chat belongs to.
    const shownWorkspace =
        routeWorkspace ??
        activeWorkspace ??
        (keepsDraft
            ? null
            : allWorkspaces.find(
                  ({ threadUuid, isMine }) =>
                      isMine && threadUuid === storedThread?.threadUuid,
              )) ??
        null;
    const hasWorkspaces = allWorkspaces.length > 0;
    const openWorkspace = useCallback(
        (
            target: (typeof allWorkspaces)[number],
            { navigateTo }: { navigateTo: boolean },
        ) => {
            // Someone else's change is only looked at: your chat and active change stay as they are.
            if (
                !keepsDraft &&
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
                !keepsDraft &&
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
            keepsDraft,
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
    const isMerged = !keepsDraft && pullRequest?.state === 'merged';
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
        if (
            hasProposal ||
            (keepsDraft &&
                hasDraft &&
                !isBuildingFirstModel &&
                !isLookingAtChange)
        ) {
            return { step: 'proposed' };
        }
        if (hasClosedPullRequest) {
            return {
                step: 'closed',
                pullRequestNumber: pullRequestNumberOf(pullRequest?.prUrl),
            };
        }
        if (shownWorkspace?.pullRequest?.state === 'open') {
            return {
                step: 'in_review',
                pullRequestNumber: pullRequestNumberOf(
                    shownWorkspace.pullRequest.url,
                ),
            };
        }
        if (
            shownWorkspace?.publishedLive ||
            shownWorkspace?.pullRequest?.state === 'merged'
        ) {
            return { step: 'live', update: 'done' };
        }
        if (shownWorkspace?.pullRequest?.state === 'closed') {
            return {
                step: 'closed',
                pullRequestNumber: pullRequestNumberOf(
                    shownWorkspace.pullRequest.url,
                ),
            };
        }
        // Finished without a merge or a publish: it was discarded.
        if (shownWorkspace?.finishedAt) {
            return { step: 'closed', pullRequestNumber: null };
        }
        return null;
    })();
    // Changes asked for by view get the open chat's change address once it is known, so a reload or a link lands on it.
    const changeToAddress =
        searchParams.get(VIEW_PARAM) === 'changes' && !routeWorkspaceUuid
            ? keepsDraft
                ? activeWorkspace?.workspaceUuid
                : (allWorkspaces.find(
                      ({ threadUuid, isMine }) =>
                          isMine && threadUuid === storedThread?.threadUuid,
                  )?.workspaceUuid ?? null)
            : null;
    useEffect(() => {
        if (!changeToAddress) return;
        void navigate(
            getSemanticStudioWorkspaceUrl(view.project.id, changeToAddress),
            { replace: true },
        );
    }, [changeToAddress, navigate, view.project.id]);
    // The workspace the conversation made, named for where its changes stand.
    const pullRequestNumber = /\/(\d+)\/?$/.exec(development?.prUrl ?? '')?.[1];
    const workspace = saving
        ? { name: 'New draft', hint: 'The draft is being saved.' }
        : development
          ? {
                name: pullRequestNumber
                    ? `Draft #${pullRequestNumber}`
                    : 'Draft',
                hint: 'Published stays as it is until you publish this draft.',
            }
          : hasProposal
            ? {
                  name: 'Proposed change',
                  hint: 'Not saved. Saving needs write access to the repository.',
              }
            : keepsDraft && hasDraft && !isBuildingFirstModel
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
    } = useSemanticLayerStoredModels(view.project.id, isCode);
    const files = useMemo(() => {
        const removed = new Set(
            checkedOutDraft?.models
                .filter(({ contentAfter }) => contentAfter === null)
                .map(({ model }) => model),
        );
        return [...new Set([...drafted, ...(stored?.models ?? [])])]
            .filter((name) => !removed.has(name))
            .sort();
    }, [checkedOutDraft, drafted, stored]);
    const requestedFile = searchParams.get(FILE_PARAM);
    const file =
        files.find((name) => name === requestedFile) ??
        files.find((name) => name === openExplore) ??
        files.at(0) ??
        null;
    const switchView = (next: string) => {
        if (next === 'code') {
            setStudioParams({ [VIEW_PARAM]: 'code' });
        } else if (next === 'changes') {
            setSearchParams(
                keepsDraft ? { [DRAFT_PARAM]: DRAFT_REVIEW } : changesParams,
            );
        } else if (requestedFile && modelled.includes(requestedFile)) {
            view.select({ type: 'explore', exploreId: requestedFile });
        } else {
            // Named, since with changes to check the bare page shows those.
            setStudioParams(hasChanges ? { [VIEW_PARAM]: 'models' } : {});
        }
    };

    const hasWarehouse = !!project?.warehouseConnection;
    const canBuildFirstModel =
        isEmpty && hasWarehouse && agentAvailable && keepsDraft;
    const canNudge =
        agentAvailable && keepsDraft && hasWarehouse && modelled.length === 0;
    const pane = ((): Pane => {
        if (searchParams.get(VIEW_PARAM) === 'workspaces') return 'workspaces';
        if (isCode) return 'code';
        if (isLookingAtChange) return 'changeSummary';
        if (isSources) return 'sources';
        if (isChanges) return 'changes';
        if (isReviewingDraft) return 'review';
        if (!isEmpty) return 'browse';
        if (!canBuildFirstModel) return 'empty';
        return 'buildFirst';
    })();
    // Reviewing changes takes the full width: the tree is for browsing models.
    const isReviewPane =
        pane === 'changes' ||
        pane === 'review' ||
        pane === 'workspaces' ||
        pane === 'changeSummary';
    // Published is the default state; Drafts is everything in flight, and an open draft gets its own bar.
    const isChangesView = isReviewPane;
    const isChangeOpen =
        (pane === 'changes' || pane === 'review') &&
        !!(shownWorkspace || workspace);
    const hasChangesTab = hasWorkspaces || hasChanges || !!saving;
    const showLive = () => {
        setIsTryingChanges(false);
        setIsOnLive(true);
        switchView('models');
    };
    const showChanges = () =>
        hasWorkspaces
            ? setStudioParams({ [VIEW_PARAM]: 'workspaces' })
            : switchView('changes');
    // Sources reads the change you are on, or live; saving from live opens a change.
    const [openedPrUrl, setOpenedPrUrl] = useState<string | null>(null);
    // A new change has no pull request until its first save, but you are on it.
    const [isStartingChange, setIsStartingChange] = useState(false);
    const startNewChange = () => {
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
                `${getSemanticStudioUrl(view.project.id, { ref: null })}${isSourcesView ? `?${searchParams.toString()}` : ''}`,
            );
        }
    };
    const isMyOpenWorkspace =
        !!shownWorkspace?.isMine &&
        !shownWorkspace.finishedAt &&
        shownWorkspace.pullRequest?.state !== 'merged' &&
        shownWorkspace.pullRequest?.state !== 'closed';
    const isOnMyChange =
        !isOnLive &&
        !(routeWorkspace && !routeWorkspace.isMine) &&
        (isStartingChange ||
            !!saving ||
            hasProposal ||
            !!development ||
            !!openedPrUrl ||
            isMyOpenWorkspace);
    // What the chat is told the person has open: in the code view that is the file, not the page behind it.
    const sourceFile = searchParams.get(SOURCE_PARAM);
    // Coming back to Sources reopens the file left open there.
    const lastSourceFile = useRef(sourceFile);
    if (isSources && sourceFile) lastSourceFile.current = sourceFile;
    const openModel = isCode
        ? { modelName: file, fieldName: searchParams.get(FIELD_PARAM) }
        : isSources
          ? {
                modelName:
                    sourceFile
                        ?.split('/')
                        .pop()
                        ?.replace(/\.(ya?ml|sql)$/, '') ?? null,
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
    const askFirst = (prompt: string) => {
        setIsChatOpen(true);
        setAskedPrompt(prompt);
    };

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
            {keepsDraft ? (
                <DraftDevelopmentBar projectUuid={view.project.id} />
            ) : null}
        </Group>
    );
    const changeName = shownWorkspace?.name ?? workspace?.name;
    // Sources edits your own change only; a teammate's is looked at on its page.
    const changePrUrl =
        opensInSources && changeOnPage
            ? changeOnPage.prUrl
            : ((development?.isMine ? development.prUrl : null) ??
              (shownWorkspace?.isMine &&
              shownWorkspace.pullRequest?.state === 'open'
                  ? shownWorkspace.pullRequest.url
                  : null) ??
              openedPrUrl);
    const sourcesPrUrl = isOnLive ? null : changePrUrl;
    const sourcesTarget: SourcesTarget = {
        projectUuid: view.project.id,
        prUrl: sourcesPrUrl,
        head:
            sourcesPrUrl && sourcesPrUrl === pullRequest?.prUrl
                ? pullRequest.revision
                : null,
        // On live a save starts a change of its own, not one for the last conversation.
        threadUuid: isOnLive ? null : (storedThread?.threadUuid ?? null),
        newChangeAgentUuid:
            isOnLive || !storedThread ? (studioAgent?.uuid ?? null) : null,
        changeName: sourcesPrUrl
            ? (changeName ??
              `Draft #${pullRequestNumberOf(sourcesPrUrl) ?? ''}`)
            : null,
        canEdit:
            !opensInSources || (!!changeOnPage?.isMine && changeOnPage.isOpen),
    };
    // Your chat's proposal belongs to its own change, not to whichever one is open.
    const shownProposal =
        hasProposal &&
        sourcesTarget.canEdit &&
        (!shownWorkspace ||
            shownWorkspace.threadUuid === storedThread?.threadUuid)
            ? proposal
            : [];
    const myOpenChanges = (workspaces?.mine ?? []).filter(
        ({ finishedAt, pullRequest: pr }) =>
            !finishedAt && pr?.state !== 'merged' && pr?.state !== 'closed',
    );
    const isSourcesView = pane === 'sources' || pane === 'code';
    const showSources = () =>
        keepsDraft
            ? switchView('code')
            : setStudioParams({
                  [VIEW_PARAM]: 'sources',
                  ...(lastSourceFile.current
                      ? { [SOURCE_PARAM]: lastSourceFile.current }
                      : {}),
              });
    const pickLive = () => {
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
    };
    const pickChange = (target: (typeof allWorkspaces)[number]) => {
        setIsOnLive(false);
        setOpenedPrUrl(null);
        setIsStartingChange(false);
        setIsChatOpen(true);
        openWorkspace(target, { navigateTo: !isSourcesView });
    };
    // Like a git branch: which change you are on, or live, and the way to the others.
    const isChangeInSources = pane === 'sources' && !!sourcesPrUrl;
    // A checked-out draft keeps its actions on every tab; a draft's own page carries them in its header.
    const showsDraftActions = keepsDraft
        ? pane !== 'changeSummary' && pane !== 'workspaces'
        : isChangeInSources ||
          (pane !== 'changes' &&
              pane !== 'workspaces' &&
              isOnMyChange &&
              (!!development || !!saving));
    const { checkOut, isBusy: isCheckingOut } = useCheckOut(view.project.id);
    const { data: draftCheckout } = useDraftCheckout(view.project.id);
    const compileAgain = useCompileCheckout(view.project.id);
    // The compile belongs to the server checkout, so it shows only on that draft.
    const branchCompile =
        isOnMyChange &&
        draftCheckout?.workspaceUuid === shownWorkspace?.workspaceUuid
            ? (draftCheckout?.branchCompile ?? null)
            : null;
    const compileDescription = branchCompile
        ? describeBranchCompile(branchCompile)
        : null;
    const changePicker = keepsDraft ? (
        canEditModels ? (
            <StudioCheckoutPicker
                projectUuid={view.project.id}
                onShowChanges={hasChangesTab ? showChanges : null}
            />
        ) : null
    ) : (
        <DraftPickerMenu
            currentName={
                sourcesTarget.changeName ??
                (isOnMyChange ? (changeName ?? 'New draft') : null)
            }
            drafts={myOpenChanges.map((target) => ({
                id: target.workspaceUuid,
                name: target.name,
                isCurrent:
                    !!sourcesPrUrl && sourcesPrUrl === target.pullRequest?.url,
            }))}
            isBusy={false}
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
                                    <MantineIcon icon={IconRefresh} size={14} />
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
            onShowAll={hasChangesTab ? showChanges : null}
        />
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
    const goBack = hasWorkspaces ? showChanges : showLive;
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

    const renderPaneWithChat = () => (
        <AddToStudioChatContext.Provider
            value={agentAvailable ? attachToChat : null}
        >
            {renderPane()}
        </AddToStudioChatContext.Provider>
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
                        onCheckOut={keepsDraft ? checkOut : null}
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
                                                Check out this change to see it
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
                    />
                ) : null;
            case 'code':
                return file ? (
                    <ModelCodeView
                        key={file}
                        projectUuid={view.project.id}
                        modelName={file}
                        fieldName={searchParams.get(FIELD_PARAM)}
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
                            variant="default"
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
                                ? 'These models were deployed from outside this app, so their YAML is not here and they cannot be changed here yet.'
                                : 'Ask the agent to build a model and its YAML shows up here.'
                        }
                        maw={460}
                        titleProps={{ order: 5 }}
                        descriptionProps={{ fz: 'sm' }}
                    />
                );
            case 'sources':
                return !sourceFile && sourcesPrUrl ? (
                    <StudioChanges
                        header={null}
                        projectUuid={view.project.id}
                        pullRequest={changeOnPage}
                        proposal={shownProposal}
                    />
                ) : (
                    <Suspense fallback={null}>
                        <SourcePane
                            target={sourcesTarget}
                            proposal={shownProposal}
                            onSaved={(prUrl, thread) => {
                                if (prUrl === sourcesPrUrl) return;
                                // A save from live started a change of its own, with a conversation to ask about it in.
                                if (thread) setStoredThread(thread);
                                else if (!sourcesTarget.threadUuid)
                                    startNewThread();
                                setOpenedPrUrl(prUrl);
                                setIsOnLive(false);
                                setIsChatOpen(true);
                            }}
                            onAddToChat={attachToChat}
                        />
                    </Suspense>
                );
            case 'review':
                return draft ? (
                    <>
                        <Box className={classes.mainBody}>
                            <DraftReview
                                projectUuid={view.project.id}
                                draft={draft}
                                onAskAgent={(prompt) => {
                                    setIsChatOpen(true);
                                    setAskedPrompt(prompt);
                                }}
                            />
                        </Box>
                    </>
                ) : null;
            case 'browse':
                return (
                    <MainPane
                        view={view}
                        onOpen={(ref) => (ref ? open(ref) : view.select(null))}
                        onOpenNode={openNode}
                        onBuildModel={
                            canNudge
                                ? () => {
                                      setIsChatOpen(true);
                                      setAskedPrompt(BUILD_MODEL_PROMPT);
                                  }
                                : null
                        }
                    />
                );
            case 'buildFirst':
                return (
                    <BuildFirstModel
                        view={view}
                        onAsk={isChatOpen ? null : askFirst}
                    />
                );
            case 'empty':
                return <EmptyProject view={view} />;
            default:
                return assertUnreachable(pane, 'Unknown pane');
        }
    };

    return (
        <DraftMarksContext.Provider value={draftMarks}>
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
                            (!isLoadingAgents && (!studioAgent || !isChatOpen))
                        }
                    >
                        {hasChat && (
                            <SemanticStudioAgent
                                projectUuid={view.project.id}
                                {...openModel}
                                attached={attached}
                                onAttach={attachToChat}
                                onDetach={(ref) =>
                                    setAttached((current) =>
                                        current.filter(
                                            (item) =>
                                                !sameStudioChatRef(item, ref),
                                        ),
                                    )
                                }
                                onAttachedSent={() => setAttached([])}
                                prompt={askedPrompt}
                                onPromptTaken={() => setAskedPrompt(null)}
                                showStarters={canBuildFirstModel}
                            />
                        )}
                        <Box className={classes.workspace}>
                            {!hasChat ? (
                                status?.blocker ? (
                                    <BlockedNotice blocker={status.blocker} />
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
                                                    !isSourcesView &&
                                                    !isChangesView
                                                }
                                                onClick={() =>
                                                    switchView('models')
                                                }
                                            >
                                                Models
                                            </UnstyledButton>
                                            <UnstyledButton
                                                role="tab"
                                                className={classes.view}
                                                aria-selected={isSourcesView}
                                                onClick={showSources}
                                            >
                                                Code
                                            </UnstyledButton>
                                        </div>
                                        {changePicker ? (
                                            <Group
                                                gap="xs"
                                                wrap="nowrap"
                                                miw={0}
                                                className={
                                                    classes.toolbarChange
                                                }
                                            >
                                                {changePicker}
                                                {/* The bar says how an open draft is doing, so the pill shows only once it ends. */}
                                                {stage &&
                                                (keepsDraft
                                                    ? stage.step !== 'proposed'
                                                    : isChangeInSources &&
                                                      stage.step !==
                                                          'in_review' &&
                                                      stage.step !==
                                                          'saving') ? (
                                                    <StudioStageLine
                                                        stage={stage}
                                                        href={changeUrl}
                                                    />
                                                ) : null}
                                            </Group>
                                        ) : null}
                                        <Group
                                            gap="xs"
                                            wrap="nowrap"
                                            miw={0}
                                            ml="auto"
                                        >
                                            {keepsDraft &&
                                            hasDraft &&
                                            pane !== 'review' &&
                                            pane !== 'changeSummary' ? (
                                                <Button
                                                    size="xs"
                                                    variant="default"
                                                    flex="none"
                                                    onClick={() =>
                                                        switchView('changes')
                                                    }
                                                >
                                                    Review changes
                                                </Button>
                                            ) : null}
                                            {showsDraftActions ? (
                                                <>
                                                    {changeLinks}
                                                    {changeActions}
                                                </>
                                            ) : null}
                                            {agentAvailable && !isChatOpen ? (
                                                <Button
                                                    size="xs"
                                                    variant="default"
                                                    flex="none"
                                                    leftSection={
                                                        <MantineIcon
                                                            icon={IconMessage}
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
                                            !isLoadingAgents ? (
                                                <Button
                                                    size="xs"
                                                    variant="default"
                                                    flex="none"
                                                    component={Link}
                                                    to={`/projects/${view.project.id}/ai-agents/new`}
                                                >
                                                    Create an agent
                                                </Button>
                                            ) : null}
                                        </Group>
                                    </Group>
                                </>
                            )}
                            <Box
                                className={classes.workspaceBody}
                                data-sources={pane === 'sources' || undefined}
                                data-no-rail={
                                    isReviewPane ||
                                    (pane === 'code' && files.length === 0) ||
                                    (pane !== 'code' &&
                                        pane !== 'sources' &&
                                        isEmpty)
                                }
                            >
                                {pane === 'code' &&
                                files.length === 0 ? null : pane === 'code' ? (
                                    <CodeRail
                                        files={files}
                                        selected={file}
                                        selectedPart={searchParams.get(
                                            FIELD_PARAM,
                                        )}
                                        drafted={drafted}
                                        preAggregates={preAggregatesByModel}
                                        onOpen={(next, part) =>
                                            setSearchParams({
                                                [VIEW_PARAM]: 'code',
                                                [FILE_PARAM]: next,
                                                ...(part
                                                    ? { [FIELD_PARAM]: part }
                                                    : {}),
                                            })
                                        }
                                    />
                                ) : pane === 'sources' ? (
                                    <Suspense fallback={null}>
                                        <SourcesRail
                                            target={sourcesTarget}
                                            proposal={shownProposal}
                                            hasOverview={!!sourcesPrUrl}
                                        />
                                    </Suspense>
                                ) : isEmpty || isReviewPane ? null : (
                                    <AddToStudioChatContext.Provider
                                        value={
                                            agentAvailable ? attachToChat : null
                                        }
                                    >
                                        <Rail
                                            view={view}
                                            expanded={expanded}
                                            drafted={drafted}
                                            onToggle={toggle}
                                            onOpen={open}
                                        />
                                    </AddToStudioChatContext.Provider>
                                )}
                                {pane === 'browse' ? (
                                    renderPaneWithChat()
                                ) : (
                                    <Box
                                        className={classes.main}
                                        data-full={
                                            pane === 'code' ||
                                            pane === 'sources' ||
                                            pane === 'changes' ||
                                            pane === 'changeSummary'
                                        }
                                    >
                                        {renderPaneWithChat()}
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    </Box>
                </ExternalSourceManager>
            </LiveSourceManager>
        </DraftMarksContext.Provider>
    );
};
