import {
    layoutPack,
    MIN_CIRCLE_RADIUS,
    truncateLabel,
    type PackDatum,
    type PackedCircle,
} from './geometry';
import {
    formatCount,
    nameLoneBucket,
    type CircleInfo,
    type CircleStats,
} from './mapView';

export type Area = { width: number; height: number };
export type TextRole = 'name' | 'detail' | 'nested';
// Width in pixels of a label line as it will be drawn
export type TextMeasurer = (text: string, role: TextRole) => number;

export const TEXT_FONTS: Record<TextRole, { size: number; weight: number }> = {
    name: { size: 13, weight: 600 },
    detail: { size: 11, weight: 400 },
    nested: { size: 11, weight: 600 },
};

// Deliberately generous, for where text cannot be measured
const ESTIMATE_PX_PER_CHAR: Record<TextRole, number> = {
    name: 7.8,
    detail: 6.4,
    nested: 6.8,
};

export const estimateTextWidth: TextMeasurer = (text, role) =>
    text.length * ESTIMATE_PX_PER_CHAR[role];

// Room kept free around the drawing; the bottom holds the lowest circle's two lines of text
const MARGIN = { top: 12, right: 12, bottom: 42, left: 12 };
const MIN_PACK_SIZE = 240;
// How far apart top-level circles are pushed, as a multiple of their packed spacing
const BASE_SPREAD = 1.08;
const SPREAD_STEP = 1.12;
const MAX_SPREAD_ATTEMPTS = 9;
const MIN_SPREAD_SIZE_SHARE = 0.7;
// A wide panel gets a wide arrangement, up to this ratio between the two directions
const MAX_STRETCH_RATIO = 2.4;
const MAX_FIT_PASSES = 4;

const LINE_PX: Record<TextRole, number> = { name: 16, detail: 14, nested: 14 };
const LABEL_GAP_PX = 4;
const SIDE_GAP_PX = 7;
const CLEARANCE_PX = 2;
// Labels keep this far from the panel's edge
const PANEL_INSET_PX = 6;
const NESTED_MIN_RADIUS_PX = 12;

const isInside = (inner: PackedCircle, outer: PackedCircle): boolean =>
    outer.depth < inner.depth &&
    Math.hypot(outer.x - inner.x, outer.y - inner.y) + inner.r <= outer.r + 0.5;

// Top-level circles never overlap, so the one holding a circle is its top-level ancestor
const getTopLevelAnchors = (
    circles: PackedCircle[],
): Map<string, PackedCircle> => {
    const tops = circles.filter((circle) => circle.depth === 1);
    return new Map(
        circles.map((circle) => [
            circle.id,
            circle.depth === 1
                ? circle
                : (tops.find((top) => isInside(circle, top)) ?? circle),
        ]),
    );
};

export type TopLevelGroup = {
    anchor: PackedCircle;
    // The department a click anywhere inside the top-level circle opens, one level at a time
    opens: string | null;
    // The top-level circle first, then everything inside it
    circles: PackedCircle[];
};

export const getTopLevelGroups = (circles: PackedCircle[]): TopLevelGroup[] => {
    const anchors = getTopLevelAnchors(circles);
    return circles
        .filter((circle) => circle.depth === 1)
        .map((anchor) => ({
            anchor,
            opens: anchor.kind === 'department' ? anchor.departmentUuid : null,
            circles: [
                anchor,
                ...circles.filter(
                    (circle) =>
                        circle.depth > 1 &&
                        anchors.get(circle.id)?.id === anchor.id,
                ),
            ],
        }));
};

// The zoom buttons sit over the bottom-left corner of the panel; nothing is labelled under them
const CONTROLS_SIZE = { width: 172, height: 46 };
export const getControlsBox = (area: Area): Box => ({
    x: 0,
    y: area.height - CONTROLS_SIZE.height,
    width: CONTROLS_SIZE.width,
    height: CONTROLS_SIZE.height,
});

type Extent = { minX: number; maxX: number; minY: number; maxY: number };

const getExtent = (circles: PackedCircle[]): Extent =>
    circles.reduce<Extent>(
        (extent, circle) => ({
            minX: Math.min(extent.minX, circle.x - circle.r),
            maxX: Math.max(extent.maxX, circle.x + circle.r),
            minY: Math.min(extent.minY, circle.y - circle.r),
            maxY: Math.max(extent.maxY, circle.y + circle.r),
        }),
        {
            minX: Number.POSITIVE_INFINITY,
            maxX: Number.NEGATIVE_INFINITY,
            minY: Number.POSITIVE_INFINITY,
            maxY: Number.NEGATIVE_INFINITY,
        },
    );

// Moves top-level circles apart without resizing them; their contents travel with them
const spreadCircles = (
    circles: PackedCircle[],
    anchors: Map<string, PackedCircle>,
    spreadX: number,
    spreadY: number,
): PackedCircle[] => {
    const extent = getExtent(circles.filter((circle) => circle.depth === 1));
    const centreX = (extent.minX + extent.maxX) / 2;
    const centreY = (extent.minY + extent.maxY) / 2;
    return circles.map((circle) => {
        const anchor = anchors.get(circle.id) ?? circle;
        return {
            ...circle,
            x: centreX + (anchor.x - centreX) * spreadX + (circle.x - anchor.x),
            y: centreY + (anchor.y - centreY) * spreadY + (circle.y - anchor.y),
        };
    });
};

// Spreads the pack to the panel's shape, then scales it to fill the panel inside the margins
const fitCircles = (
    packed: PackedCircle[],
    area: Area,
    spread: number,
): { circles: PackedCircle[]; scale: number } => {
    const availableWidth = Math.max(area.width - MARGIN.left - MARGIN.right, 1);
    const availableHeight = Math.max(
        area.height - MARGIN.top - MARGIN.bottom,
        1,
    );
    const anchors = getTopLevelAnchors(packed);
    const spreadBy = (ratio: number) =>
        spreadCircles(
            packed,
            anchors,
            spread * Math.max(ratio, 1),
            spread * Math.max(1 / ratio, 1),
        );
    const shapeOf = (circles: PackedCircle[]) => {
        const extent = getExtent(circles.filter((c) => c.depth === 1));
        return {
            extent,
            width: extent.maxX - extent.minX,
            height: extent.maxY - extent.minY,
        };
    };
    // The arrangement gets wider as the ratio grows, so the panel's shape is found by halving
    const target = availableWidth / availableHeight;
    let low = Math.log(1 / MAX_STRETCH_RATIO);
    let high = Math.log(MAX_STRETCH_RATIO);
    for (let step = 0; step < 24; step += 1) {
        const middle = (low + high) / 2;
        const shape = shapeOf(spreadBy(Math.exp(middle)));
        if (shape.width / shape.height < target) low = middle;
        else high = middle;
    }
    const spreadOut = spreadBy(Math.exp((low + high) / 2));
    const { extent, width, height } = shapeOf(spreadOut);
    const scale = Math.min(availableWidth / width, availableHeight / height);
    const offsetX = MARGIN.left + (availableWidth - width * scale) / 2;
    const offsetY = MARGIN.top + (availableHeight - height * scale) / 2;
    return {
        scale,
        circles: spreadOut.map((circle) => ({
            ...circle,
            x: offsetX + (circle.x - extent.minX) * scale,
            y: offsetY + (circle.y - extent.minY) * scale,
            r: circle.r * scale,
        })),
    };
};

// Packs, then fits; the pack's minimum radius is set so the drawn circle meets it after scaling
export const fitToArea = (
    input: PackDatum,
    area: Area,
    spread: number = BASE_SPREAD,
): PackedCircle[] => {
    if (input.children.length === 0) return [];
    const size = Math.max(Math.min(area.width, area.height), MIN_PACK_SIZE);
    let scale = 1;
    let circles: PackedCircle[] = [];
    for (let pass = 0; pass < MAX_FIT_PASSES; pass += 1) {
        const fitted = fitCircles(
            layoutPack(input, size, MIN_CIRCLE_RADIUS / scale),
            area,
            spread,
        );
        circles = fitted.circles;
        const isLargeEnough = fitted.scale >= scale;
        // Stop once small circles are neither under the minimum nor needlessly enlarged
        if (isLargeEnough && fitted.scale <= scale * 1.08) break;
        if (isLargeEnough && pass === MAX_FIT_PASSES - 1) break;
        scale = fitted.scale * 0.97;
    }
    return circles;
};

// The line of numbers under a circle, longest first so the widest that fits wins
export const getCaptionVariants = (stats: CircleStats): string[] => {
    if (stats.headcount === null) {
        return [
            stats.members === 0
                ? 'Nobody on Lightdash · no headcount'
                : `${formatCount(stats.members)} on Lightdash · no headcount`,
            'No headcount',
        ];
    }
    const headcount = formatCount(stats.headcount);
    if (stats.members === 0) {
        return [
            `${headcount} people · nobody on Lightdash`,
            `${headcount} · nobody yet`,
            headcount,
        ];
    }
    const share = `${formatCount(stats.members)} of ${headcount}`;
    const active =
        stats.active === stats.members
            ? 'all active'
            : `${formatCount(stats.active)} active`;
    return [`${share} on Lightdash · ${active}`, `${share} · ${active}`, share];
};

export type Box = { x: number; y: number; width: number; height: number };

type LabelPlacement = 'below' | 'above' | 'right' | 'left';

export type CircleLabel = {
    id: string;
    placement: LabelPlacement;
    isNested: boolean;
    name: string;
    detail: string | null;
    // Footprint on screen at the zoom it was placed for
    box: Box;
};

type Candidate = Omit<CircleLabel, 'id'>;

const boxesOverlap = (a: Box, b: Box): boolean =>
    a.x < b.x + b.width + CLEARANCE_PX &&
    b.x < a.x + a.width + CLEARANCE_PX &&
    a.y < b.y + b.height + CLEARANCE_PX &&
    b.y < a.y + a.height + CLEARANCE_PX;

export const boxTouchesCircle = (
    box: Box,
    circle: Pick<PackedCircle, 'x' | 'y' | 'r'>,
    zoom: number = 1,
    clearance: number = CLEARANCE_PX,
): boolean => {
    const x = circle.x * zoom;
    const y = circle.y * zoom;
    const nearestX = Math.max(box.x, Math.min(x, box.x + box.width));
    const nearestY = Math.max(box.y, Math.min(y, box.y + box.height));
    return Math.hypot(x - nearestX, y - nearestY) < circle.r * zoom + clearance;
};

const makeCandidate = (
    circle: PackedCircle,
    zoom: number,
    placement: LabelPlacement,
    name: string,
    detail: string | null,
    measure: TextMeasurer,
): Candidate => {
    const isNested = circle.depth > 1;
    const nameRole: TextRole = isNested ? 'nested' : 'name';
    const width = Math.max(
        measure(name, nameRole),
        detail === null ? 0 : measure(detail, 'detail'),
    );
    const height = LINE_PX[nameRole] + (detail === null ? 0 : LINE_PX.detail);
    const x = circle.x * zoom;
    const y = circle.y * zoom;
    const radius = circle.r * zoom;
    const corner: Record<LabelPlacement, { x: number; y: number }> = {
        below: { x: x - width / 2, y: y + radius + LABEL_GAP_PX },
        above: { x: x - width / 2, y: y - radius - LABEL_GAP_PX - height },
        right: { x: x + radius + SIDE_GAP_PX, y: y - height / 2 },
        left: { x: x - radius - SIDE_GAP_PX - width, y: y - height / 2 },
    };
    return {
        placement,
        isNested,
        name,
        detail,
        box: { ...corner[placement], width, height },
    };
};

const TOP_LEVEL_PLACEMENTS: LabelPlacement[] = [
    'below',
    'right',
    'left',
    'above',
];
const NESTED_PLACEMENTS: LabelPlacement[] = ['above', 'below'];

// The name with the shortest line of numbers, in each spot around the circle, then ever less
const topLevelCandidates = (
    circle: PackedCircle,
    stats: CircleStats,
    zoom: number,
    measure: TextMeasurer,
): Candidate[] => {
    const variants = getCaptionVariants(stats);
    const short = truncateLabel(circle.name, circle.r * zoom);
    const shortest = variants[variants.length - 1];
    const make = (
        placement: LabelPlacement,
        name: string,
        detail: string | null,
    ) => makeCandidate(circle, zoom, placement, name, detail, measure);
    return [
        ...TOP_LEVEL_PLACEMENTS.map((placement) =>
            make(placement, circle.name, shortest),
        ),
        ...TOP_LEVEL_PLACEMENTS.map((placement) =>
            make(placement, circle.name, null),
        ),
        make('below', short, shortest),
        make('below', short, null),
    ];
};

const nestedCandidates = (
    circle: PackedCircle,
    stats: CircleStats,
    zoom: number,
    measure: TextMeasurer,
): Candidate[] => {
    // People directly in a department sit in an unnamed circle beside its sub-departments
    if (circle.kind === 'own') return [];
    if (circle.r * zoom < NESTED_MIN_RADIUS_PX) return [];
    const count = ` · ${formatCount(stats.people)}`;
    return [`${circle.name}${count}`, circle.name].flatMap((text) =>
        NESTED_PLACEMENTS.map((placement) =>
            makeCandidate(circle, zoom, placement, text, null, measure),
        ),
    );
};

// A label may sit on the circles that contain its own circle, and on nothing else.
// Every circle gets a short label before any label is given its longer wording,
// bigger and shallower circles first; a label with no free spot is left out.
export const placeLabels = (
    circles: PackedCircle[],
    info: Map<string, CircleInfo>,
    zoom: number,
    area: Area,
    measure: TextMeasurer,
): CircleLabel[] => {
    const placed: CircleLabel[] = [];
    const isInArea = (box: Box): boolean =>
        box.x >= PANEL_INSET_PX &&
        box.y >= PANEL_INSET_PX &&
        box.x + box.width <= area.width * zoom - PANEL_INSET_PX &&
        box.y + box.height <= area.height * zoom - PANEL_INSET_PX;
    // The buttons stay put while a zoomed map moves under them, so they only count at the reset view
    const reserved = zoom === 1 ? [getControlsBox(area)] : [];
    const isFree = (
        circle: PackedCircle,
        box: Box,
        ownId: string | null,
    ): boolean =>
        isInArea(box) &&
        !reserved.some((taken) => boxesOverlap(taken, box)) &&
        !placed.some(
            (label) => label.id !== ownId && boxesOverlap(label.box, box),
        ) &&
        !circles.some(
            (other) =>
                !isInside(circle, other) && boxTouchesCircle(box, other, zoom),
        );
    const ordered = [...circles].sort((a, b) => a.depth - b.depth || b.r - a.r);
    ordered.forEach((circle) => {
        const stats = info.get(circle.id)?.stats;
        if (!stats) return;
        const candidates =
            circle.depth === 1
                ? topLevelCandidates(circle, stats, zoom, measure)
                : nestedCandidates(circle, stats, zoom, measure);
        const fit = candidates.find(({ box }) => isFree(circle, box, null));
        if (fit) placed.push({ id: circle.id, ...fit });
    });
    // Longer wording where it still fits, without moving or displacing anything
    ordered.forEach((circle) => {
        const stats = info.get(circle.id)?.stats;
        const index = placed.findIndex((label) => label.id === circle.id);
        if (!stats || index < 0 || circle.depth !== 1) return;
        const current = placed[index];
        if (current.detail === null || current.name !== circle.name) return;
        const longer = getCaptionVariants(stats)
            .map((variant) =>
                makeCandidate(
                    circle,
                    zoom,
                    current.placement,
                    circle.name,
                    variant,
                    measure,
                ),
            )
            .find(({ box }) => isFree(circle, box, circle.id));
        if (longer) placed[index] = { id: circle.id, ...longer };
    });
    return placed;
};

const countUnlabelled = (
    circles: PackedCircle[],
    labels: CircleLabel[],
): number => {
    const complete = new Set(
        labels
            .filter((label) => label.detail !== null)
            .map((label) => label.id),
    );
    return circles.filter(
        (circle) => circle.depth === 1 && !complete.has(circle.id),
    ).length;
};

// Fills the panel, spreading the circles further apart until every top-level label has room.
// Spreading shrinks the circles, so it stops before they lose too much of their size.
export const layoutMap = ({
    input,
    area,
    focusName,
    describe,
    measure,
}: {
    input: PackDatum;
    area: Area;
    focusName: string | null;
    describe: (circles: PackedCircle[]) => Map<string, CircleInfo>;
    measure: TextMeasurer;
}): PackedCircle[] => {
    const largest = (circles: PackedCircle[]): number =>
        circles.reduce((max, circle) => Math.max(max, circle.r), 0);
    let best: { circles: PackedCircle[]; unlabelled: number } | null = null;
    let firstSize = 0;
    for (let attempt = 0; attempt < MAX_SPREAD_ATTEMPTS; attempt += 1) {
        const circles = nameLoneBucket(
            fitToArea(input, area, BASE_SPREAD * SPREAD_STEP ** attempt),
            focusName,
        );
        if (attempt === 0) firstSize = largest(circles);
        else if (largest(circles) < firstSize * MIN_SPREAD_SIZE_SHARE) break;
        const unlabelled = countUnlabelled(
            circles,
            placeLabels(circles, describe(circles), 1, area, measure),
        );
        if (best === null || unlabelled < best.unlabelled) {
            best = { circles, unlabelled };
        }
        if (unlabelled === 0) break;
    }
    return best?.circles ?? [];
};

export type LabelLine = {
    role: TextRole;
    text: string;
    x: number;
    y: number;
    anchor: 'start' | 'middle' | 'end';
};

// Where each line is drawn, in map coordinates: the screen footprint divided by the zoom
export const getLabelLines = (
    label: CircleLabel,
    zoom: number,
): LabelLine[] => {
    const { box } = label;
    const anchor: LabelLine['anchor'] =
        label.placement === 'right'
            ? 'start'
            : label.placement === 'left'
              ? 'end'
              : 'middle';
    const screenX = {
        start: box.x,
        middle: box.x + box.width / 2,
        end: box.x + box.width,
    }[anchor];
    const nameRole: TextRole = label.isNested ? 'nested' : 'name';
    // Baselines sit about three quarters down each line
    const nameY = box.y + LINE_PX[nameRole] * 0.78;
    const line = (role: TextRole, text: string, y: number): LabelLine => ({
        role,
        text,
        x: screenX / zoom,
        y: y / zoom,
        anchor,
    });
    return [
        line(nameRole, label.name, nameY),
        ...(label.detail === null
            ? []
            : [
                  line(
                      'detail',
                      label.detail,
                      box.y + LINE_PX[nameRole] + LINE_PX.detail * 0.78,
                  ),
              ]),
    ];
};
