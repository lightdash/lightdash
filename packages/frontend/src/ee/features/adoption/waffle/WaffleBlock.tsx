import { Box, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { memo, type FC } from 'react';
import { type ColourTransition } from '../map/colourTransition';
import { getDotSegments, type ColourBy } from '../map/geometry';
import { type WaffleSquare } from './groupSquares';
import { type BlockLayout, type PartLayout } from './layout';
import styles from './Waffle.module.css';
import {
    describeCounts,
    formatCounts,
    formatPartLabel,
    type WaffleBlockData,
    type WafflePart,
} from './waffleBlocks';
import { WaffleSquares } from './WaffleSquares';

const TOOLTIP_EVENTS = { hover: true, focus: true, touch: false };
const TOOLTIP_MAX_WIDTH = 280;
const NO_SQUARES: WaffleSquare[] = [];

const px = (value: number): string => `${value}px`;

type Props = {
    block: WaffleBlockData;
    layout: BlockLayout;
    squaresByPart: Map<string, WaffleSquare[]>;
    colourBy: ColourBy;
    transition: ColourTransition;
    // Who may add a headcount, which decides how a department without one asks for it
    canManage: boolean;
    // The selected department when it is in this block, else null
    selectedUuid: string | null;
    // What shows the selection in this block: the block itself, or the part holding the selected department
    markedUuid: string | null;
    onSelect: (departmentUuid: string) => void;
};

const TooltipLabel: FC<{ name: string; counts: string }> = ({
    name,
    counts,
}) => (
    <>
        {name}
        <br />
        {counts}
    </>
);

// Where the squares would be under 3 px, one bar of the part's people in legend order
const PartBar: FC<{ part: WafflePart; colourBy: ColourBy }> = ({
    part,
    colourBy,
}) => (
    <Box component="span" className={styles.bar}>
        {getDotSegments(part.people, colourBy)
            .filter((segment) => segment.count > 0)
            .map((segment) => (
                <Box
                    component="span"
                    key={segment.kind}
                    className={styles.mark}
                    data-kind={segment.kind}
                    flex={`${segment.count} 1 0`}
                />
            ))}
    </Box>
);

const PartContent: FC<{
    part: WafflePart;
    layout: PartLayout;
    squares: WaffleSquare[];
    colourBy: ColourBy;
    transition: ColourTransition;
}> = ({ part, layout, squares, colourBy, transition }) => {
    const { content, grid } = layout;
    return (
        <>
            {layout.isLabelled && part.name !== null && (
                <Text
                    component="span"
                    fz="xs"
                    c="dimmed"
                    truncate
                    className={styles.label}
                >
                    {formatPartLabel(part)}
                </Text>
            )}
            <Box
                component="span"
                className={styles.content}
                data-squares={part.id}
                aria-hidden
                __vars={{
                    '--content-x': px(content.x),
                    '--content-y': px(content.y),
                    '--content-width': px(content.width),
                    '--content-height': px(content.height),
                    '--cell':
                        grid.kind === 'squares' ? px(grid.cell) : undefined,
                }}
            >
                {grid.kind === 'squares' && (
                    <WaffleSquares
                        squares={squares}
                        grid={grid}
                        transition={transition}
                    />
                )}
                {grid.kind === 'bar' && (
                    <PartBar part={part} colourBy={colourBy} />
                )}
            </Box>
        </>
    );
};

// A top-level department: its name and counts over its parts. The block and each sub-department are buttons that
// select their department; the people directly in it, and a department's only part, select the block's
export const WaffleBlock = memo<Props>(
    ({
        block,
        layout,
        squaresByPart,
        colourBy,
        transition,
        canManage,
        selectedUuid,
        markedUuid,
        onSelect,
    }) => {
        const counts = formatCounts(
            block.memberCount,
            block.headcount,
            block.activeCount,
            canManage,
        );
        const isSelected = selectedUuid === block.departmentUuid;
        const isMarked = markedUuid === block.departmentUuid;
        const partsById = new Map(block.parts.map((part) => [part.id, part]));
        return (
            <Box
                className={styles.block}
                __vars={{
                    '--block-x': px(layout.x),
                    '--block-y': px(layout.y),
                    '--block-width': px(layout.width),
                    '--block-height': px(layout.height),
                }}
            >
                <Tooltip
                    label={<TooltipLabel name={block.name} counts={counts} />}
                    multiline
                    maw={TOOLTIP_MAX_WIDTH}
                    events={TOOLTIP_EVENTS}
                >
                    <UnstyledButton
                        className={styles.blockButton}
                        aria-label={describeCounts(
                            block.name,
                            block.memberCount,
                            block.headcount,
                            block.activeCount,
                        )}
                        aria-current={isSelected ? 'true' : undefined}
                        data-selected={isMarked || undefined}
                        // No headcount on the department or below it: dashed, as the map draws its circle
                        data-no-headcount={
                            block.headcount === null || undefined
                        }
                        onClick={() => onSelect(block.departmentUuid)}
                    />
                </Tooltip>
                <Box className={styles.header} aria-hidden>
                    <Text fz="sm" fw={600} truncate className={styles.name}>
                        {block.name}
                    </Text>
                    <Text fz="xs" c="dimmed" truncate className={styles.counts}>
                        {counts}
                    </Text>
                </Box>
                {layout.parts.map((partLayout) => {
                    const part = partsById.get(partLayout.id);
                    if (!part) return null;
                    const vars = {
                        '--part-x': px(partLayout.x),
                        '--part-y': px(partLayout.y),
                        '--part-width': px(partLayout.width),
                        '--part-height': px(partLayout.height),
                    };
                    const content = (
                        <PartContent
                            part={part}
                            layout={partLayout}
                            squares={squaresByPart.get(part.id) ?? NO_SQUARES}
                            colourBy={colourBy}
                            transition={transition}
                        />
                    );
                    if (part.kind !== 'department') {
                        return (
                            <Box
                                key={part.id}
                                className={styles.part}
                                data-passive
                                __vars={vars}
                            >
                                {content}
                            </Box>
                        );
                    }
                    const { metrics } = part.people;
                    const isPartSelected = selectedUuid === part.departmentUuid;
                    // A part also shows a selection made deeper inside it, from the panel
                    const isPartMarked = markedUuid === part.departmentUuid;
                    return (
                        <Tooltip
                            key={part.id}
                            label={
                                <TooltipLabel
                                    name={part.name}
                                    counts={formatCounts(
                                        metrics.memberCount,
                                        part.people.headcount,
                                        metrics.activeCount30d,
                                        canManage,
                                    )}
                                />
                            }
                            multiline
                            maw={TOOLTIP_MAX_WIDTH}
                            events={TOOLTIP_EVENTS}
                        >
                            <UnstyledButton
                                className={`${styles.part} ${styles.partButton}`}
                                __vars={vars}
                                aria-label={describeCounts(
                                    part.name,
                                    metrics.memberCount,
                                    part.people.headcount,
                                    metrics.activeCount30d,
                                )}
                                aria-current={
                                    isPartSelected ? 'true' : undefined
                                }
                                data-selected={isPartMarked || undefined}
                                data-no-headcount={
                                    part.people.headcount === null || undefined
                                }
                                onClick={() => onSelect(part.departmentUuid)}
                            >
                                {content}
                            </UnstyledButton>
                        </Tooltip>
                    );
                })}
            </Box>
        );
    },
);
WaffleBlock.displayName = 'WaffleBlock';
