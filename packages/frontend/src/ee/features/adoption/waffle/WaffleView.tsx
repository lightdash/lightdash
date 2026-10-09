import {
    type DepartmentWithMetrics,
    type OrganizationAdoptionSummary,
} from '@lightdash/common';
import { Box, Paper, Stack, Text } from '@mantine/core';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import mapStyles from '../map/AdoptionMap.module.css';
import { AdoptionViewHeader } from '../map/AdoptionViewHeader';
import {
    COLOUR_TRANSITION,
    startColourTransition,
    type ColourTransition,
} from '../map/colourTransition';
import { type ColourBy, type DotKind } from '../map/geometry';
import { MapInspector } from '../map/MapInspector';
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
    getDepartmentBreakdown,
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
    onEdit: (department: DepartmentWithMetrics) => void;
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

const WaffleLegend: FC<{
    colourBy: ColourBy;
    counts: Map<DotKind, number>;
    isOverLimit: boolean;
}> = ({ colourBy, counts, isOverLimit }) => (
    <Stack gap={6} className={mapStyles.footer}>
        <ul className={mapStyles.legend} aria-label="Legend">
            {LEGEND_KINDS[colourBy].map((kind) => (
                <li key={kind} className={mapStyles.legendItem}>
                    <Box
                        component="span"
                        className={`${styles.mark} ${styles.swatch}`}
                        data-kind={kind}
                        aria-hidden
                    />
                    <Text fz="xs">{DOT_LABELS[kind]}</Text>
                    <Text fz="xs" c="dimmed" className={mapStyles.count}>
                        {formatCount(counts.get(kind) ?? 0)}
                    </Text>
                </li>
            ))}
        </ul>
        <Text fz="xs" c="dimmed">
            Legend counts people placed in a department
        </Text>
        {isOverLimit && (
            <Text fz="xs" c="dimmed">
                {`Departments are drawn as bars above ${formatCount(SQUARE_LIMIT)} people`}
            </Text>
        )}
        <Text fz="xs" c="dimmed">
            {isOverLimit
                ? 'Select a department to see its numbers'
                : 'One square per person. Select a department to see its numbers'}
        </Text>
    </Stack>
);

// Every top-level department as a block sized by headcount, its sub-departments stacked inside, and one square per
// person grouped by colour. Selecting a block shows its department in the panel, as selecting a circle on the map does
export const WaffleView: FC<Props> = ({ summary, canManage, onEdit }) => {
    const { departments } = summary;
    const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
    const [colourBy, setColourBy] = useState<ColourBy>('active');
    const { ref, width } = useContainerSize(FALLBACK_SIZE);

    const byUuid = useMemo(
        () => new Map(departments.map((d) => [d.departmentUuid, d])),
        [departments],
    );
    // A department deleted while selected falls back to the whole organization
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

    // The legend counts the people drawn, from the same numbers as the panel; the panel shows the selection
    const organizationBreakdown = useMemo(
        () => getOrganizationBreakdown(departments),
        [departments],
    );
    const legendCounts = useMemo(
        () => getLegendCounts(organizationBreakdown, parts, colourBy, null),
        [organizationBreakdown, parts, colourBy],
    );
    const breakdown = useMemo(
        () =>
            selected === null
                ? organizationBreakdown
                : getDepartmentBreakdown(selected),
        [selected, organizationBreakdown],
    );
    const rows = useMemo(
        () =>
            getCoverageRows(
                getVisibleDepartments(departments, selectedDepartmentUuid),
            ),
        [departments, selectedDepartmentUuid],
    );

    const select = useCallback((departmentUuid: string | null) => {
        setSelectedUuid(departmentUuid);
    }, []);
    const clearMember = useCallback(() => {}, []);

    // A breadcrumb that becomes the current one is redrawn as text, so focus moves to the new current crumb
    const currentCrumbRef = useRef<HTMLParagraphElement | null>(null);
    const shouldFocusCrumbRef = useRef(false);
    const selectFromCrumb = (departmentUuid: string | null) => {
        shouldFocusCrumbRef.current = true;
        select(departmentUuid);
    };
    useEffect(() => {
        if (!shouldFocusCrumbRef.current) return;
        shouldFocusCrumbRef.current = false;
        currentCrumbRef.current?.focus();
    }, [selectedDepartmentUuid]);

    const topUuid = trail[0]?.departmentUuid ?? null;
    // Within the selected department's block, the block itself or the part holding the selection
    const markedInBlock =
        topUuid === null ? null : (trail[1]?.departmentUuid ?? topUuid);

    return (
        // The map's root sets the colours the panel's bars and keys share with the dots and squares
        <Stack gap="md" className={mapStyles.root}>
            <AdoptionViewHeader
                label="Selected department"
                trail={trail}
                currentUuid={selectedDepartmentUuid}
                currentCrumbRef={currentCrumbRef}
                onCrumbClick={selectFromCrumb}
                colourBy={colourBy}
                onColourByChange={setColourBy}
            />

            <Box className={mapStyles.body}>
                <Paper className={`${mapStyles.frame} ${styles.frame}`}>
                    <Box
                        ref={ref}
                        className={styles.canvas}
                        __vars={{ '--waffle-height': px(layout.height) }}
                    >
                        {layout.blocks.length === 0 ? (
                            <Box className={mapStyles.message}>
                                <Text fz="sm" c="dimmed">
                                    No people or headcount in this department
                                    yet
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
                                                block.departmentUuid === topUuid
                                                    ? selectedDepartmentUuid
                                                    : null
                                            }
                                            markedUuid={
                                                block.departmentUuid === topUuid
                                                    ? markedInBlock
                                                    : null
                                            }
                                            onSelect={select}
                                        />
                                    );
                                })}
                            </Box>
                        )}
                        {/* Empty but for the band that crosses the waffle while its colouring changes */}
                        <Box ref={bandLayerRef} className={styles.bandLayer} />
                    </Box>
                    <WaffleLegend
                        colourBy={colourBy}
                        counts={legendCounts}
                        isOverLimit={layout.isOverLimit}
                    />
                </Paper>
                <MapInspector
                    department={selected}
                    parentName={trail[trail.length - 2]?.name ?? null}
                    breakdown={breakdown}
                    rows={rows}
                    member={null}
                    canManage={canManage}
                    onDepartmentClick={select}
                    onClearMember={clearMember}
                    onEdit={onEdit}
                />
            </Box>
        </Stack>
    );
};
