import { type PreAggregateMaterializationSummary } from '@lightdash/common';
import { Box, Text, TextInput, Tooltip } from '@mantine/core';
import {
    IconBolt,
    IconChevronRight,
    IconFileCode,
    IconListDetails,
    IconSearch,
} from '@tabler/icons-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    Fragment,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type KeyboardEvent,
} from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { AddSourceButton } from './AddSourceButton';
import { DraftMarksContext } from './draftMarks';
import { LineCounts } from './LineCounts';
import {
    containerOf,
    flattenTree,
    nodeKey,
    searchResultId,
    type NodeRef,
    type TreeNode,
} from './model';
import { CHANGE_KIND_LABELS } from './modelCode';
import { getPreAggregateStatus } from './preAggregateSummary';
import { SearchResultsList } from './SearchResultsList';
import { NodeIcon } from './shared';
import { useAddToStudioChat, startStudioChatRefDrag } from './studioChatRefs';
import { useProjectSearch } from './useProjectSearch';
import { type ViewModel } from './useSemanticStudio';
import classes from './WorkbenchView.module.css';

const ROW_HEIGHT = 28;

/** Says whose unpublished work a model has: this person's, someone else's, or both. */
const DraftMarker: FC<{ model: string; isMine: boolean }> = ({
    model,
    isMine,
}) => {
    const marks = useContext(DraftMarksContext);
    const others = marks.others.get(model) ?? [];
    if (!isMine && others.length === 0) {
        if (marks.inReview.has(model)) {
            return (
                <Tooltip label="Your changes to this model are in an open pull request. Not published yet.">
                    <Box className={classes.draftDot} data-mark="review" />
                </Tooltip>
            );
        }
        return marks.published.has(model) ? (
            <Tooltip label="You published changes to this model.">
                <Box className={classes.draftDot} data-mark="published" />
            </Tooltip>
        ) : null;
    }
    const whose = [...(isMine ? ['you'] : []), ...others].join(', ');
    const kind = isMine ? marks.kinds.get(model) : undefined;
    return (
        <Tooltip
            label={`${kind ? `${CHANGE_KIND_LABELS[kind]} in a draft` : 'Draft'} by ${whose}. Not published yet.`}
        >
            <Box
                className={classes.draftDot}
                data-change={kind}
                data-others={!isMine || undefined}
            />
        </Tooltip>
    );
};

/** A model's name as this person's draft leaves it, so the list and the review say the same thing. */
const ModelLabel: FC<{ model: string; label: string }> = ({ model, label }) =>
    useContext(DraftMarksContext).labels.get(model) ?? label;

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
                                    fieldKind: null,
                                    fieldType: null,
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

/**
 * The left rail: search, add and the tree. The search lives here, so
 * typing re-renders only the rail, never the page beside it. The search box
 * drives the results: arrows move, Enter opens, Esc clears.
 */
export const Rail: FC<{
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

const sumLineCounts = (
    counts: Map<string, { additions: number; deletions: number }>,
) =>
    [...counts.values()].reduce(
        (total, { additions, deletions }) => ({
            additions: total.additions + additions,
            deletions: total.deletions + deletions,
        }),
        { additions: 0, deletions: 0 },
    );

/**
 * The Code view's rail: every model with YAML behind it, and any the draft adds.
 * Not virtualised; only native YAML projects get here, so add it if one reaches thousands of models.
 */
export const CodeRail: FC<{
    files: string[];
    /** The draft's overview, listed first; null with no draft. */
    overview: { isOpen: boolean; onOpen: () => void } | null;
    selected: string | null;
    /** Lines the draft adds to and removes from each file it changes. */
    lineCounts: Map<string, { additions: number; deletions: number }>;
    /** The pre-aggregate open in the file, so its row reads as selected and not the file's. */
    selectedPart: string | null;
    preAggregates: Map<string, PreAggregateMaterializationSummary[]>;
    onOpen: (file: string, part: string | null) => void;
}> = ({
    files,
    overview,
    selected,
    selectedPart,
    lineCounts,
    preAggregates,
    onOpen,
}) => (
    <Box className={classes.rail}>
        {/* Above the files and apart from them: it is the whole change, not one more file. */}
        {overview ? (
            <Box className={classes.railOverview}>
                <Box
                    component="button"
                    className={classes.fileRow}
                    data-selected={overview.isOpen}
                    onClick={overview.onOpen}
                >
                    <MantineIcon
                        icon={IconListDetails}
                        size={14}
                        color="dimmed"
                    />
                    <Text className={classes.treeLabel}>Overview</Text>
                    <LineCounts counts={sumLineCounts(lineCounts)} />
                </Box>
            </Box>
        ) : null}
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
                        <LineCounts counts={lineCounts.get(file) ?? null} />
                        {/* The counts already say the file is in your draft. */}
                        <DraftMarker model={file} isMine={false} />
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
