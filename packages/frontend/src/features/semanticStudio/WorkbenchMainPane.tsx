import {
    Anchor,
    Box,
    Breadcrumbs,
    Center,
    Group,
    Loader,
    Text,
    Title,
} from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useContext, useEffect, useMemo, useRef, type FC } from 'react';
import { useNavigate } from 'react-router';
import { LiveSourceBetaBadge } from '../externalConnections/liveSources/LiveSourceBetaBadge';
import { DraftMarksContext } from './draftMarks';
import { useExternalSourceActions } from './externalSources/externalSourceActions';
import {
    ExternalSourceHeaderActions,
    ExternalSourceSummary,
    ExternalSourcesTable,
} from './externalSources/ExternalSourcesView';
import { useManagedExternalSource } from './externalSources/useManagedExternalSource';
import { JoinDiagram } from './JoinDiagram';
import { useLiveSourceActions } from './liveSources/liveSourceActions';
import {
    LiveSourceHeaderActions,
    LiveSourceSummary,
    LiveSourcesTable,
} from './liveSources/LiveSourcesView';
import { useManagedLiveSource } from './liveSources/useManagedLiveSource';
import {
    containerOf,
    fieldGroups,
    findNode,
    pageNodes,
    getExplore,
    getSource,
    nodeKey,
    summaryOf,
    trailTo,
    type NodeRef,
    type TreeNode,
} from './model';
import {
    CHANGE_KIND_LABELS,
    describeFieldChanges,
    getModelCodeSearch,
} from './modelCode';
import { ModelMark } from './ModelMark';
import { ModelTabs } from './ModelTabs';
import {
    FieldDetailModal,
    FieldList,
    FieldListToolbar,
    NodeIcon,
    SemanticLayerNudge,
    SettingsLink,
} from './shared';
import { useAddToStudioChat, startStudioChatRefDrag } from './studioChatRefs';
import { getSemanticStudioUrl } from './urls';
import { useExploreFields } from './useExploreFields';
import {
    useSemanticLayerDraft,
    useSemanticLayerModel,
} from './useSemanticLayerModel';
import { useFieldListState, type ViewModel } from './useSemanticStudio';
import { findCheckedOutModel, useStudioCheckout } from './useStudioCheckout';
import classes from './WorkbenchView.module.css';

const CHILD_ROW_HEIGHT = 40;

/** Every child of the selection, virtualised: a folder can hold thousands. */
const ChildrenList: FC<{
    view: ViewModel;
    nodes: TreeNode[];
    onOpen: (node: TreeNode) => void;
}> = ({ view, nodes, onOpen }) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const { kinds } = useContext(DraftMarksContext);
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
                        const kind =
                            node.ref.type === 'explore'
                                ? kinds.get(node.ref.exploreId)
                                : undefined;
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
                                    {kind ? (
                                        <Text
                                            className={classes.changeTag}
                                            data-change={kind}
                                        >
                                            {CHANGE_KIND_LABELS[kind]}
                                        </Text>
                                    ) : null}
                                    {node.ref.type === 'explore' ? (
                                        <ModelMark model={node.ref.exploreId} />
                                    ) : null}
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
    const marks = useContext(DraftMarksContext);
    const review = marks.inReview.get(exploreId);
    const published = marks.published.get(exploreId);
    // Fields just published keep their mark, as they had it in the draft.
    const allFields = useMemo(
        () =>
            (loaded ?? []).map((field) => {
                const change = field.draftState
                    ? undefined
                    : published?.find(
                          ({ kind, name }) =>
                              name === field.name && kind === field.fieldKind,
                      );
                return change && change.change !== 'removed'
                    ? { ...field, draftState: change.change }
                    : field;
            }),
        [loaded, published],
    );
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
            {/* A pull request's fields are not on this page yet; a publish marks its own fields below. */}
            {review ? (
                <Group gap="xs" mb="sm" wrap="nowrap">
                    <ModelMark model={exploreId} />
                    <Text fz="xs" c="dimmed">
                        {`${describeFieldChanges(review.fields) || 'Changed'}. Not published until the pull request merges.`}
                    </Text>
                </Group>
            ) : null}
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
                revealFieldId={
                    published
                        ? (fields.find(({ draftState }) => draftState)?.id ??
                          null)
                        : null
                }
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

export const MainPane: FC<{
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
                                    fieldKind: null,
                                    fieldType: null,
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
