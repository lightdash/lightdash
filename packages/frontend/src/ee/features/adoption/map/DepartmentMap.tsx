import { ActionIcon, Box, Button, Group, Tooltip } from '@mantine/core';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import { select } from 'd3-selection';
import {
    zoom,
    zoomIdentity,
    type D3ZoomEvent,
    type ZoomBehavior,
    type ZoomTransform,
} from 'd3-zoom';
import {
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type MouseEvent,
    type PointerEvent,
} from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { COLOUR_TRANSITION, startColourTransition } from './colourTransition';
import styles from './DepartmentMap.module.css';
import { truncateLabel, type ColourBy, type PackedCircle } from './geometry';
import {
    getHoverLabel,
    getRestLabels,
    getTopLevelGroups,
    getLabelLines,
    makeWayForHoverLabel,
    TEXT_FONTS,
    type CircleLabel,
    type TextMeasurer,
    type TextRole,
} from './mapLayout';
import { DOT_LABELS, EDGED_DOT_KINDS, OUTLINED_DOT_KINDS } from './mapStyles';
import { type CircleInfo, type MapDot } from './mapView';
import { isZoomGesture } from './zoomGesture';

const MAX_ZOOM = 12;
const ZOOM_STEP = 1.6;
// A press that travels further than this is a drag, not a selection
const CLICK_SLOP_PX = 5;
const PERSON_FONT_PX = 10;
const HALO_PX = 3.5;
const NO_ACCOUNT_SCALE = 0.78;
// Fed to the shared truncation rule: about ten characters
const FIRST_NAME_RADIUS = 36;

const LINE_CLASSES: Record<TextRole, string> = {
    name: styles.labelName,
    detail: styles.labelDetail,
    nested: styles.labelNested,
};

type ZoomTarget = Parameters<ZoomBehavior<SVGSVGElement, unknown>>[0];

// The zoom typings resolve their own copy of the selection typings, so the selection is retyped once here
const selectZoomTarget = (svg: SVGSVGElement): ZoomTarget =>
    select<SVGSVGElement, unknown>(svg) as unknown as ZoomTarget;

type View = { transform: ZoomTransform; isAnimated: boolean };

type Props = {
    // Pixel size of the drawing area, measured from its container
    width: number;
    height: number;
    circles: PackedCircle[];
    info: Map<string, CircleInfo>;
    dots: MapDot[];
    // What the dots are coloured by; a change of it sweeps the new colours across the map
    colourBy: ColourBy;
    showNames: boolean;
    ariaLabel: string;
    measureText: TextMeasurer;
    // Changes when a different part of the organization is drawn, which resets the zoom
    layoutKey: string;
    highlightedUuid: string | null;
    selectedUserUuid: string | null;
    onDepartmentClick: (departmentUuid: string) => void;
    onPersonClick: (userUuid: string) => void;
};

const getMemberName = (member: NonNullable<MapDot['member']>): string =>
    `${member.firstName} ${member.lastName}`.trim() || member.email;

// What decides a circle's fill and outline
const getFillAttributes = (circle: PackedCircle) => ({
    'data-nested': circle.depth > 1 || undefined,
    'data-empty': !circle.hasMembers || undefined,
    'data-no-headcount': !circle.hasHeadcount || undefined,
});

// The layers below take no zoom transform, so panning and zooming never re-render them

const CirclesLayer = memo<{
    circles: PackedCircle[];
    info: Map<string, CircleInfo>;
    highlightedUuid: string | null;
}>(({ circles, info, highlightedUuid }) => {
    const groups = useMemo(() => getTopLevelGroups(circles), [circles]);
    // One group per top-level department, so hovering any part of it marks what a click opens
    return (
        <>
            {groups.map(({ anchor, opens, circles: members }) => (
                <g
                    key={anchor.id}
                    className={styles.group}
                    data-opens={opens ?? undefined}
                >
                    {members.map((circle) => {
                        const description =
                            info.get(circle.id)?.description ?? circle.name;
                        return (
                            <circle
                                key={circle.id}
                                className={styles.circle}
                                data-circle={circle.id}
                                data-kind={circle.kind}
                                data-department={
                                    circle.kind === 'department'
                                        ? (circle.departmentUuid ?? undefined)
                                        : undefined
                                }
                                data-opens={opens ?? undefined}
                                {...getFillAttributes(circle)}
                                data-highlighted={
                                    (circle.kind === 'department' &&
                                        circle.departmentUuid ===
                                            highlightedUuid) ||
                                    undefined
                                }
                                cx={circle.x}
                                cy={circle.y}
                                r={circle.r}
                            >
                                <title>
                                    {circle.id === anchor.id || opens === null
                                        ? description
                                        : `${description}. Select to open ${anchor.name}`}
                                </title>
                            </circle>
                        );
                    })}
                </g>
            ))}
        </>
    );
});
CirclesLayer.displayName = 'CirclesLayer';

const DotsLayer = memo<{ dots: MapDot[]; selectedUserUuid: string | null }>(
    ({ dots, selectedUserUuid }) => (
        <>
            {dots.map((dot) => {
                const outerRadius =
                    dot.kind === 'noAccount' ? dot.r * NO_ACCOUNT_SCALE : dot.r;
                // A ring's stroke, or a filled dot's thinner edge, drawn inside the dot's footprint
                const strokeWidth = OUTLINED_DOT_KINDS.has(dot.kind)
                    ? Math.min(1.6, outerRadius * 0.45)
                    : EDGED_DOT_KINDS.has(dot.kind)
                      ? Math.min(1, outerRadius * 0.3)
                      : 0;
                const radius = outerRadius - strokeWidth / 2;
                return (
                    <circle
                        key={dot.key}
                        data-dot={dot.kind}
                        data-circle={
                            dot.member === null ? undefined : dot.circleId
                        }
                        data-user={dot.member?.userUuid}
                        data-selected={
                            (dot.member !== null &&
                                dot.member.userUuid === selectedUserUuid) ||
                            undefined
                        }
                        cx={dot.x}
                        cy={dot.y}
                        r={radius}
                        strokeWidth={strokeWidth > 0 ? strokeWidth : undefined}
                    >
                        {/* Names the person and the part of the colouring they are in */}
                        {dot.member && (
                            <title>{`${getMemberName(dot.member)} · ${DOT_LABELS[dot.kind]}`}</title>
                        )}
                    </circle>
                );
            })}
        </>
    ),
);
DotsLayer.displayName = 'DotsLayer';

// Text keeps its size on screen, so these layers follow the zoom level but not panning

const LabelsLayer = memo<{
    labels: CircleLabel[];
    zoomLevel: number;
    // Names at rest carry data-rest-label and the hover label data-label, so each can be found on its own
    isAtRest: boolean;
}>(({ labels, zoomLevel, isAtRest }) => (
    <>
        {labels.flatMap((label) =>
            getLabelLines(label, zoomLevel).map((line) => (
                <text
                    key={`${label.id}:${line.role}`}
                    className={`${styles.label} ${LINE_CLASSES[line.role]}`}
                    data-label={isAtRest ? undefined : label.id}
                    data-rest-label={isAtRest ? label.id : undefined}
                    x={line.x}
                    y={line.y}
                    textAnchor={line.anchor}
                    fontSize={TEXT_FONTS[line.role].size / zoomLevel}
                    strokeWidth={HALO_PX / zoomLevel}
                >
                    {line.text}
                </text>
            )),
        )}
    </>
));
LabelsLayer.displayName = 'LabelsLayer';

const NamesLayer = memo<{ dots: MapDot[]; zoomLevel: number }>(
    ({ dots, zoomLevel }) => (
        <>
            {dots.map((dot) =>
                dot.member === null ? null : (
                    <text
                        key={dot.key}
                        className={`${styles.label} ${styles.personName}`}
                        textAnchor="middle"
                        x={dot.x}
                        y={dot.y + dot.r + (PERSON_FONT_PX + 1) / zoomLevel}
                        fontSize={PERSON_FONT_PX / zoomLevel}
                        strokeWidth={HALO_PX / zoomLevel}
                    >
                        {truncateLabel(
                            dot.member.firstName || dot.member.email,
                            FIRST_NAME_RADIUS,
                        )}
                    </text>
                ),
            )}
        </>
    ),
);
NamesLayer.displayName = 'NamesLayer';

export const DepartmentMap: FC<Props> = ({
    width,
    height,
    circles,
    info,
    dots,
    colourBy,
    showNames,
    ariaLabel,
    measureText,
    layoutKey,
    highlightedUuid,
    selectedUserUuid,
    onDepartmentClick,
    onPersonClick,
}) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const pressRef = useRef<{ x: number; y: number } | null>(null);
    const dotsRef = useRef<SVGGElement | null>(null);
    const sweepLayerRef = useRef<HTMLDivElement | null>(null);
    // The colouring the dots were last drawn in; nothing else that changes them is animated
    const drawnColourByRef = useRef(colourBy);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    // Read by the gesture filter, which runs outside React
    const scaleRef = useRef(1);
    const [view, setView] = useState<View>({
        transform: zoomIdentity,
        isAnimated: false,
    });

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return undefined;
        const behaviour = zoom<SVGSVGElement, unknown>()
            .extent([
                [0, 0],
                [width, height],
            ])
            .translateExtent([
                [0, 0],
                [width, height],
            ])
            .scaleExtent([1, MAX_ZOOM])
            .clickDistance(CLICK_SLOP_PX)
            .filter((event: Parameters<typeof isZoomGesture>[0]) =>
                isZoomGesture(event, scaleRef.current),
            )
            .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
                scaleRef.current = event.transform.k;
                setView({
                    transform: event.transform,
                    // Buttons and resets carry no pointer event
                    isAnimated: !event.sourceEvent,
                });
            });
        zoomRef.current = behaviour;
        const target = selectZoomTarget(svg);
        behaviour(target);
        target.on('dblclick.zoom', null);
        return () => {
            target.on('.zoom', null);
        };
    }, [width, height]);

    const resetView = useCallback(() => {
        const svg = svgRef.current;
        if (svg && zoomRef.current) {
            zoomRef.current.transform(selectZoomTarget(svg), zoomIdentity);
        }
    }, []);
    const zoomBy = useCallback((factor: number) => {
        const svg = svgRef.current;
        if (svg && zoomRef.current) {
            zoomRef.current.scaleBy(selectZoomTarget(svg), factor);
        }
    }, []);

    // The layout already fills the panel, so the starting view is the unzoomed one.
    // A different part of the organization, or a real change of size, returns to it.
    useEffect(() => {
        resetView();
    }, [resetView, layoutKey, width, height]);

    // React draws the new colours first and d3 writes their delays here, before the browser works them out.
    // Nothing may read layout between the two in the same render, or the colours change at once, silently.
    useLayoutEffect(() => {
        if (drawnColourByRef.current === colourBy) return undefined;
        drawnColourByRef.current = colourBy;
        const dotsLayer = dotsRef.current;
        const bandLayer = sweepLayerRef.current;
        if (!dotsLayer || !bandLayer) return undefined;
        // A zoom, a resize, new data or a selection during the sweep shows at once and takes the band away;
        // the other dots still change on the sweep's timing
        return startColourTransition(
            {
                dotsLayer,
                points: dots.map((dot) => ({
                    x: view.transform.applyX(dot.x),
                    y: view.transform.applyY(dot.y),
                })),
                area: { width, height },
                bandLayer,
            },
            COLOUR_TRANSITION,
        );
    }, [colourBy, dots, view.transform, width, height, selectedUserUuid]);

    const { k } = view.transform;
    const circlesById = useMemo(
        () => new Map(circles.map((circle) => [circle.id, circle])),
        [circles],
    );
    // A circle's label shows while it is hovered or its control has focus
    const shownId =
        hoveredId ??
        circles.find(
            (circle) =>
                circle.kind === 'department' &&
                circle.departmentUuid === highlightedUuid,
        )?.id ??
        null;
    const hoverLabels = useMemo(() => {
        const shown = shownId === null ? undefined : circlesById.get(shownId);
        // The people directly in a department are named by the department drawn around them
        const circle =
            shown?.kind === 'direct' && shown.parentId !== null
                ? circlesById.get(shown.parentId)
                : shown;
        if (!circle) return [];
        const label = getHoverLabel(
            circle,
            info,
            k,
            { width, height },
            measureText,
        );
        return label === null ? [] : [label];
    }, [shownId, circlesById, info, k, width, height, measureText]);
    // Every circle of the level in view is named at rest, except where the hover label takes its place
    const restLabels = useMemo(
        () => getRestLabels(circles, info, k, { width, height }, measureText),
        [circles, info, k, width, height, measureText],
    );
    const shownRestLabels = useMemo(
        () => makeWayForHoverLabel(restLabels, hoverLabels[0]),
        [restLabels, hoverLabels],
    );

    const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
        pressRef.current = { x: event.clientX, y: event.clientY };
    };
    // A drag that moved the map ends in a click too; that one is not a selection
    const isDragEnd = (event: MouseEvent<SVGGElement>): boolean => {
        const press = pressRef.current;
        pressRef.current = null;
        return (
            press !== null &&
            Math.hypot(event.clientX - press.x, event.clientY - press.y) >
                CLICK_SLOP_PX
        );
    };
    const handleCircleClick = (event: MouseEvent<SVGGElement>) => {
        const { target } = event;
        if (isDragEnd(event) || !(target instanceof SVGElement)) return;
        const { opens } = target.dataset;
        if (opens) onDepartmentClick(opens);
    };
    const handleCircleOver = (event: PointerEvent<SVGGElement>) => {
        const { target } = event;
        setHoveredId(
            target instanceof SVGElement
                ? (target.dataset.circle ?? null)
                : null,
        );
    };
    // Moving onto another circle, or onto a person in one, is followed by its own pointerover
    const handleCircleOut = (event: PointerEvent<SVGGElement>) => {
        const next = event.relatedTarget;
        if (next instanceof SVGElement && next.dataset.circle) return;
        setHoveredId(null);
    };
    const handleDotClick = (event: MouseEvent<SVGGElement>) => {
        const { target } = event;
        if (isDragEnd(event) || !(target instanceof SVGElement)) return;
        const { user } = target.dataset;
        if (user) onPersonClick(user);
    };

    return (
        <>
            <svg
                ref={svgRef}
                className={styles.svg}
                width={width}
                height={height}
                role="img"
                aria-label={ariaLabel}
                data-zoomed={k > 1 || undefined}
                onPointerDown={handlePointerDown}
            >
                <g
                    className={styles.viewport}
                    data-animated={view.isAnimated || undefined}
                    transform={view.transform.toString()}
                    onPointerOver={handleCircleOver}
                    onPointerOut={handleCircleOut}
                >
                    <g onClick={handleCircleClick}>
                        <CirclesLayer
                            circles={circles}
                            info={info}
                            highlightedUuid={highlightedUuid}
                        />
                    </g>
                    <g
                        ref={dotsRef}
                        className={styles.dots}
                        onClick={handleDotClick}
                    >
                        <DotsLayer
                            dots={dots}
                            selectedUserUuid={selectedUserUuid}
                        />
                    </g>
                    {showNames && <NamesLayer dots={dots} zoomLevel={k} />}
                    <LabelsLayer
                        labels={shownRestLabels}
                        zoomLevel={k}
                        isAtRest
                    />
                    <LabelsLayer
                        labels={hoverLabels}
                        zoomLevel={k}
                        isAtRest={false}
                    />
                </g>
            </svg>
            {/* Empty but for the band that crosses the map while its colouring changes */}
            <Box ref={sweepLayerRef} className={styles.sweepLayer} />
            <Group gap={4} className={styles.controls}>
                <Tooltip label="Zoom in">
                    <ActionIcon
                        variant="default"
                        aria-label="Zoom in"
                        onClick={() => zoomBy(ZOOM_STEP)}
                    >
                        <MantineIcon icon={IconPlus} />
                    </ActionIcon>
                </Tooltip>
                <Tooltip label="Zoom out">
                    <ActionIcon
                        variant="default"
                        aria-label="Zoom out"
                        onClick={() => zoomBy(1 / ZOOM_STEP)}
                    >
                        <MantineIcon icon={IconMinus} />
                    </ActionIcon>
                </Tooltip>
                <Button variant="default" size="compact-sm" onClick={resetView}>
                    Reset view
                </Button>
            </Group>
        </>
    );
};
