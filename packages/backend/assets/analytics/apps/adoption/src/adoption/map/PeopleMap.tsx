import { select, zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from 'd3';
import { Minus, Plus } from 'lucide-react';
import {
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type MouseEvent,
    type PointerEvent,
} from 'react';
import { Button } from '@/components/ui/button';
import { KIND_LABELS, markAttr, type ColourBy, type Mark } from '../model';
import { startColourSweep } from './colourTransition';
import {
    fitToArea,
    getSharedDotShape,
    layoutDots,
    type PackedCircle,
} from './geometry';
import {
    getHoverLabel,
    getLabelLines,
    getRestLabels,
    makeWayForHoverLabel,
    measureText,
    TEXT_FONTS,
    type CircleLabel,
    type LabelText,
} from './labels';

const MAX_ZOOM = 12;
const ZOOM_STEP = 1.6;
// A press that travels further than this is a drag, not a selection
const CLICK_SLOP_PX = 5;
const HALO_PX = 3.5;
// A ring for someone who never came is drawn a little smaller than a filled dot
const RING_ONLY_SCALE = 0.78;

// Drawn as a ring rather than a filled dot, so they differ from the filled dots in lightness, not only in hue
const OUTLINED = new Set(['usage-f0', 'activity-never', 'role-viewer']);
// Filled, with a darker edge of their own hue that keeps them apart from the light circle fill
const EDGED = new Set<string>();
const SMALLER = new Set(['usage-f0', 'activity-never']);

export type MapTeam = {
    id: string;
    name: string;
    people: number;
    isNoTeam: boolean;
    marks: Mark[];
    // The line under the name
    caption: string;
};

type MapDot = {
    key: string;
    teamId: string;
    x: number;
    y: number;
    r: number;
    mark: Mark;
    attr: string;
};

type View = { transform: ZoomTransform; isAnimated: boolean };

// A plain wheel scrolls the page; zooming takes Ctrl or ⌘, which is also how a trackpad pinch arrives.
// One finger scrolls the page at the reset view and moves the map once it is zoomed in.
const isZoomGesture = (
    event: { type: string; ctrlKey: boolean; metaKey: boolean; button?: number; touches?: { length: number } },
    currentScale: number,
): boolean => {
    if (event.type === 'wheel') return event.ctrlKey || event.metaKey;
    if (event.type.startsWith('touch')) {
        return (event.touches?.length ?? 0) > 1 || currentScale > 1;
    }
    return !event.button && !event.ctrlKey;
};

const getDotShape = (dot: MapDot) => {
    const room = SMALLER.has(dot.attr) ? dot.r * RING_ONLY_SCALE : dot.r;
    if (!dot.mark.shared) return { dotRadius: room, ring: null };
    const { dotRadius, ringRadius, ringWidth } = getSharedDotShape(room);
    return { dotRadius, ring: { radius: ringRadius, width: ringWidth } };
};

const CirclesLayer = memo<{
    circles: PackedCircle[];
    teams: Map<string, MapTeam>;
    selectedId: string | null;
    isStatic: boolean;
}>(({ circles, teams, selectedId, isStatic }) => (
    <>
        {circles.map((circle) => (
            <circle
                key={circle.id}
                className="ad-circle"
                data-circle={circle.id}
                data-no-team={teams.get(circle.id)?.isNoTeam || undefined}
                data-highlighted={circle.id === selectedId || undefined}
                data-static={isStatic || undefined}
                cx={circle.x}
                cy={circle.y}
                r={circle.r}
            />
        ))}
    </>
));
CirclesLayer.displayName = 'CirclesLayer';

const DotsLayer = memo<{ dots: MapDot[] }>(({ dots }) => (
    <>
        {dots.map((dot, index) => {
            const outerRadius = getDotShape(dot).dotRadius;
            // A ring's stroke, or a filled dot's thinner edge, drawn inside the dot's footprint
            const strokeWidth = OUTLINED.has(dot.attr)
                ? Math.min(1.6, outerRadius * 0.45)
                : EDGED.has(dot.attr)
                  ? Math.min(1, outerRadius * 0.3)
                  : 0;
            return (
                <circle
                    key={dot.key}
                    data-kind={dot.attr}
                    data-circle={dot.teamId}
                    data-person={dot.mark.person ? index : undefined}
                    cx={dot.x}
                    cy={dot.y}
                    r={Math.max(outerRadius - strokeWidth / 2, 0)}
                    strokeWidth={strokeWidth > 0 ? strokeWidth : undefined}
                />
            );
        })}
    </>
));
DotsLayer.displayName = 'DotsLayer';

// The rings of people who are in another team too, under the dots and outside their layer, which the colour sweep
// reads as one circle per dot
const SharedRingsLayer = memo<{ dots: MapDot[] }>(({ dots }) => (
    <>
        {dots.map((dot) => {
            const { ring } = getDotShape(dot);
            if (ring === null) return null;
            return (
                <circle
                    key={dot.key}
                    className="ad-shared"
                    cx={dot.x}
                    cy={dot.y}
                    r={ring.radius}
                    strokeWidth={ring.width}
                />
            );
        })}
    </>
));
SharedRingsLayer.displayName = 'SharedRingsLayer';

// Text keeps its size on screen, so this layer follows the zoom level but not panning
const LabelsLayer = memo<{ labels: CircleLabel[]; zoomLevel: number }>(
    ({ labels, zoomLevel }) => (
        <>
            {labels.flatMap((label) =>
                getLabelLines(label, zoomLevel).map((line) => (
                    <text
                        key={`${label.id}:${line.role}`}
                        className={`ad-label ${line.role === 'name' ? 'ad-label-name' : 'ad-label-detail'}`}
                        x={line.x}
                        y={line.y}
                        textAnchor="middle"
                        fontSize={TEXT_FONTS[line.role].size / zoomLevel}
                        strokeWidth={HALO_PX / zoomLevel}
                    >
                        {line.text}
                    </text>
                )),
            )}
        </>
    ),
);
LabelsLayer.displayName = 'LabelsLayer';

type Props = {
    width: number;
    height: number;
    teams: MapTeam[];
    colourBy: ColourBy;
    selectedId: string | null;
    // One team is open on its own, so its circle is not a button
    isFocused: boolean;
    // Changes when a different part of the organisation is drawn, which resets the zoom
    layoutKey: string;
    onSelect: (teamId: string) => void;
};

export const PeopleMap = ({
    width,
    height,
    teams,
    colourBy,
    selectedId,
    isFocused,
    layoutKey,
    onSelect,
}: Props) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const pressRef = useRef<{ x: number; y: number } | null>(null);
    const dotsRef = useRef<SVGGElement | null>(null);
    const sweepLayerRef = useRef<HTMLDivElement | null>(null);
    // The colouring the dots were last drawn in; nothing else that changes them is animated
    const drawnColourByRef = useRef(colourBy);
    const scaleRef = useRef(1);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
    const [view, setView] = useState<View>({ transform: zoomIdentity, isAnimated: false });

    const area = useMemo(() => ({ width, height }), [width, height]);
    const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
    // Sized by the people in the team, so the circles do not move when the colouring changes
    const sizes = teams.map((team) => `${team.id}:${team.people}`).join('|');
    const circles = useMemo(
        () => fitToArea(teams.map((team) => ({ id: team.id, name: team.name, size: team.people })), area),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [sizes, area],
    );
    const dots = useMemo<MapDot[]>(
        () =>
            circles.flatMap((circle) => {
                const marks = teamsById.get(circle.id)?.marks ?? [];
                const { dotRadius, positions } = layoutDots(marks.length, circle.r);
                return marks.map((mark, index) => ({
                    key: `${circle.id}:${index}`,
                    teamId: circle.id,
                    x: circle.x + positions[index].x,
                    y: circle.y + positions[index].y,
                    r: dotRadius,
                    mark,
                    attr: markAttr(colourBy, mark.kind),
                }));
            }),
        [circles, teamsById, colourBy],
    );

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return undefined;
        const behaviour = zoom<SVGSVGElement, unknown>()
            .extent([[0, 0], [width, height]])
            .translateExtent([[0, 0], [width, height]])
            .scaleExtent([1, MAX_ZOOM])
            .clickDistance(CLICK_SLOP_PX)
            .filter((event) => isZoomGesture(event, scaleRef.current))
            .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
                scaleRef.current = event.transform.k;
                // Buttons and resets carry no pointer event
                setView({ transform: event.transform, isAnimated: !event.sourceEvent });
            });
        zoomRef.current = behaviour;
        const target = select<SVGSVGElement, unknown>(svg);
        target.call(behaviour);
        target.on('dblclick.zoom', null);
        return () => {
            target.on('.zoom', null);
        };
    }, [width, height]);

    const resetView = useCallback(() => {
        const svg = svgRef.current;
        if (svg && zoomRef.current) {
            zoomRef.current.transform(select<SVGSVGElement, unknown>(svg), zoomIdentity);
        }
    }, []);
    const zoomBy = useCallback((factor: number) => {
        const svg = svgRef.current;
        if (svg && zoomRef.current) {
            zoomRef.current.scaleBy(select<SVGSVGElement, unknown>(svg), factor);
        }
    }, []);

    useEffect(() => {
        resetView();
    }, [resetView, layoutKey, width, height]);

    // React draws the new colours first; the sweep then blanks the dots at once and fades each to its new colour,
    // with the delays written before the browser works the fade out.
    useLayoutEffect(() => {
        if (drawnColourByRef.current === colourBy) return undefined;
        drawnColourByRef.current = colourBy;
        const dotsLayer = dotsRef.current;
        const bandLayer = sweepLayerRef.current;
        if (!dotsLayer || !bandLayer) return undefined;
        return startColourSweep({
            layer: dotsLayer,
            marks: Array.from(dotsLayer.children),
            points: dots.map((dot) => ({
                x: view.transform.applyX(dot.x),
                y: view.transform.applyY(dot.y),
            })),
            area: { width, height },
            bandLayer,
        });
    }, [colourBy, dots, view.transform, width, height]);

    const { k } = view.transform;
    const textsFor = useCallback(
        (circle: PackedCircle): LabelText[] => {
            const team = teamsById.get(circle.id);
            return [
                { name: circle.name, detail: team?.caption ?? null },
                { name: circle.name, detail: null },
            ];
        },
        [teamsById],
    );
    const hoverLabels = useMemo(() => {
        const circle = circles.find((each) => each.id === hoveredId);
        const team = hoveredId === null ? undefined : teamsById.get(hoveredId);
        if (!circle || !team) return [];
        const label = getHoverLabel(
            circle,
            textsFor(circle),
            k,
            area,
            measureText,
        );
        return label === null ? [] : [label];
    }, [hoveredId, circles, teamsById, textsFor, k, area]);
    const restLabels = useMemo(
        () => getRestLabels(circles, textsFor, k, area, measureText),
        [circles, textsFor, k, area],
    );
    const shownRestLabels = useMemo(
        () => makeWayForHoverLabel(restLabels, hoverLabels[0]),
        [restLabels, hoverLabels],
    );

    const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
        pressRef.current = { x: event.clientX, y: event.clientY };
    };
    const handleClick = (event: MouseEvent<SVGGElement>) => {
        const press = pressRef.current;
        pressRef.current = null;
        // A drag that moved the map ends in a click too; that one is not a selection
        if (press !== null && Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_SLOP_PX) return;
        const { target } = event;
        if (!(target instanceof SVGElement) || isFocused) return;
        const teamId = target.dataset.circle;
        if (teamId) onSelect(teamId);
    };
    const handlePointerMove = (event: PointerEvent<SVGGElement>) => {
        const { target } = event;
        if (!(target instanceof SVGElement)) return;
        setHoveredId(target.dataset.circle ?? null);
        const index = target.dataset.person;
        const dot = index === undefined ? undefined : dots[Number(index)];
        if (dot?.mark.person) {
            setTip({
                x: event.clientX,
                y: event.clientY,
                text: `${dot.mark.person.name} · ${KIND_LABELS[colourBy][dot.mark.kind]}${dot.mark.shared ? ' · in more than one team' : ''}`,
            });
        } else {
            setTip(null);
        }
    };
    const handlePointerLeave = () => {
        setHoveredId(null);
        setTip(null);
    };

    return (
        <>
            <svg
                ref={svgRef}
                className="ad-svg"
                width={width}
                height={height}
                role="img"
                aria-label="People map: one circle per team, one mark per person"
                data-zoomed={k > 1 || undefined}
                onPointerDown={handlePointerDown}
            >
                <g
                    className="ad-viewport"
                    data-animated={view.isAnimated || undefined}
                    transform={view.transform.toString()}
                    onPointerMove={handlePointerMove}
                    onPointerLeave={handlePointerLeave}
                    onClick={handleClick}
                >
                    <CirclesLayer circles={circles} teams={teamsById} selectedId={selectedId} isStatic={isFocused} />
                    <SharedRingsLayer dots={dots} />
                    <g ref={dotsRef} className="ad-dots">
                        <DotsLayer dots={dots} />
                    </g>
                    <LabelsLayer labels={shownRestLabels} zoomLevel={k} />
                    <LabelsLayer labels={hoverLabels} zoomLevel={k} />
                </g>
            </svg>
            {/* Empty but for the band that crosses the map while its colouring changes */}
            <div ref={sweepLayerRef} className="ad-sweep-layer" />
            <div className="ad-controls">
                <Button variant="outline" size="icon" className="h-7 w-7 bg-background" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
                    <Plus />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7 bg-background" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>
                    <Minus />
                </Button>
                <Button variant="outline" size="sm" className="h-7 bg-background px-2 text-xs" onClick={resetView}>
                    Reset view
                </Button>
            </div>
            {tip && (
                <div className="ad-tip" style={{ left: tip.x, top: tip.y }}>
                    {tip.text}
                </div>
            )}
        </>
    );
};
