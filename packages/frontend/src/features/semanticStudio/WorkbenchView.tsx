/**
 * Semantic Layer: the tree on the left and the page beside it, at the width
 * settings pages use. Every page lives there: a kind, a source, a folder or
 * an explore and its fields. Breadcrumbs lead back up; fields open in a
 * modal.
 */
import {
    Anchor,
    Box,
    Breadcrumbs,
    Center,
    Group,
    Loader,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { IconChevronRight, IconSearch } from '@tabler/icons-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type KeyboardEvent,
} from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import {
    ancestorKeys,
    containerOf,
    findNode,
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
    AddSourceButton,
    EmptyProject,
    FieldDetailModal,
    FieldList,
    FieldListToolbar,
    NodeIcon,
    SearchResultsList,
    SettingsLink,
} from './shared';
import { useExploreFields } from './useExploreFields';
import {
    useFieldListState,
    useProjectSearch,
    useSemanticStudio,
    type SemanticStudioProps,
    type ViewModel,
} from './useSemanticStudio';
import classes from './WorkbenchView.module.css';

const ROW_HEIGHT = 28;

const Tree: FC<{
    view: ViewModel;
    expanded: Set<string>;
    onToggle: (key: string) => void;
    onSelect: (node: TreeNode) => void;
}> = ({ view, expanded, onToggle, onSelect }) => {
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
                                {node.label}
                            </Text>
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
    const {
        fields: loaded,
        isLoading,
        error,
    } = useExploreFields({
        projectUuid: view.project.id,
        explore,
        source,
        canManageLive: view.permissions.live,
    });
    const allFields = useMemo(() => loaded ?? [], [loaded]);
    const { fields, toolbarProps } = useFieldListState(allFields, openFieldId);
    const isLive = source.kind === 'live';
    const openField = openFieldId
        ? allFields.find(({ id }) => id === openFieldId)
        : undefined;
    const closeField = () =>
        view.select({ type: 'explore', exploreId }, { replace: true });
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
            <FieldList
                view={view}
                explore={explore}
                fields={fields}
                showUsage={isLive}
                openFieldId={openFieldId}
                toolbar={
                    <FieldListToolbar {...toolbarProps} showInUse={isLive} />
                }
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
                    onClose={closeField}
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
}> = ({ view, onOpen, onOpenNode }) => {
    const selected = view.selected;
    const ref = selected ? containerOf(selected) : null;
    const node = ref ? findNode(view.tree.nodes, nodeKey(ref)) : undefined;
    const nodes = node ? node.children : view.tree.nodes;
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
    const trail = node ? trailTo(view.tree.nodes, node.key) : [];
    // A page sits under its parent.
    const crumbs = trail.slice(0, -1);
    const showCrumbs = ref !== null;

    const title = node?.label ?? view.project.name;
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
                        >
                            {title}
                        </Title>
                    </Group>
                    <Group gap={4} wrap="nowrap" flex="none">
                        {ref?.type === 'kind' ? (
                            <AddSourceButton view={view} kind={ref.kind} />
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
                {explore ? (
                    <ExploreBody
                        key={explore.id}
                        view={view}
                        exploreId={explore.id}
                        openFieldId={openFieldId}
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
 * The left rail: title, search and the tree. The search lives here, so
 * typing re-renders only the rail, never the page beside it. The search box
 * drives the results: arrows move, Enter opens, Esc clears.
 */
const Rail: FC<{
    view: ViewModel;
    expanded: Set<string>;
    onToggle: (key: string) => void;
    onOpen: (ref: NodeRef) => void;
}> = ({ view, expanded, onToggle, onOpen }) => {
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
            <Group
                className={classes.railHeader}
                justify="space-between"
                wrap="nowrap"
            >
                <Box
                    component="button"
                    className={classes.railTitle}
                    onClick={() => view.select(null)}
                >
                    Semantic Layer
                </Box>
                <AddSourceButton view={view} />
            </Group>
            <Box className={classes.railSearch}>
                <TextInput
                    size="xs"
                    placeholder="Search explores and fields"
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
                    onToggle={onToggle}
                    onSelect={(node) => view.select(node.ref)}
                />
            )}
        </Box>
    );
};

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

    return (
        <Box className={classes.shell}>
            <Rail
                view={view}
                expanded={expanded}
                onToggle={toggle}
                onOpen={open}
            />
            {isEmpty ? (
                <Box className={classes.main}>
                    <EmptyProject view={view} />
                </Box>
            ) : (
                <MainPane
                    view={view}
                    onOpen={(ref) => (ref ? open(ref) : view.select(null))}
                    onOpenNode={openNode}
                />
            )}
        </Box>
    );
};
