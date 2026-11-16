import { memo, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { KIND_LABELS, KIND_ORDER, markAttr, type ColourBy, type Mark } from '../model';
import { startColourSweep } from '../map/colourTransition';
import { type MapTeam } from '../map/PeopleMap';
import { getSquareOffset, layoutWaffle, type BlockLayout, type PartLayout, type WaffleGrid } from './layout';

const px = (value: number): string => `${value}px`;

// One element per mark, moved into its place rather than laid out by the page. Each place keeps its element and
// only its colour changes, which is what lets the sweep fade it.
const Squares = memo<{
    marks: Mark[];
    grid: Extract<WaffleGrid, { kind: 'squares' }>;
    colourBy: ColourBy;
    teamId: string;
}>(({ marks, grid, colourBy, teamId }) => (
    <>
        {marks.map((mark, index) => {
            const { x, y } = getSquareOffset(grid, index);
            return (
                <span
                    // eslint-disable-next-line react/no-array-index-key
                    key={index}
                    className="ad-mark ad-square"
                    data-kind={markAttr(colourBy, mark.kind)}
                    data-person={mark.person ? `${teamId}:${index}` : undefined}
                    style={{ transform: `translate(${x}px, ${y}px)` }}
                />
            );
        })}
    </>
));
Squares.displayName = 'Squares';

// Where the squares would be under 3 px, one bar of the team's people in legend order
const Bar = ({ marks, colourBy }: { marks: Mark[]; colourBy: ColourBy }) => (
    <span className="ad-bar">
        {KIND_ORDER[colourBy].map((kind) => {
            const count = marks.filter((mark) => mark.kind === kind).length;
            return count > 0 ? (
                <span key={kind} className="ad-mark" data-kind={markAttr(colourBy, kind)} style={{ flex: `${count} 1 0` }} />
            ) : null;
        })}
    </span>
);

const Block = memo<{
    team: MapTeam;
    layout: BlockLayout;
    part: PartLayout | undefined;
    colourBy: ColourBy;
    isSelected: boolean;
    isDimmed: boolean;
    isStatic: boolean;
    onSelect: (teamId: string) => void;
}>(({ team, layout, part, colourBy, isSelected, isDimmed, isStatic, onSelect }) => (
    <div
        className="ad-block"
        data-dimmed={isDimmed || undefined}
        style={{ left: px(layout.x), top: px(layout.y), width: px(layout.width), height: px(layout.height) }}
    >
        <button
            type="button"
            className="ad-block-button"
            aria-label={`${team.name}: ${team.caption}`}
            title={`${team.name}\n${team.caption}`}
            data-selected={isSelected || undefined}
            data-no-team={team.isNoTeam || undefined}
            disabled={isStatic}
            onClick={() => onSelect(team.id)}
        />
        <div className="ad-block-header" aria-hidden>
            <div className="ad-block-name">{team.name}</div>
            <div className="ad-block-counts">{team.caption}</div>
        </div>
        {part && (
            <div
                className="ad-part"
                style={{ left: px(part.x), top: px(part.y), width: px(part.width), height: px(part.height) }}
            >
                <span
                    className="ad-part-content"
                    data-squares={team.id}
                    aria-hidden
                    style={{
                        left: px(part.content.x),
                        top: px(part.content.y),
                        width: px(part.content.width),
                        height: px(part.content.height),
                        ['--cell' as string]: part.grid.kind === 'squares' ? px(part.grid.cell) : undefined,
                    }}
                >
                    {part.grid.kind === 'squares' && (
                        <Squares marks={team.marks} grid={part.grid} colourBy={colourBy} teamId={team.id} />
                    )}
                    {part.grid.kind === 'bar' && <Bar marks={team.marks} colourBy={colourBy} />}
                </span>
            </div>
        )}
    </div>
));
Block.displayName = 'Block';

type Props = {
    width: number;
    // The squares shrink so the waffle is never taller than this
    maxHeight?: number;
    teams: MapTeam[];
    colourBy: ColourBy;
    selectedId: string | null;
    isFocused: boolean;
    onSelect: (teamId: string) => void;
};

export const WaffleView = ({ width, maxHeight, teams, colourBy, selectedId, isFocused, onSelect }: Props) => {
    const boardRef = useRef<HTMLDivElement | null>(null);
    const bandRef = useRef<HTMLDivElement | null>(null);
    const drawnColourByRef = useRef(colourBy);
    const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
    const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
    const sizes = teams.map((team) => `${team.id}:${team.marks.length}`).join('|');
    const layout = useMemo(
        () =>
            layoutWaffle({
                width,
                maxHeight,
                blocks: teams.map((team) => ({
                    id: team.id,
                    size: team.marks.length,
                    parts: [{ id: team.id, size: team.marks.length, hasName: false }],
                })),
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [sizes, width, maxHeight],
    );

    // React draws the new colours first and the delays are written here, before the browser works them out
    useLayoutEffect(() => {
        if (drawnColourByRef.current === colourBy) return undefined;
        drawnColourByRef.current = colourBy;
        const board = boardRef.current;
        const bandLayer = bandRef.current;
        if (!board || !bandLayer) return undefined;
        const marks: Element[] = [];
        const points: { x: number; y: number }[] = [];
        layout.blocks.forEach((block) =>
            block.parts.forEach((part) => {
                if (part.grid.kind !== 'squares') return;
                const { grid } = part;
                const holder = board.querySelector(`[data-squares="${CSS.escape(part.id)}"]`);
                if (!holder) return;
                Array.from(holder.children).forEach((square, index) => {
                    const offset = getSquareOffset(grid, index);
                    marks.push(square);
                    points.push({
                        x: block.x + part.x + part.content.x + offset.x,
                        y: block.y + part.y + part.content.y + offset.y,
                    });
                });
            }),
        );
        return startColourSweep({ layer: board, marks, points, area: { width, height: layout.height }, bandLayer, blank: false });
    }, [colourBy, layout, width]);

    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const { target } = event;
        const key = target instanceof HTMLElement ? target.dataset.person : undefined;
        if (!key) {
            setTip(null);
            return;
        }
        const split = key.lastIndexOf(':');
        const mark = teamsById.get(key.slice(0, split))?.marks[Number(key.slice(split + 1))];
        setTip(
            mark?.person
                ? {
                      x: event.clientX,
                      y: event.clientY,
                      text: `${mark.person.name} · ${KIND_LABELS[colourBy][mark.kind]}${mark.shared ? ' · in more than one team' : ''}`,
                  }
                : null,
        );
    };
    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
        const { target } = event;
        const key = target instanceof HTMLElement ? target.dataset.person : undefined;
        if (key && !isFocused) onSelect(key.slice(0, key.lastIndexOf(':')));
    };

    return (
        <div className="ad-waffle" style={{ height: px(layout.height) }}>
            <div
                ref={boardRef}
                className="absolute inset-0"
                onPointerMove={handlePointerMove}
                onPointerLeave={() => setTip(null)}
                onClick={handleClick}
            >
                {layout.blocks.map((block) => {
                    const team = teamsById.get(block.id);
                    if (!team) return null;
                    return (
                        <Block
                            key={block.id}
                            team={team}
                            layout={block}
                            part={block.parts[0]}
                            colourBy={colourBy}
                            isSelected={!isFocused && selectedId === team.id}
                            isDimmed={false}
                            isStatic={isFocused}
                            onSelect={onSelect}
                        />
                    );
                })}
            </div>
            <div ref={bandRef} className="ad-sweep-layer" />
            {tip && (
                <div className="ad-tip" style={{ left: tip.x, top: tip.y }}>
                    {tip.text}
                </div>
            )}
        </div>
    );
};
