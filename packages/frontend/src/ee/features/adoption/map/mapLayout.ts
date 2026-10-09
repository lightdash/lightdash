import { formatCount, formatQuantity, SUB_DEPARTMENTS } from '../utils/format';
import {
    enlargeSmallCircles,
    layoutPack,
    MIN_CIRCLE_RADIUS,
    type PackDatum,
    type PackedCircle,
} from './geometry';
import {
    formatDirectPeople,
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

const LINE_PX: Record<TextRole, number> = { name: 16, detail: 14, nested: 14 };
const LABEL_GAP_PX = 4;
const CLEARANCE_PX = 2;
// Labels keep this far from the panel's edge
const PANEL_INSET_PX = 6;
const EDGE_TOLERANCE_PX = 1e-6;
const ELLIPSIS = '…';

// Room kept free around the drawing. The bottom holds one label under the lowest circle, so a circle as
// tall as the drawing still shows its label inside the map, which clips anything outside it
const HOVER_LABEL_BAND_PX =
    LABEL_GAP_PX + LINE_PX.name + LINE_PX.detail + PANEL_INSET_PX;
const MARGIN = { top: 12, right: 12, bottom: HOVER_LABEL_BAND_PX, left: 12 };
const MIN_PACK_SIZE = 240;
// A wide panel gets a wide arrangement, up to this ratio between the two directions
const MAX_STRETCH_RATIO = 4;

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

// Stretches the pack to the panel's shape, then scales it to fill the panel inside the margins
const fitCircles = (
    packed: PackedCircle[],
    area: Area,
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
            Math.max(ratio, 1),
            Math.max(1 / ratio, 1),
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

// Packs at true size and fits the pack to the panel; only then are the smallest circles enlarged
export const fitToArea = (input: PackDatum, area: Area): PackedCircle[] => {
    if (input.children.length === 0) return [];
    const size = Math.max(Math.min(area.width, area.height), MIN_PACK_SIZE);
    const { circles } = fitCircles(layoutPack(input, size), area);
    return enlargeSmallCircles(circles, MIN_CIRCLE_RADIUS, area);
};

// The line of numbers under a circle's name, longest first; a name at rest shows the last, the shortest
export const getCaptionVariants = (stats: CircleStats): string[] => {
    // The people directly in a department read in full, over the headcount kept for them
    if (stats.isDirect)
        return [
            formatDirectPeople(stats.members, stats.headcount, stats.active),
        ];
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

export type CircleLabel = {
    id: string;
    placement: 'below' | 'above';
    isNested: boolean;
    name: string;
    detail: string | null;
    // Footprint on screen at the zoom it was placed for
    box: Box;
};

type LabelText = { name: string; detail: string | null };
type Candidate = Omit<CircleLabel, 'id'>;

const boxesOverlap = (a: Box, b: Box): boolean =>
    a.x < b.x + b.width + CLEARANCE_PX &&
    b.x < a.x + a.width + CLEARANCE_PX &&
    a.y < b.y + b.height + CLEARANCE_PX &&
    b.y < a.y + a.height + CLEARANCE_PX;

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

// The fuller line a hover label gives under the name of a circle of the level in view: the people on Lightdash,
// how many are active, a missing headcount and the sub-departments, each only where it applies
const getFullCaption = (stats: CircleStats, subDepartments: number): string => {
    if (stats.isDirect) {
        return formatDirectPeople(stats.members, stats.headcount, stats.active);
    }
    const people =
        stats.members === 0
            ? [
                  stats.headcount === null
                      ? 'Nobody on Lightdash'
                      : `${formatCount(stats.headcount)} people · nobody on Lightdash`,
              ]
            : [
                  `${formatCount(stats.members)}${stats.headcount === null ? '' : ` of ${formatCount(stats.headcount)}`} on Lightdash`,
                  stats.active === stats.members
                      ? 'all active'
                      : `${formatCount(stats.active)} active`,
              ];
    return [
        ...people,
        ...(stats.headcount === null ? ['no headcount'] : []),
        ...(subDepartments > 0
            ? [formatQuantity(subDepartments, SUB_DEPARTMENTS)]
            : []),
    ].join(' · ');
};

// What a circle's name at rest says: the name with its shortest line of numbers, then the name alone. A
// circle inside another gives its count beside its name
const getRestTexts = (
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

// What a hover label says: for a circle of the level in view the fuller line first, so hovering one named at
// rest adds to its name
const getHoverTexts = (
    circle: PackedCircle,
    stats: CircleStats,
): LabelText[] => [
    ...(circle.depth === 1
        ? [
              {
                  name: circle.name,
                  detail: getFullCaption(stats, circle.childDepartmentCount),
              },
          ]
        : []),
    ...getRestTexts(circle, stats),
];

// Shortened to fit the width; null when even the numbers are too wide
const getOutsideText = (
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

// Centred under or over the circle, slid sideways only as far as it takes to stay inside the drawing
const getOutsideCandidate = (
    circle: PackedCircle,
    text: LabelText,
    side: 'below' | 'above',
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
    const y =
        side === 'below'
            ? (circle.y + circle.r) * zoom + LABEL_GAP_PX
            : (circle.y - circle.r) * zoom - LABEL_GAP_PX - size.height;
    return {
        placement: side,
        isNested: circle.depth > 1,
        name: text.name,
        detail: text.detail,
        box: { x, y, ...size },
    };
};

// Every circle at the focused level has a name, and so does every sub-department below it;
// the circles of people directly in a sub-department stay unnamed
const isNamed = (circle: PackedCircle): boolean =>
    circle.kind === 'department' || circle.depth === 1;

// The first of the texts that fits the drawing's width, in full unless it is wider than the drawing: under the
// circle, or over it when under is off the drawing or on the zoom buttons
const placeLabel = (
    circle: PackedCircle,
    texts: LabelText[],
    zoom: number,
    area: Area,
    measure: TextMeasurer,
): CircleLabel | null => {
    const maxWidth = area.width * zoom - PANEL_INSET_PX * 2;
    const text = texts
        .map((each) => getOutsideText(circle, each, maxWidth, measure))
        .find((each): each is LabelText => each !== null);
    if (!text) return null;
    const reserved = zoom === 1 ? [getControlsBox(area)] : [];
    // The band under the lowest circle is exactly one label tall, so the edges allow for rounding
    const fits = ({ box }: Candidate): boolean =>
        box.y >= PANEL_INSET_PX - EDGE_TOLERANCE_PX &&
        box.y + box.height <=
            area.height * zoom - PANEL_INSET_PX + EDGE_TOLERANCE_PX &&
        box.x + box.width <=
            area.width * zoom - PANEL_INSET_PX + EDGE_TOLERANCE_PX &&
        !reserved.some((taken) => boxesOverlap(taken, box));
    const [below, above] = (['below', 'above'] as const).map((side) =>
        getOutsideCandidate(circle, text, side, zoom, area, measure),
    );
    // A circle with no room over it keeps its label under it, moved right of the zoom buttons
    const pastControls = reserved.map((taken) => ({
        ...below,
        box: {
            ...below.box,
            x: Math.max(below.box.x, taken.x + taken.width + CLEARANCE_PX),
        },
    }));
    return {
        id: circle.id,
        ...([below, above, ...pastControls].find(fits) ?? below),
    };
};

// A circle's label shows while it is hovered or its control has focus
export const getHoverLabel = (
    circle: PackedCircle,
    info: Map<string, CircleInfo>,
    zoom: number,
    area: Area,
    measure: TextMeasurer,
): CircleLabel | null => {
    const stats = info.get(circle.id)?.stats;
    if (!stats || !isNamed(circle)) return null;
    return placeLabel(
        circle,
        getHoverTexts(circle, stats),
        zoom,
        area,
        measure,
    );
};

// A circle narrower than this on screen is named on hover only
const REST_LABEL_MIN_DIAMETER_PX = 24;

// Each circle of the level in view is named at rest, placed by the hover label's rule. Nothing is moved or resized
// for the names: where two would overlap, the larger circle keeps its name and the other is named on hover only
export const getRestLabels = (
    circles: PackedCircle[],
    info: Map<string, CircleInfo>,
    zoom: number,
    area: Area,
    measure: TextMeasurer,
): CircleLabel[] => {
    const placed = circles.flatMap((circle) => {
        const stats = info.get(circle.id)?.stats;
        if (
            !stats ||
            circle.depth !== 1 ||
            circle.r * 2 * zoom < REST_LABEL_MIN_DIAMETER_PX
        ) {
            return [];
        }
        const label = placeLabel(
            circle,
            getRestTexts(circle, stats),
            zoom,
            area,
            measure,
        );
        return label === null ? [] : [{ circle, label }];
    });
    const kept = new Set<CircleLabel>();
    [...placed]
        .sort(
            (a, b) =>
                b.circle.r - a.circle.r ||
                b.circle.size - a.circle.size ||
                a.circle.id.localeCompare(b.circle.id),
        )
        .forEach(({ label }) => {
            if (
                ![...kept].some((other) => boxesOverlap(other.box, label.box))
            ) {
                kept.add(label);
            }
        });
    return placed.flatMap(({ label }) => (kept.has(label) ? [label] : []));
};

// A hover label takes the place of its circle's name at rest, and of any other name it would sit on
export const makeWayForHoverLabel = (
    labels: CircleLabel[],
    hover: CircleLabel | undefined,
): CircleLabel[] =>
    hover === undefined
        ? labels
        : labels.filter(
              (label) =>
                  label.id !== hover.id && !boxesOverlap(label.box, hover.box),
          );

// Fills the panel with the pack, less the band at the bottom for the lowest circle's label
export const layoutMap = ({
    input,
    area,
    focusName,
}: {
    input: PackDatum;
    area: Area;
    focusName: string | null;
}): PackedCircle[] => nameLoneBucket(fitToArea(input, area), focusName);

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
