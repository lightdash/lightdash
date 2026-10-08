import { formatCount } from '../utils/format';
import {
    countBucketPeople,
    countPeople,
    enlargeSmallLeaves,
    layoutPack,
    MIN_CIRCLE_RADIUS,
    shouldRenderDots,
    type PackDatum,
    type PackedCircle,
} from './geometry';
import {
    NAME_LABEL_LIMIT,
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
const MAX_STRETCH_RATIO = 4;

const LINE_PX: Record<TextRole, number> = { name: 16, detail: 14, nested: 14 };
const LABEL_GAP_PX = 4;
const CLEARANCE_PX = 2;
// Labels keep this far from the panel's edge
const PANEL_INSET_PX = 6;
// A label inside a circle keeps this far from its edge
const INSIDE_INSET_PX = 3;
// A label under a circle may be this much wider than the circle before it is shortened
const OUTSIDE_EXTRA_WIDTH_PX = 80;
// A sub-department is named on the map once it is drawn this large; smaller ones are named on hover
const NESTED_LABEL_MIN_RADIUS_PX = 16;
// A label under a circle moves down, then up, in these steps to clear another label
const NUDGE_STEP_PX = 8;
const NUDGE_STEPS = 6;
const NUDGE_OFFSETS = [
    0,
    ...Array.from({ length: NUDGE_STEPS }, (_, index) => [
        (index + 1) * NUDGE_STEP_PX,
        -(index + 1) * NUDGE_STEP_PX,
    ]).flat(),
];
const ELLIPSIS = '…';

// The circles a circle is drawn inside, nearest first
const getAncestors = (
    circle: PackedCircle,
    byId: Map<string, PackedCircle>,
): PackedCircle[] => {
    const ancestors: PackedCircle[] = [];
    let parentId = circle.parentId;
    while (parentId !== null) {
        const parent = byId.get(parentId);
        if (!parent || ancestors.includes(parent)) break;
        ancestors.push(parent);
        parentId = parent.parentId;
    }
    return ancestors;
};

const getTopLevelAnchors = (
    circles: PackedCircle[],
): Map<string, PackedCircle> => {
    const byId = new Map(circles.map((circle) => [circle.id, circle]));
    return new Map(
        circles.map((circle) => {
            const ancestors = getAncestors(circle, byId);
            return [circle.id, ancestors[ancestors.length - 1] ?? circle];
        }),
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

// Packs at true size and fits the pack to the panel; only then are the smallest leaves enlarged
export const fitToArea = (
    input: PackDatum,
    area: Area,
    spread: number = BASE_SPREAD,
): PackedCircle[] => {
    if (input.children.length === 0) return [];
    const size = Math.max(Math.min(area.width, area.height), MIN_PACK_SIZE);
    const { circles } = fitCircles(layoutPack(input, size), area, spread);
    return enlargeSmallLeaves(circles, MIN_CIRCLE_RADIUS, area);
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

type LabelPlacement = 'inside' | 'below';

export type CircleLabel = {
    id: string;
    placement: LabelPlacement;
    isNested: boolean;
    name: string;
    detail: string | null;
    // Footprint on screen at the zoom it was placed for
    box: Box;
};

type LabelText = { name: string; detail: string | null };
type Candidate = Omit<CircleLabel, 'id'> & { offset: number };
type PlacedLabel = CircleLabel & { offset: number; coversOthers: boolean };

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

// The longest start of the text that fits the width, ending in an ellipsis
const truncateToWidth = (
    text: string,
    maxWidth: number,
    role: TextRole,
    measure: TextMeasurer,
): string => {
    if (measure(text, role) <= maxWidth) return text;
    const shortened = (length: number) =>
        `${text.slice(0, length).trimEnd()}${ELLIPSIS}`;
    let low = 1;
    let high = text.length - 1;
    let best = 1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (measure(shortened(middle), role) <= maxWidth) {
            best = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    return shortened(best);
};

const nameRoleOf = (circle: PackedCircle): TextRole =>
    circle.depth > 1 ? 'nested' : 'name';

const measureLabel = (
    text: LabelText,
    role: TextRole,
    measure: TextMeasurer,
): { width: number; height: number } => ({
    width: Math.max(
        measure(text.name, role),
        text.detail === null ? 0 : measure(text.detail, 'detail'),
    ),
    height: LINE_PX[role] + (text.detail === null ? 0 : LINE_PX.detail),
});

// What a label says before any longer wording: the name with the fewest numbers, then the name alone
const getFirstTexts = (
    circle: PackedCircle,
    stats: CircleStats,
): LabelText[] => {
    if (circle.depth > 1) {
        return [
            {
                name: `${circle.name} · ${formatCount(stats.people)}`,
                detail: null,
            },
            { name: circle.name, detail: null },
        ];
    }
    const variants = getCaptionVariants(stats);
    return [
        { name: circle.name, detail: variants[variants.length - 1] },
        { name: circle.name, detail: null },
    ];
};

// Inside an empty circle the label sits in the middle. Over dots it sits as high as it fits and stays
// in the upper half, so the active people at the core stay in view
const getInsideBox = (
    circle: PackedCircle,
    zoom: number,
    size: { width: number; height: number },
    isOverDots: boolean,
): Box | null => {
    const radius = circle.r * zoom - INSIDE_INSET_PX;
    const halfWidth = size.width / 2;
    if (radius <= halfWidth) return null;
    const x = circle.x * zoom;
    const y = circle.y * zoom;
    const top = isOverDots
        ? y - Math.sqrt(radius ** 2 - halfWidth ** 2)
        : y - size.height / 2;
    const bottom = top + size.height;
    const fits =
        (!isOverDots || bottom <= y) &&
        [top, bottom].every(
            (cornerY) => Math.hypot(halfWidth, cornerY - y) <= radius + 1e-6,
        );
    return fits ? { x: x - halfWidth, y: top, ...size } : null;
};

const getBelowWidth = (circle: PackedCircle, zoom: number): number =>
    circle.r * zoom * 2 + OUTSIDE_EXTRA_WIDTH_PX;

// Shortened to fit the width; null when even the numbers are too wide
const getBelowText = (
    circle: PackedCircle,
    text: LabelText,
    maxWidth: number,
    measure: TextMeasurer,
): LabelText | null => {
    const role = nameRoleOf(circle);
    if (text.detail !== null && measure(text.detail, 'detail') > maxWidth) {
        return null;
    }
    // A sub-department keeps its count and gives up letters of its name instead
    const suffix = text.name.slice(circle.name.length);
    const room = maxWidth - (suffix === '' ? 0 : measure(suffix, role));
    if (room < measure(`${circle.name.slice(0, 1)}${ELLIPSIS}`, role)) {
        return null;
    }
    return {
        name: `${truncateToWidth(circle.name, room, role, measure)}${suffix}`,
        detail: text.detail,
    };
};

const makeCandidate = (
    circle: PackedCircle,
    text: LabelText,
    placement: LabelPlacement,
    box: Box,
    offset: number,
): Candidate => ({
    placement,
    isNested: circle.depth > 1,
    name: text.name,
    detail: text.detail,
    box,
    offset,
});

// Centred under the circle, slid sideways only as far as it takes to stay inside the drawing
const getBelowCandidate = (
    circle: PackedCircle,
    text: LabelText,
    offset: number,
    zoom: number,
    area: Area,
    measure: TextMeasurer,
): Candidate => {
    const size = measureLabel(text, nameRoleOf(circle), measure);
    const centred = circle.x * zoom - size.width / 2;
    const x = Math.max(
        PANEL_INSET_PX,
        Math.min(centred, area.width * zoom - PANEL_INSET_PX - size.width),
    );
    return makeCandidate(
        circle,
        text,
        'below',
        {
            x,
            y: (circle.y + circle.r) * zoom + LABEL_GAP_PX + offset,
            ...size,
        },
        offset,
    );
};

// Every circle at the focused level has a name, and so does every sub-department below it;
// the circles of people directly in a sub-department stay unnamed
const isNamed = (circle: PackedCircle): boolean =>
    circle.kind === 'department' || circle.depth === 1;

const isLabelledAt = (circle: PackedCircle, zoom: number): boolean =>
    isNamed(circle) &&
    (circle.depth === 1 || circle.r * zoom >= NESTED_LABEL_MIN_RADIUS_PX);

type Placement = {
    zoom: number;
    area: Area;
    measure: TextMeasurer;
    canGoInside: (circle: PackedCircle) => boolean;
    isOverDots: (circle: PackedCircle) => boolean;
    // A sub-department's label stays inside its top-level circle, so it never reads as another's
    staysInGroup: (circle: PackedCircle, box: Box) => boolean;
    isFree: (box: Box, ownId: string | null) => boolean;
    coversOthers: (circle: PackedCircle, candidate: Candidate) => boolean;
};

const getCandidates = (
    circle: PackedCircle,
    texts: LabelText[],
    placement: Placement,
): Candidate[] => {
    const { zoom, area, measure } = placement;
    return texts.flatMap((text) => {
        const insideBox = placement.canGoInside(circle)
            ? getInsideBox(
                  circle,
                  zoom,
                  measureLabel(text, nameRoleOf(circle), measure),
                  placement.isOverDots(circle),
              )
            : null;
        const below = getBelowText(
            circle,
            text,
            getBelowWidth(circle, zoom),
            measure,
        );
        return [
            ...(insideBox === null
                ? []
                : [makeCandidate(circle, text, 'inside', insideBox, 0)]),
            ...(below === null
                ? []
                : NUDGE_OFFSETS.map((offset) =>
                      getBelowCandidate(
                          circle,
                          below,
                          offset,
                          zoom,
                          area,
                          measure,
                      ),
                  )),
        ].filter((candidate) => placement.staysInGroup(circle, candidate.box));
    });
};

// Each label goes inside its circle when it fits, otherwise under it, moved down or up to clear the
// labels already placed; a spot over no unrelated circle wins, and one with no free spot is left out
const placeAllLabels = (
    circles: PackedCircle[],
    info: Map<string, CircleInfo>,
    zoom: number,
    area: Area,
    measure: TextMeasurer,
): PlacedLabel[] => {
    const byId = new Map(circles.map((circle) => [circle.id, circle]));
    const hasChildren = new Set(
        circles.flatMap((circle) =>
            circle.parentId === null ? [] : [circle.parentId],
        ),
    );
    const anchors = getTopLevelAnchors(circles);
    // Each circle with the circles drawn around it and inside it, which its label may sit on
    const related = new Map<string, Set<string>>(
        circles.map((circle) => [circle.id, new Set([circle.id])]),
    );
    circles.forEach((circle) =>
        getAncestors(circle, byId).forEach((ancestor) => {
            related.get(circle.id)?.add(ancestor.id);
            related.get(ancestor.id)?.add(circle.id);
        }),
    );
    const totalPeople = countPeople(circles);
    const showsDots = shouldRenderDots(totalPeople);
    // First names are drawn under the dots of a small view, so labels keep out of those circles
    const showsNames = showsDots && totalPeople <= NAME_LABEL_LIMIT;
    const isOverDots = (circle: PackedCircle): boolean =>
        showsDots &&
        circle.people !== null &&
        countBucketPeople(circle.people) > 0;
    const placed: PlacedLabel[] = [];
    // The buttons stay put while a zoomed map moves under them, so they only count at the reset view
    const reserved = zoom === 1 ? [getControlsBox(area)] : [];
    const placement: Placement = {
        zoom,
        area,
        measure,
        canGoInside: (circle) =>
            !hasChildren.has(circle.id) && !(showsNames && isOverDots(circle)),
        isOverDots,
        staysInGroup: (circle, box) => {
            const group = anchors.get(circle.id);
            if (!group || group.id === circle.id) return true;
            const x = group.x * zoom;
            const y = group.y * zoom;
            const radius = group.r * zoom;
            return [box.x, box.x + box.width].every((cornerX) =>
                [box.y, box.y + box.height].every(
                    (cornerY) => Math.hypot(cornerX - x, cornerY - y) <= radius,
                ),
            );
        },
        isFree: (box, ownId) =>
            box.x >= PANEL_INSET_PX &&
            box.y >= PANEL_INSET_PX &&
            box.x + box.width <= area.width * zoom - PANEL_INSET_PX &&
            box.y + box.height <= area.height * zoom - PANEL_INSET_PX &&
            !reserved.some((taken) => boxesOverlap(taken, box)) &&
            !placed.some(
                (label) => label.id !== ownId && boxesOverlap(label.box, box),
            ),
        coversOthers: (circle, candidate) => {
            const own = related.get(circle.id);
            return circles.some(
                (other) =>
                    !own?.has(other.id) &&
                    boxTouchesCircle(candidate.box, other, zoom),
            );
        },
    };
    const ordered = circles
        .filter((circle) => isLabelledAt(circle, zoom))
        .sort((a, b) => a.depth - b.depth || b.r - a.r);
    ordered.forEach((circle) => {
        const stats = info.get(circle.id)?.stats;
        if (!stats) return;
        const candidates = getCandidates(
            circle,
            getFirstTexts(circle, stats),
            placement,
        );
        const clear = candidates.find(
            (candidate) =>
                placement.isFree(candidate.box, null) &&
                !placement.coversOthers(circle, candidate),
        );
        const chosen =
            clear ??
            candidates.find((candidate) =>
                placement.isFree(candidate.box, null),
            );
        if (chosen) {
            placed.push({
                id: circle.id,
                ...chosen,
                coversOthers: clear === undefined,
            });
        }
    });
    // Longer wording for a top-level label where it still fits in the same spot, displacing nothing
    ordered.forEach((circle) => {
        const stats = info.get(circle.id)?.stats;
        const index = placed.findIndex((label) => label.id === circle.id);
        if (!stats || index < 0 || circle.depth !== 1) return;
        const current = placed[index];
        if (current.detail === null || current.name !== circle.name) return;
        const longer = getCaptionVariants(stats)
            .map((detail): Candidate | null => {
                const text = { name: circle.name, detail };
                if (current.placement === 'inside') {
                    const box = getInsideBox(
                        circle,
                        zoom,
                        measureLabel(text, 'name', measure),
                        isOverDots(circle),
                    );
                    return box === null
                        ? null
                        : makeCandidate(circle, text, 'inside', box, 0);
                }
                const below = getBelowText(
                    circle,
                    text,
                    getBelowWidth(circle, zoom),
                    measure,
                );
                return below === null || below.name !== circle.name
                    ? null
                    : getBelowCandidate(
                          circle,
                          below,
                          current.offset,
                          zoom,
                          area,
                          measure,
                      );
            })
            .find(
                (candidate): candidate is Candidate =>
                    candidate !== null &&
                    placement.isFree(candidate.box, circle.id) &&
                    (current.coversOthers ||
                        !placement.coversOthers(circle, candidate)),
            );
        if (longer) {
            placed[index] = {
                id: circle.id,
                ...longer,
                coversOthers: current.coversOthers,
            };
        }
    });
    return placed;
};

export const placeLabels = (
    circles: PackedCircle[],
    info: Map<string, CircleInfo>,
    zoom: number,
    area: Area,
    measure: TextMeasurer,
): CircleLabel[] =>
    placeAllLabels(circles, info, zoom, area, measure).map(
        ({ offset, coversOthers, ...label }) => label,
    );

// A label left out for want of room shows under its circle while the circle is hovered, in full
// unless it is wider than the drawing
export const getHoverLabel = (
    circle: PackedCircle,
    info: Map<string, CircleInfo>,
    zoom: number,
    area: Area,
    measure: TextMeasurer,
): CircleLabel | null => {
    const stats = info.get(circle.id)?.stats;
    if (!stats || !isNamed(circle)) return null;
    const maxWidth = area.width * zoom - PANEL_INSET_PX * 2;
    const text = getFirstTexts(circle, stats)
        .map((each) => getBelowText(circle, each, maxWidth, measure))
        .find((each): each is LabelText => each !== null);
    if (!text) return null;
    const { offset, ...candidate } = getBelowCandidate(
        circle,
        text,
        0,
        zoom,
        area,
        measure,
    );
    return { id: circle.id, ...candidate };
};

// A top-level label counts as missing when it is left out, has no numbers or covers another circle
const countUnlabelled = (
    circles: PackedCircle[],
    labels: PlacedLabel[],
): number => {
    const complete = new Set(
        labels
            .filter((label) => label.detail !== null && !label.coversOthers)
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
            placeAllLabels(circles, describe(circles), 1, area, measure),
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
    anchor: 'middle';
};

// Where each line is drawn, in map coordinates: the screen footprint divided by the zoom
export const getLabelLines = (
    label: CircleLabel,
    zoom: number,
): LabelLine[] => {
    const { box } = label;
    const nameRole: TextRole = label.isNested ? 'nested' : 'name';
    const line = (role: TextRole, text: string, y: number): LabelLine => ({
        role,
        text,
        x: (box.x + box.width / 2) / zoom,
        y: y / zoom,
        anchor: 'middle',
    });
    // Baselines sit about three quarters down each line
    return [
        line(nameRole, label.name, box.y + LINE_PX[nameRole] * 0.78),
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
