/**
 * Semantic Layer: the tree on the left and the page beside it, at the width
 * settings pages use. Every page lives there: a kind, a source, a folder or
 * an explore and its fields. Breadcrumbs lead back up; fields open in a
 * modal.
 */
import { assertUnreachable } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Breadcrumbs,
    Button,
    Center,
    Group,
    Loader,
    SegmentedControl,
    Text,
    TextInput,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconChevronRight,
    IconCode,
    IconFileCode,
    IconMessage,
    IconPlus,
    IconSearch,
} from '@tabler/icons-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type KeyboardEvent,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { SemanticStudioAgent } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/SemanticStudioAgent';
import { StudioChanges } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/StudioChanges';
import {
    StudioDevelopmentBar,
    StudioSavingBar,
} from '../../ee/features/aiCopilot/components/SemanticStudioAgent/StudioDevelopmentBar';
import {
    useChatOpen,
    useSemanticStudioChat,
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
import {
    DraftDevelopmentBar,
    DraftReview,
    DraftReviewHeading,
} from './SemanticLayerDraft';
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
import {
    AddToStudioChatContext,
    sameStudioChatRef,
    startStudioChatRefDrag,
    type StudioChatRef,
} from './studioChatRefs';
import { needsYou } from './studioRuns';
import { StudioStageLine, type StudioStage } from './StudioStageLine';
import { StudioWorkspacesList } from './StudioWorkspacesList';
import {
    getSemanticStudioUrl,
    getSemanticStudioWorkspaceUrl,
    parseSemanticStudioWorkspaceUuid,
    pullRequestNumberOf,
} from './urls';
import { useExploreFields } from './useExploreFields';
import {
    useKeepsSemanticLayerDraft,
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
import { useStudioRuns } from './useStudioRuns';
import {
    useStudioWorkspaceAction,
    useStudioWorkspaces,
} from './useStudioWorkspaces';
import classes from './WorkbenchView.module.css';

dayjs.extend(relativeTime);

const ROW_HEIGHT = 28;

/** What the workspace shows beside the rail. */
type Pane =
    | 'code'
    | 'changes'
    | 'workspaces'
    | 'review'
    | 'browse'
    | 'intro'
    | 'buildFirst'
    | 'empty';

/** Says whose unpublished work a model has: this person's, someone else's, or both. */
const DraftMarker: FC<{
    projectUuid: string;
    model: string;
    isMine: boolean;
}> = ({ projectUuid, model, isMine }) => {
    const { data: draft } = useSemanticLayerDraft(projectUuid);
    const others =
        draft?.othersDrafting
            .find((entry) => entry.model === model)
            ?.drafters.map(({ name }) => name) ?? [];
    if (!isMine && others.length === 0) return null;
    const whose = [...(isMine ? ['you'] : []), ...others].join(', ');
    return (
        <Tooltip label={`Draft by ${whose}. Not live yet.`}>
            <Box
                className={classes.draftDot}
                data-others={!isMine || undefined}
            />
        </Tooltip>
    );
};

/** A model's name as this person's draft leaves it, so the list and the review say the same thing. */
const ModelLabel: FC<{ projectUuid: string; model: string; label: string }> = ({
    projectUuid,
    model,
    label,
}) => {
    const { data: draft } = useSemanticLayerDraft(projectUuid);
    return (
        draft?.models.find((entry) => entry.model === model)?.explore?.label ??
        label
    );
};

const Tree: FC<{
    view: ViewModel;
    expanded: Set<string>;
    /** Models this person's draft touches. */
    drafted: Set<string>;
    onToggle: (key: string) => void;
    onSelect: (node: TreeNode) => void;
}> = ({ view, expanded, drafted, onToggle, onSelect }) => {
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
                            draggable={node.ref.type === 'explore'}
                            onDragStart={(event) => {
                                if (node.ref.type !== 'explore') return;
                                startStudioChatRefDrag(event.dataTransfer, {
                                    modelName: node.ref.exploreId,
                                    fieldName: null,
                                    modelLabel: node.label,
                                    fieldLabel: null,
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
                                        projectUuid={view.project.id}
                                        model={node.ref.exploreId}
                                        label={node.label}
                                    />
                                ) : (
                                    node.label
                                )}
                            </Text>
                            {node.ref.type === 'explore' ? (
                                <DraftMarker
                                    projectUuid={view.project.id}
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
    const modelDraft =
        draft?.models.find(({ model }) => model === exploreId) ?? null;
    const othersHere =
        draft?.othersDrafting.find(({ model }) => model === exploreId)
            ?.drafters ?? [];
    const [isShowingLive, setIsShowingLive] = useState(false);
    const {
        fields: loaded,
        isLoading,
        error,
    } = useExploreFields({
        projectUuid: view.project.id,
        explore,
        source,
        canManageLive: view.permissions.live,
        draft: isShowingLive ? null : modelDraft,
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
                    {modelDraft ? (
                        <SegmentedControl
                            size="xs"
                            flex="none"
                            value={isShowingLive ? 'live' : 'development'}
                            onChange={(next) =>
                                setIsShowingLive(next === 'live')
                            }
                            data={[
                                {
                                    value: 'development',
                                    label: 'With my changes',
                                },
                                { value: 'live', label: 'Live' },
                            ]}
                        />
                    ) : null}
                    <Text fz="xs" c="dimmed">
                        {[
                            modelDraft
                                ? isShowingLive
                                    ? 'What everyone sees now.'
                                    : 'Only you see this until you publish.'
                                : null,
                            ...othersHere.map(
                                ({ name, paths }) =>
                                    `${name} is changing ${paths.length > 0 ? paths.join(', ') : 'this model'}, in development.`,
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
    const selected = view.selected;
    const ref = selected ? containerOf(selected) : null;
    const node = ref ? findNode(view.tree.nodes, nodeKey(ref)) : undefined;
    const nodes = pageNodes(view.project, view.tree, ref);
    const explore =
        ref?.type === 'explore'
            ? getExplore(view.project, ref.exploreId)
            : null;
    const openFieldId = selected?.type === 'field' ? selected.fieldId : null;
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
    const liveConnection = useManagedLiveSource(
        view.project.id,
        ref?.type !== 'kind' && source?.kind === 'live'
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
                            draggable={ref?.type === 'explore'}
                            onDragStart={(event) => {
                                if (ref?.type !== 'explore') return;
                                startStudioChatRefDrag(event.dataTransfer, {
                                    modelName: ref.exploreId,
                                    fieldName: null,
                                    modelLabel: title,
                                    fieldLabel: null,
                                });
                            }}
                        >
                            {title}
                        </Title>
                        {isLiveSourcesPage ? <LiveSourceBetaBadge /> : null}
                    </Group>
                    <Group gap={4} wrap="nowrap" flex="none">
                        {ref?.type === 'kind' ? (
                            <AddSourceButton view={view} kind={ref.kind} />
                        ) : null}
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
                        {source ? (
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
                        fields={
                            <ExploreBody
                                // Its live or in-development switch belongs to one model.
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
 * ponytail: not virtualised; only native YAML projects get here, so add it if one reaches thousands of models.
 */
const CodeRail: FC<{
    projectUuid: string;
    files: string[];
    selected: string | null;
    drafted: Set<string>;
    onOpen: (file: string) => void;
}> = ({ projectUuid, files, selected, drafted, onOpen }) => (
    <Box className={classes.rail}>
        <Box className={classes.treeScroll}>
            {files.map((file) => (
                <Box
                    key={file}
                    component="button"
                    className={classes.fileRow}
                    data-selected={file === selected}
                    onClick={() => onOpen(file)}
                >
                    <MantineIcon icon={IconFileCode} size={14} color="dimmed" />
                    <Text truncate className={classes.treeLabel} title={file}>
                        {file}.yml
                    </Text>
                    <DraftMarker
                        projectUuid={projectUuid}
                        model={file}
                        isMine={drafted.has(file)}
                    />
                </Box>
            ))}
        </Box>
    </Box>
);

const FILE_PARAM = 'file';

const BUILD_MODEL_PROMPT =
    'Look through my warehouse and suggest the first model and metrics to add.';

export const WorkbenchView: FC<SemanticStudioProps> = (props) => {
    const view = useSemanticStudio(props);
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
    const { data: draft } = useSemanticLayerDraft(view.project.id);
    useDraftFreshness(view.project.id);
    const { data: project } = useProject(view.project.id);
    const chat = useSemanticStudioChat(view.project.id);
    const { startNewThread } = useStudioAgent(view.project.id);
    const [isChatOpen, setIsChatOpen] = useChatOpen();
    const [askedPrompt, setAskedPrompt] = useState<string | null>(null);
    const [hasStarted, setHasStarted] = useState(false);
    const hasDraft = (draft?.changes.length ?? 0) > 0;
    // With nothing live, what the draft adds is the page.
    const isBuildingFirstModel = isEmpty && hasDraft;
    // With changes to check and nothing else asked for, the changes are the page.
    const isDefaultView =
        view.selected === null && searchParams.get(VIEW_PARAM) === null;
    const isReviewingDraft =
        isBuildingFirstModel ||
        (hasDraft &&
            (searchParams.get(DRAFT_PARAM) === DRAFT_REVIEW || isDefaultView));
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
        () => new Set(draft?.models.map(({ model }) => model)),
        [draft],
    );
    // A dbt project has no draft and no model code here: its files are in its repository.
    const keepsDraft = useKeepsSemanticLayerDraft(view.project.id);
    const pullRequest = useStudioPullRequest(view.project.id);
    const development = !keepsDraft && pullRequest?.isOpen ? pullRequest : null;
    const pendingChange = useStudioPendingChange(view.project.id);
    const saving = keepsDraft ? null : pendingChange;
    const [isTryingChanges, setIsTryingChanges] = useDevelopmentView();
    // A dbt project's changes are tried through its pull request's preview, so there is nothing to try once that closes.
    const hasClosedPullRequest =
        !keepsDraft && !!pullRequest?.ciChecks && !pullRequest.isOpen;
    useEffect(() => {
        if (hasClosedPullRequest && isTryingChanges) setIsTryingChanges(false);
    }, [hasClosedPullRequest, isTryingChanges, setIsTryingChanges]);
    const isCode =
        chat.isAvailable &&
        keepsDraft &&
        searchParams.get(VIEW_PARAM) === 'code';
    // When a save lands, the workspace opens its diff, so the change is reviewed where it was asked for.
    const wasSaving = useRef(false);
    useEffect(() => {
        if (wasSaving.current && !saving && development) {
            setSearchParams({ [VIEW_PARAM]: 'changes' });
        }
        wasSaving.current = !!saving;
    }, [saving, development, setSearchParams]);
    const proposal = useStudioProposal(view.project.id);
    const hasProposal = !keepsDraft && proposal.length > 0;
    // A dbt project's changes are its conversation's: what it proposes, and what its pull request holds.
    const isChanges =
        !keepsDraft &&
        (!!development || hasProposal) &&
        (searchParams.get(VIEW_PARAM) === 'changes' || isDefaultView);
    const hasChanges = keepsDraft
        ? hasDraft && !isBuildingFirstModel
        : !!development || hasProposal;
    const { data: workspaces } = useStudioWorkspaces(view.project.id);
    const workspaceAction = useStudioWorkspaceAction(view.project.id);
    const activeWorkspace = useSyncStudioWorkspace(
        view.project.id,
        hasChanges || !!saving,
    );
    const [storedThread, setStoredThread] = useStoredStudioThread(
        view.project.id,
    );
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const routeWorkspaceUuid = parseSemanticStudioWorkspaceUuid(pathname);
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
    // The workspace this page is about: the one in the link, else the one the open chat belongs to.
    const shownWorkspace =
        routeWorkspace ??
        activeWorkspace ??
        allWorkspaces.find(
            ({ threadUuid, isMine }) =>
                isMine && threadUuid === storedThread?.threadUuid,
        ) ??
        null;
    const hasWorkspaces = allWorkspaces.length > 0;
    const openWorkspace = useCallback(
        (
            target: (typeof allWorkspaces)[number],
            { navigateTo }: { navigateTo: boolean },
        ) => {
            if (!target.isMine) return;
            if (target.agentUuid) {
                setStoredThread({
                    threadUuid: target.threadUuid,
                    agentUuid: target.agentUuid,
                });
            }
            if (!target.isActive && !target.finishedAt) {
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
        [navigate, setStoredThread, view.project.id, workspaceAction],
    );
    // A link to one of your workspaces opens it, here and in the chat.
    const openedFromRoute = useRef<string | null>(null);
    useEffect(() => {
        if (!routeWorkspace || openedFromRoute.current === routeWorkspaceUuid)
            return;
        openedFromRoute.current = routeWorkspaceUuid;
        openWorkspace(routeWorkspace, { navigateTo: false });
    }, [routeWorkspace, routeWorkspaceUuid, openWorkspace]);
    const isMerged =
        !!pullRequest?.ciChecks?.merged ||
        shownWorkspace?.pullRequest?.state === 'merged';
    const stage = ((): StudioStage | null => {
        if (saving) return { step: 'saving' };
        if (development) {
            return {
                step: 'in_review',
                pullRequestNumber: pullRequestNumberOf(development.prUrl),
            };
        }
        if (isMerged) return { step: 'live' };
        if (hasProposal || (keepsDraft && hasDraft && !isBuildingFirstModel)) {
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
        if (shownWorkspace?.finishedAt) return { step: 'live' };
        return null;
    })();
    // A new proposal opens the changes, like a save does.
    const proposalKey = hasProposal ? proposal.join('\n') : null;
    const lastProposalKey = useRef(proposalKey);
    useEffect(() => {
        if (proposalKey && proposalKey !== lastProposalKey.current) {
            setSearchParams({ [VIEW_PARAM]: 'changes' });
        }
        lastProposalKey.current = proposalKey;
    }, [proposalKey, setSearchParams]);
    // The workspace the conversation made, named for where its changes stand.
    const pullRequestNumber = /\/(\d+)\/?$/.exec(development?.prUrl ?? '')?.[1];
    const workspace = saving
        ? { name: 'Saving', hint: 'The change is being saved.' }
        : development
          ? {
                name: pullRequestNumber
                    ? `Pull request #${pullRequestNumber}`
                    : 'Pull request',
                hint: 'Not live until it merges.',
            }
          : hasProposal
            ? {
                  name: 'Proposed change',
                  hint: 'Not saved yet. Open the pull request from the chat to save it.',
              }
            : keepsDraft && hasDraft && !isBuildingFirstModel
              ? {
                    name: 'Draft',
                    hint: 'Only you see these changes until you publish them.',
                }
              : null;
    // Only models with YAML here have a file: a deployed model's YAML lives where it was deployed from.
    const { data: stored } = useSemanticLayerStoredModels(
        view.project.id,
        isCode,
    );
    const files = useMemo(
        () => [...new Set([...drafted, ...(stored?.models ?? [])])].sort(),
        [drafted, stored],
    );
    const requestedFile = searchParams.get(FILE_PARAM);
    const file =
        files.find((name) => name === requestedFile) ??
        files.find((name) => name === openExplore) ??
        files.at(0) ??
        null;
    const switchView = (next: string) => {
        if (next === 'code') {
            setSearchParams({ [VIEW_PARAM]: 'code' });
        } else if (next === 'changes') {
            setSearchParams(
                keepsDraft
                    ? { [DRAFT_PARAM]: DRAFT_REVIEW }
                    : { [VIEW_PARAM]: 'changes' },
            );
        } else if (requestedFile && modelled.includes(requestedFile)) {
            view.select({ type: 'explore', exploreId: requestedFile });
        } else {
            // Named, since with changes to check the bare page shows those.
            setSearchParams(hasChanges ? { [VIEW_PARAM]: 'models' } : {});
        }
    };

    const hasWarehouse = !!project?.warehouseConnection;
    const canBuildFirstModel =
        isEmpty && hasWarehouse && chat.isAvailable && keepsDraft;
    const canNudge =
        chat.isAvailable && keepsDraft && hasWarehouse && modelled.length === 0;
    const pane = ((): Pane => {
        if (searchParams.get(VIEW_PARAM) === 'workspaces') return 'workspaces';
        if (isCode) return 'code';
        if (isChanges) return 'changes';
        if (isReviewingDraft) return 'review';
        if (!isEmpty) return 'browse';
        if (!canBuildFirstModel) return 'empty';
        return chat.hasThread || hasStarted ? 'buildFirst' : 'intro';
    })();
    // Reviewing changes takes the full width: the tree is for browsing models.
    const isReviewPane =
        pane === 'changes' || pane === 'review' || pane === 'workspaces';
    // Live is what is published; Changes is everything in flight, and an open change gets its own bar.
    const isChangesView = isReviewPane;
    const isChangeOpen =
        (pane === 'changes' || pane === 'review') &&
        !!(shownWorkspace || workspace);
    const hasChangesTab = hasWorkspaces || hasChanges || !!saving;
    const runs = useStudioRuns(view.project.id, workspaces?.mine ?? [], saving);
    const waitingOnYou = runs.filter(({ run }) => needsYou(run)).length;
    // What waits on you wins, then a save under way, then how many are in flight.
    const changesBadge =
        waitingOnYou > 0 ? (
            <span
                className={classes.tabBadge}
                data-tone="attention"
                aria-label={`${waitingOnYou} need you`}
            >
                {waitingOnYou}
            </span>
        ) : saving ? (
            <span className={classes.busyDot} aria-label="Saving" />
        ) : runs.length > 0 ? (
            <span className={classes.tabBadge}>{runs.length}</span>
        ) : null;
    const showLive = () => {
        setIsTryingChanges(false);
        switchView('models');
    };
    const showChanges = () =>
        hasWorkspaces
            ? setSearchParams({ [VIEW_PARAM]: 'workspaces' })
            : switchView('changes');
    const startNewChange = () => {
        startNewThread();
        setIsTryingChanges(false);
        setIsChatOpen(true);
        void navigate(getSemanticStudioUrl(view.project.id, { ref: null }));
    };
    // What the chat is told the person has open: in the code view that is the file, not the page behind it.
    const openModel = isCode
        ? { modelName: file, fieldName: searchParams.get(FIELD_PARAM) }
        : {
              modelName: openExplore,
              fieldName:
                  view.selected?.type === 'field'
                      ? view.selected.fieldId
                      : null,
          };
    const openChat = () => {
        setHasStarted(true);
        setIsChatOpen(true);
    };
    const [attached, setAttached] = useState<StudioChatRef[]>([]);
    const attachToChat = (ref: StudioChatRef) => {
        setAttached((current) =>
            current.some((item) => sameStudioChatRef(item, ref))
                ? current
                : [...current, ref],
        );
        openChat();
    };
    const askFirst = (prompt: string) => {
        openChat();
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
            {keepsDraft && !isBuildingFirstModel ? (
                <DraftDevelopmentBar projectUuid={view.project.id} />
            ) : null}
            {chat.isAvailable && !isChatOpen && !keepsDraft ? (
                <Button
                    size="xs"
                    variant="default"
                    flex="none"
                    leftSection={<MantineIcon icon={IconMessage} size={14} />}
                    onClick={() => setIsChatOpen(true)}
                >
                    Chat
                </Button>
            ) : null}
        </Group>
    );
    const changeName = shownWorkspace?.name ?? workspace?.name;
    const goBack = hasWorkspaces ? showChanges : showLive;
    // The open change heads its own column, so its name, progress and diff share one edge.
    const changeHeader = (
        <header className={classes.changeHeader}>
            <UnstyledButton className={classes.back} onClick={goBack}>
                <MantineIcon icon={IconArrowLeft} size={14} />
                {hasWorkspaces ? 'All changes' : 'Back to live'}
            </UnstyledButton>
            <div className={classes.changeTitleRow}>
                <Tooltip
                    label={workspace?.hint ?? 'What this change does'}
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
                {changeActions}
            </div>
            <div className={classes.changeMeta}>
                {stage ? <StudioStageLine stage={stage} /> : null}
                {shownWorkspace ? (
                    <Text component="span" fz="xs" c="dimmed">
                        Updated {dayjs(shownWorkspace.updatedAt).fromNow()}
                    </Text>
                ) : null}
            </div>
        </header>
    );

    const renderPaneWithChat = () => (
        <AddToStudioChatContext.Provider
            value={chat.isAvailable ? attachToChat : null}
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
                        pullRequest={development}
                        proposal={hasProposal ? proposal : []}
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
                    />
                );
            case 'code':
                return file ? (
                    <ModelCodeView
                        key={file}
                        projectUuid={view.project.id}
                        modelName={file}
                        fieldName={searchParams.get(FIELD_PARAM)}
                    />
                ) : !stored ? null : (
                    <Text fz="sm" c="dimmed" ta="center" py="xl">
                        {modelled.length > 0
                            ? 'These models were deployed from elsewhere, so their YAML is not here. Ask the agent for a new model and its YAML shows up here.'
                            : 'No models yet. Ask the agent to build one and its YAML shows up here.'}
                    </Text>
                );
            case 'review':
                return draft ? (
                    <>
                        {/* The toolbar's bar carries this except while a first model is being built, when it is hidden. */}
                        {isBuildingFirstModel ? (
                            <DraftReviewHeading
                                projectUuid={view.project.id}
                                draft={draft}
                            />
                        ) : null}
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
            case 'intro':
                return <BuildFirstModel view={view} onAsk={askFirst} />;
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
        <LiveSourceManager
            projectUuid={view.project.id}
            enabled={view.permissions.live}
            onRemoved={() =>
                view.select({ type: 'kind', kind: 'live' }, { replace: true })
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
                        !chat.isAvailable || !isChatOpen || pane === 'intro'
                    }
                >
                    {pane === 'intro' ? null : (
                        <SemanticStudioAgent
                            projectUuid={view.project.id}
                            {...openModel}
                            attached={attached}
                            onAttach={attachToChat}
                            onDetach={(ref) =>
                                setAttached((current) =>
                                    current.filter(
                                        (item) => !sameStudioChatRef(item, ref),
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
                        {pane === 'intro' ||
                        !chat.isAvailable ||
                        // A dbt project has nothing to put here until its conversation has a pull request.
                        (!keepsDraft &&
                            !development &&
                            !saving &&
                            !hasProposal &&
                            !hasWorkspaces &&
                            isChatOpen) ? null : (
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
                                            aria-selected={!isChangesView}
                                            onClick={showLive}
                                        >
                                            <span className={classes.liveDot} />
                                            Live
                                        </UnstyledButton>
                                        {hasChangesTab ? (
                                            <UnstyledButton
                                                role="tab"
                                                className={classes.view}
                                                aria-selected={isChangesView}
                                                onClick={showChanges}
                                            >
                                                Changes
                                                {changesBadge}
                                            </UnstyledButton>
                                        ) : null}
                                    </div>
                                    <Group
                                        gap="xs"
                                        wrap="nowrap"
                                        miw={0}
                                        ml="auto"
                                    >
                                        {keepsDraft && !isChangeOpen ? (
                                            <Tooltip
                                                label={
                                                    isCode
                                                        ? 'Back to models'
                                                        : 'Read the YAML'
                                                }
                                            >
                                                <ActionIcon
                                                    size="md"
                                                    variant={
                                                        isCode
                                                            ? 'light'
                                                            : 'default'
                                                    }
                                                    aria-label="Code"
                                                    aria-pressed={isCode}
                                                    onClick={() =>
                                                        switchView(
                                                            isCode
                                                                ? 'models'
                                                                : 'code',
                                                        )
                                                    }
                                                >
                                                    <MantineIcon
                                                        icon={IconCode}
                                                    />
                                                </ActionIcon>
                                            </Tooltip>
                                        ) : null}
                                        {keepsDraft ? (
                                            !isChatOpen ? (
                                                <Button
                                                    size="xs"
                                                    variant="default"
                                                    flex="none"
                                                    onClick={() =>
                                                        setIsChatOpen(true)
                                                    }
                                                >
                                                    Build
                                                </Button>
                                            ) : null
                                        ) : (
                                            <Button
                                                size="xs"
                                                variant="default"
                                                flex="none"
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconPlus}
                                                        size={14}
                                                    />
                                                }
                                                onClick={startNewChange}
                                            >
                                                New change
                                            </Button>
                                        )}
                                    </Group>
                                </Group>
                                {isChangeOpen && pane === 'review' ? (
                                    <Group
                                        className={classes.changeBar}
                                        wrap="nowrap"
                                        gap="sm"
                                    >
                                        <Tooltip
                                            label={
                                                hasWorkspaces
                                                    ? 'All changes'
                                                    : 'Back to live'
                                            }
                                        >
                                            <ActionIcon
                                                variant="subtle"
                                                color="gray"
                                                size="md"
                                                aria-label={
                                                    hasWorkspaces
                                                        ? 'All changes'
                                                        : 'Back to live'
                                                }
                                                onClick={
                                                    hasWorkspaces
                                                        ? showChanges
                                                        : showLive
                                                }
                                            >
                                                <MantineIcon
                                                    icon={IconArrowLeft}
                                                />
                                            </ActionIcon>
                                        </Tooltip>
                                        <Tooltip
                                            label={
                                                workspace?.hint ??
                                                'What this change does'
                                            }
                                        >
                                            <Text
                                                className={classes.changeName}
                                            >
                                                {shownWorkspace?.name ??
                                                    workspace?.name}
                                            </Text>
                                        </Tooltip>
                                        {stage ? (
                                            <Box className={classes.stageLine}>
                                                <StudioStageLine
                                                    stage={stage}
                                                />
                                            </Box>
                                        ) : null}
                                        {changeActions}
                                    </Group>
                                ) : null}
                            </>
                        )}
                        <Box
                            className={classes.workspaceBody}
                            data-no-rail={
                                isReviewPane || (pane !== 'code' && isEmpty)
                            }
                        >
                            {pane === 'code' ? (
                                <CodeRail
                                    projectUuid={view.project.id}
                                    files={files}
                                    selected={file}
                                    drafted={drafted}
                                    onOpen={(next) =>
                                        setSearchParams({
                                            [VIEW_PARAM]: 'code',
                                            [FILE_PARAM]: next,
                                        })
                                    }
                                />
                            ) : isEmpty || isReviewPane ? null : (
                                <Rail
                                    view={view}
                                    expanded={expanded}
                                    drafted={drafted}
                                    onToggle={toggle}
                                    onOpen={open}
                                />
                            )}
                            {pane === 'browse' ? (
                                renderPaneWithChat()
                            ) : (
                                <Box
                                    className={classes.main}
                                    data-full={
                                        pane === 'code' || pane === 'changes'
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
    );
};
