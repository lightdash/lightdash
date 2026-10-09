import { type OrganizationAdoptionSummary } from '@lightdash/common';
import { Box, Paper, Stack, Text } from '@mantine/core';
import { useLayoutEffect, useMemo, useRef, type FC } from 'react';
import mapStyles from '../map/AdoptionMap.module.css';
import { AdoptionViewHeader } from '../map/AdoptionViewHeader';
import {
    COLOUR_TRANSITION,
    startColourTransition,
    type ColourTransition,
} from '../map/colourTransition';
import { type ColourBy, type DotKind } from '../map/geometry';
import { MapInspector } from '../map/MapInspector';
import { RingSwatch } from '../map/MapLegend';
import { DOT_LABELS, LEGEND_KINDS } from '../map/mapStyles';
import {
    getFocusTrail,
    getLegendCounts,
    getVisibleDepartments,
} from '../map/mapView';
import { useContainerSize } from '../map/useContainerSize';
import { formatCount } from '../utils/format';
import {
    getCoverageRows,
    getOrganizationBreakdown,
} from '../utils/peopleBreakdown';
import { type SweepPoint } from '../utils/sweepDelay';
import {
    chooseTransition,
    getDrawnSquares,
    getPartPeople,
    groupSquares,
    type WafflePerson,
    type WaffleSquare,
} from './groupSquares';
import {
    getSquareOffset,
    layoutWaffle,
    MIN_HEIGHT,
    SQUARE_LIMIT,
    type WaffleLayout,
} from './layout';
import styles from './Waffle.module.css';
import { WaffleBlock } from './WaffleBlock';
import { buildWaffleBlocks, type WafflePart } from './waffleBlocks';

// Used only where the container cannot be measured; the height follows the content
const FALLBACK_SIZE = { width: 720, height: MIN_HEIGHT };

const px = (value: number): string => `${value}px`;

type Props = {
    summary: OrganizationAdoptionSummary;
    canManage: boolean;
    // The department selected on the page, shown below the waffle as it becomes a strip; null for the whole
    // organization
    selectedUuid: string | null;
    onSelect: (departmentUuid: string | null) => void;
    colourBy: ColourBy;
    onColourByChange: (colourBy: ColourBy) => void;
};

type DrawnPeople = {
    layout: WaffleLayout;
    partsById: Map<string, WafflePart>;
    peopleByPart: Map<string, WafflePerson[]>;
    squaresByPart: Map<string, WaffleSquare[]>;
};

// Every square on the board in the order of its part's elements, with its centre in the drawing and, for a reflow,
// its place in its part under the previous colouring
const collectSquares = (
    board: HTMLElement,
    { layout, partsById, peopleByPart, squaresByPart }: DrawnPeople,
    previous: ColourBy,
    transition: ColourTransition,
) => {
    const marks: Element[] = [];
    const points: SweepPoint[] = [];
    const previousIndexes: number[] | null =
        transition === 'reflow' ? [] : null;
    const containers = new Map(
        Array.from(
            board.querySelectorAll<HTMLElement>('[data-squares]'),
            (element) => [element.dataset.squares, element],
        ),
    );
    layout.blocks.forEach((block) =>
        block.parts.forEach(({ id, x, y, content, grid }) => {
            const container = containers.get(id);
            const part = partsById.get(id);
            const people = peopleByPart.get(id);
            const squares = squaresByPart.get(id);
            if (
                grid.kind !== 'squares' ||
                !container ||
                !part ||
                !people ||
                !squares
            ) {
                return;
            }
            const before =
                previousIndexes === null
                    ? null
                    : new Map(
                          groupSquares(people, previous, part.size).map(
                              (square) => [square.key, square.position],
                          ),
                      );
            getDrawnSquares(squares, transition).forEach(
                ({ square }, index) => {
                    const element = container.children.item(index);
                    if (element === null) return;
                    const offset = getSquareOffset(grid, square.position);
                    marks.push(element);
                    points.push({
                        x: block.x + x + content.x + offset.x + grid.cell / 2,
                        y: block.y + y + content.y + offset.y + grid.cell / 2,
                    });
                    previousIndexes?.push(
                        before?.get(square.key) ?? square.position,
                    );
                },
            );
        }),
    );
    return { marks, points, previousIndexes };
};

// The waffle's mark for a kind of person, keying its legend, the panel's bar beside it and the selected department's
export const WaffleSwatch: FC<{ kind: DotKind }> = ({ kind }) => (
    <Box
        component="span"
        className={`${styles.mark} ${styles.swatch}`}
        data-kind={kind}
        aria-hidden
    />
);

// Why every department is drawn as a bar, where every one is
type BarReason = 'overLimit' | 'tooSmall';

const BAR_NOTES: Record<BarReason, string> = {
    overLimit: `Departments are drawn as bars above ${formatCount(SQUARE_LIMIT)} people`,
    tooSmall:
        'Departments are drawn as bars, as one square per person would be too small to see',
};

const WaffleLegend: FC<{
    colourBy: ColourBy;
    counts: Map<DotKind, number>;
    barReason: BarReason | null;
    hasNoHeadcount: boolean;
}> = ({ colourBy, counts, barReason, hasNoHeadcount }) => (
    <Stack gap={6} className={mapStyles.footer}>
        <ul className={mapStyles.legend} aria-label="Legend">
            {LEGEND_KINDS[colourBy].map((kind) => (
                <li key={kind} className={mapStyles.legendItem}>
                    <WaffleSwatch kind={kind} />
                    <Text fz="xs">{DOT_LABELS[kind]}</Text>
                    <Text fz="xs" c="dimmed" className={mapStyles.count}>
                        {formatCount(counts.get(kind) ?? 0)}
                    </Text>
                </li>
            ))}
            {hasNoHeadcount && (
                <li className={mapStyles.legendItem}>
                    <RingSwatch variant="noHeadcount" />
                    <Text fz="xs">No headcount set</Text>
                </li>
            )}
        </ul>
        <Text fz="xs" c="dimmed">
            Legend counts people placed in a department
        </Text>
        {barReason !== null && (
            <Text fz="xs" c="dimmed">
                {BAR_NOTES[barReason]}
            </Text>
        )}
        <Text fz="xs" c="dimmed">
            {barReason === null
                ? 'One square per person. Select a department to see its numbers'
                : 'Select a department to see its numbers'}
        </Text>
    </Stack>
);

// Where a selection is drawn: the part of a sub-department selected, else its department's block
const getSelectionBox = (
    layout: WaffleLayout,
    blockId: string | null,
    partId: string | null,
): { y: number; height: number } | null => {
    const block = layout.blocks.find((each) => each.id === blockId);
    if (block === undefined) return null;
    const part =
        partId === blockId
            ? undefined
            : block.parts.find((each) => each.id === partId);
    return part === undefined
        ? { y: block.y, height: block.height }
        : { y: block.y + part.y, height: part.height };
};

// Every top-level department as a block sized by headcount, its sub-departments stacked inside, and one square per
// person grouped by colour. Selecting a block selects its department, as selecting a circle on the map does
export const WaffleView: FC<Props> = ({
    summary,
    canManage,
    selectedUuid,
    onSelect,
    colourBy,
    onColourByChange,
}) => {
    const { departments } = summary;
    // A selected department is shown below the waffle, which becomes a strip with no panel beside it
    const isStrip = selectedUuid !== null;
    // Measured again as the strip comes or goes, before paint, so the squares are placed once at the new width
    const { ref, width } = useContainerSize(
        FALLBACK_SIZE,
        isStrip ? 'strip' : 'full',
    );

    const byUuid = useMemo(
        () => new Map(departments.map((d) => [d.departmentUuid, d])),
        [departments],
    );
    // A department deleted while selected, or one not in the organization, falls back to the whole organization
    const selected =
        selectedUuid === null ? null : (byUuid.get(selectedUuid) ?? null);
    const selectedDepartmentUuid = selected?.departmentUuid ?? null;
    const trail = useMemo(
        () => getFocusTrail(departments, selectedDepartmentUuid),
        [departments, selectedDepartmentUuid],
    );

    const blocks = useMemo(() => buildWaffleBlocks(departments), [departments]);
    const blocksById = useMemo(
        () => new Map(blocks.map((block) => [block.departmentUuid, block])),
        [blocks],
    );
    const layout = useMemo(
        () =>
            layoutWaffle({
                blocks: blocks.map((block) => ({
                    id: block.departmentUuid,
                    size: block.size,
                    parts: block.parts.map((part) => ({
                        id: part.id,
                        size: part.size,
                        hasName: part.name !== null,
                    })),
                })),
                width,
            }),
        [blocks, width],
    );
    // Reflow only where few enough squares move; otherwise the sweep, for the keys and the change alike
    const transition = chooseTransition(COLOUR_TRANSITION, layout.squareCount);
    const parts = useMemo(
        () => blocks.flatMap((block) => block.parts),
        [blocks],
    );
    const partsById = useMemo(
        () => new Map(parts.map((part) => [part.id, part])),
        [parts],
    );
    // Made once for each set of counts, so a change of colouring only gives the same people new places
    const peopleByPart = useMemo(
        () =>
            new Map(
                layout.isOverLimit
                    ? []
                    : parts.map((part) => [
                          part.id,
                          getPartPeople(part.id, part.people.metrics),
                      ]),
            ),
        [parts, layout.isOverLimit],
    );
    const squaresByPart = useMemo(
        () =>
            new Map(
                parts.flatMap((part) => {
                    const people = peopleByPart.get(part.id);
                    return people === undefined
                        ? []
                        : [
                              [
                                  part.id,
                                  groupSquares(people, colourBy, part.size),
                              ],
                          ];
                }),
            ),
        [parts, peopleByPart, colourBy],
    );

    const boardRef = useRef<HTMLDivElement | null>(null);
    const bandLayerRef = useRef<HTMLDivElement | null>(null);
    // The colouring the squares were last drawn in; nothing else that changes them is animated
    const drawnColourByRef = useRef(colourBy);
    // Runs once React has drawn the new colours and before the browser works them out, so each square waits for the
    // change to reach it. New data or a new size during a change ends it, so they show at once
    useLayoutEffect(() => {
        const previous = drawnColourByRef.current;
        if (previous === colourBy) return undefined;
        drawnColourByRef.current = colourBy;
        const board = boardRef.current;
        const bandLayer = bandLayerRef.current;
        if (!board || !bandLayer) return undefined;
        // Only a reflow moves people and needs their places before the change; otherwise every place keeps its square
        const { marks, points, previousIndexes } = collectSquares(
            board,
            { layout, partsById, peopleByPart, squaresByPart },
            previous,
            transition,
        );
        return startColourTransition(
            {
                layer: board,
                marks,
                points,
                area: { width, height: layout.height },
                bandLayer,
                previousIndexes,
            },
            transition,
        );
    }, [
        colourBy,
        layout,
        partsById,
        peopleByPart,
        squaresByPart,
        width,
        transition,
    ]);

    // The legend and the panel count the whole organization as the map's legend and panel do, each person once from
    // the placed splits
    const breakdown = useMemo(
        () => getOrganizationBreakdown(summary, colourBy),
        [summary, colourBy],
    );
    const legendCounts = useMemo(() => getLegendCounts(breakdown), [breakdown]);
    const rows = useMemo(
        () =>
            getCoverageRows(getVisibleDepartments(departments, null), colourBy),
        [departments, colourBy],
    );

    // Every department a bar: above 20,000 people, or wherever no part has room for its squares
    const barReason: BarReason | null =
        layout.squareCount > 0 ||
        !layout.blocks.some((block) =>
            block.parts.some((part) => part.grid.kind === 'bar'),
        )
            ? null
            : layout.isOverLimit
              ? 'overLimit'
              : 'tooSmall';
    // A block or a sub-department drawn dashed, as it has no headcount on it or below it
    const hasNoHeadcount = parts.some(
        (part) => part.kind !== 'direct' && part.people.headcount === null,
    );

    const topUuid = trail[0]?.departmentUuid ?? null;
    // Within the selected department's block, the block itself or the part holding the selection
    const markedInBlock =
        topUuid === null ? null : (trail[1]?.departmentUuid ?? topUuid);

    // A strip shows the selection in its middle, or from the top where the selection is taller than the strip. It
    // scrolls again only when the selection moves, so new numbers leave a strip the person scrolled where it is
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const selectionBox = isStrip
        ? getSelectionBox(layout, topUuid, markedInBlock)
        : null;
    const selectionTop = selectionBox?.y ?? null;
    const selectionHeight = selectionBox?.height ?? 0;
    useLayoutEffect(() => {
        const scroller = scrollRef.current;
        if (!scroller) return;
        const centred =
            selectionTop === null
                ? 0
                : selectionTop - (scroller.clientHeight - selectionHeight) / 2;
        scroller.scrollTop = Math.max(0, Math.min(selectionTop ?? 0, centred));
    }, [selectionTop, selectionHeight]);

    return (
        // The map's root sets the colours the panel's bars and keys share with the dots and squares
        <Stack gap="md" className={mapStyles.root}>
            <AdoptionViewHeader
                label="Position in the waffle"
                isOrganization={!isStrip}
                colourBy={colourBy}
                onColourByChange={onColourByChange}
            />

            <Box className={mapStyles.body} data-strip={isStrip || undefined}>
                <Paper className={`${mapStyles.frame} ${styles.frame}`}>
                    <Box
                        ref={scrollRef}
                        className={styles.scroller}
                        data-strip={isStrip || undefined}
                    >
                        <Box
                            ref={ref}
                            className={styles.canvas}
                            __vars={{ '--waffle-height': px(layout.height) }}
                        >
                            {layout.blocks.length === 0 ? (
                                <Box className={mapStyles.message}>
                                    <Text fz="sm" c="dimmed">
                                        No people or headcount in this
                                        department yet
                                    </Text>
                                </Box>
                            ) : (
                                <Box
                                    ref={boardRef}
                                    className={styles.board}
                                    role="group"
                                    aria-label="Departments in the waffle"
                                >
                                    {layout.blocks.map((blockLayout) => {
                                        const block = blocksById.get(
                                            blockLayout.id,
                                        );
                                        if (!block) return null;
                                        return (
                                            <WaffleBlock
                                                key={block.departmentUuid}
                                                block={block}
                                                layout={blockLayout}
                                                squaresByPart={squaresByPart}
                                                colourBy={colourBy}
                                                transition={transition}
                                                selectedUuid={
                                                    block.departmentUuid ===
                                                    topUuid
                                                        ? selectedDepartmentUuid
                                                        : null
                                                }
                                                markedUuid={
                                                    block.departmentUuid ===
                                                    topUuid
                                                        ? markedInBlock
                                                        : null
                                                }
                                                isDimmed={
                                                    topUuid !== null &&
                                                    block.departmentUuid !==
                                                        topUuid
                                                }
                                                canManage={canManage}
                                                onSelect={onSelect}
                                            />
                                        );
                                    })}
                                </Box>
                            )}
                            {/* Empty but for the band that crosses the waffle while its colouring changes */}
                            <Box
                                ref={bandLayerRef}
                                className={styles.bandLayer}
                            />
                        </Box>
                    </Box>
                    <WaffleLegend
                        colourBy={colourBy}
                        counts={legendCounts}
                        barReason={barReason}
                        hasNoHeadcount={hasNoHeadcount}
                    />
                </Paper>
                {!isStrip && (
                    <MapInspector
                        breakdown={breakdown}
                        rows={rows}
                        canManage={canManage}
                        keySwatch={WaffleSwatch}
                        onDepartmentClick={onSelect}
                    />
                )}
            </Box>
        </Stack>
    );
};
