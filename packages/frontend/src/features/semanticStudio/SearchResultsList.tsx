import { Box, Stack, Text } from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useEffect, useMemo, useRef, type FC } from 'react';
import {
    searchResultId,
    type NodeRef,
    type Project,
    type SearchResult,
} from './model';
import classes from './SearchResultsList.module.css';
import { NodeIcon } from './shared';
import sharedClasses from './shared.module.css';
import { type ProjectSearch } from './useProjectSearch';
import { type ViewModel } from './useSemanticStudio';

// ---------------------------------------------------------------------------
// Search results: grouped, in tree order, with where each one lives

const RESULT_HEIGHT = 44;
const RESULT_SHORT_HEIGHT = 32;
const RESULT_HEADER_HEIGHT = 30;

type ResultRow =
    | { type: 'header'; label: string }
    | { type: 'result'; result: SearchResult; index: number };

/** The matched part of a label, in the text colour; the rest stays quiet. */
const Highlight: FC<{ text: string; query: string }> = ({ text, query }) => {
    const needle = query.trim().toLowerCase();
    const at = needle ? text.toLowerCase().indexOf(needle) : -1;
    if (at < 0) return <>{text}</>;
    const end = at + needle.length;
    return (
        <>
            {text.slice(0, at)}
            <span className={classes.match}>{text.slice(at, end)}</span>
            {text.slice(end)}
        </>
    );
};

/** One search result; memoised, so typing only redraws rows that change. */
const ResultRow = memo<{
    project: Project;
    result: SearchResult;
    index: number;
    top: number;
    height: number;
    active: boolean;
    selected: boolean;
    query: string;
    onOpen: (nodeRef: NodeRef) => void;
}>(
    ({
        project,
        result,
        index,
        top,
        height,
        active,
        selected,
        query,
        onOpen,
    }) => {
        return (
            <Box
                id={searchResultId(index)}
                role="option"
                aria-selected={active}
                className={classes.resultRow}
                data-active={active}
                data-selected={selected}
                top={top}
                h={height}
                onClick={() => onOpen(result.ref)}
            >
                <Box className={classes.resultIcon}>
                    <NodeIcon
                        project={project}
                        nodeRef={result.ref}
                        fieldKind={result.fieldKind}
                        size={14}
                    />
                </Box>
                <Box miw={0}>
                    <Text className={classes.resultLabel} truncate>
                        <Highlight text={result.label} query={query} />
                    </Text>
                    {/* The nearest two levels say where it is. */}
                    {result.path.length > 0 ? (
                        <Text className={classes.resultPath} truncate>
                            {result.path.slice(-2).join(' / ')}
                        </Text>
                    ) : null}
                </Box>
            </Box>
        );
    },
    // Each search pass builds new result objects; compare what is shown.
    (prev, next) =>
        prev.result.key === next.result.key &&
        prev.result.label === next.result.label &&
        prev.result.path.join('/') === next.result.path.join('/') &&
        prev.result.fieldKind === next.result.fieldKind &&
        prev.project === next.project &&
        prev.index === next.index &&
        prev.top === next.top &&
        prev.height === next.height &&
        prev.active === next.active &&
        prev.selected === next.selected &&
        prev.query === next.query &&
        prev.onOpen === next.onOpen,
);

export const SearchResultsList: FC<{
    view: ViewModel;
    search: ProjectSearch;
    /** The keyboard cursor, driven from the search input. */
    activeIndex: number;
    onOpen: (nodeRef: NodeRef) => void;
}> = ({ view, search, activeIndex, onOpen }) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const { results, total } = search.results;
    const rows = useMemo(
        () =>
            results.reduce<ResultRow[]>((acc, result, index) => {
                if (results[index - 1]?.group !== result.group) {
                    acc.push({ type: 'header', label: result.group });
                }
                acc.push({ type: 'result', result, index });
                return acc;
            }, []),
        [results],
    );
    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (index) => {
            const row = rows[index];
            if (row.type === 'header') return RESULT_HEADER_HEIGHT;
            return row.result.path.length > 0
                ? RESULT_HEIGHT
                : RESULT_SHORT_HEIGHT;
        },
        overscan: 10,
    });
    // Follow the keyboard cursor. Only when it moves: new results start at
    // the top anyway, and scrolling on every keystroke costs a render.
    const rowsRef = useRef(rows);
    useEffect(() => {
        rowsRef.current = rows;
    }, [rows]);
    useEffect(() => {
        const rowIndex = rowsRef.current.findIndex(
            (row) => row.type === 'result' && row.index === activeIndex,
        );
        if (rowIndex >= 0) virtualizer.scrollToIndex(rowIndex);
    }, [activeIndex, virtualizer]);

    if (results.length === 0) {
        return search.isSearchingFields ? (
            <Stack className={classes.searchEmpty} gap={4}>
                <Text fz="sm" c="dimmed">
                    Searching…
                </Text>
            </Stack>
        ) : (
            <Stack className={classes.searchEmpty} gap={4}>
                <Text fz="sm">No matches</Text>
                <Text fz="xs" c="dimmed">
                    Try a source, folder, explore or field name.
                </Text>
            </Stack>
        );
    }
    return (
        <Box
            ref={parentRef}
            className={classes.searchScroll}
            id="semantic-search-results"
            role="listbox"
            aria-label="Search results"
        >
            <Box
                className={sharedClasses.fieldListInner}
                h={virtualizer.getTotalSize()}
            >
                {virtualizer.getVirtualItems().map((item) => {
                    const row = rows[item.index];
                    if (row.type === 'header') {
                        return (
                            <Text
                                key={`header-${row.label}`}
                                className={classes.resultHeader}
                                top={item.start}
                                role="presentation"
                            >
                                {row.label}
                            </Text>
                        );
                    }
                    const { result, index } = row;
                    return (
                        <ResultRow
                            key={result.key}
                            project={view.project}
                            result={result}
                            index={index}
                            top={item.start}
                            height={item.size}
                            active={index === activeIndex}
                            selected={result.key === view.selectedKey}
                            query={search.query}
                            onOpen={onOpen}
                        />
                    );
                })}
            </Box>
            {total > results.length ? (
                <Text className={classes.resultMore}>
                    First {results.length} of {total.toLocaleString()}. Keep
                    typing to narrow it down.
                </Text>
            ) : null}
        </Box>
    );
};
