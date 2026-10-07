import { truncateLabel, type PackedCircle } from './geometry';
import { formatCount, type CircleInfo, type CircleStats } from './mapView';

// Room under the lowest circle for its two lines of text
export const LABEL_BAND = 40;
const MIN_PACK_SIZE = 240;
// Top-level circles shrink about their own centres to open space for labels
const SPREAD = 0.88;

const NAME_PX_PER_CHAR = 7.2;
const DETAIL_PX_PER_CHAR = 6;
const WIDE_LABEL_PX = 132;
const NAME_LINE_PX = 18;
const DETAIL_LINE_PX = 16;
const NESTED_LINE_PX = 14;
const NESTED_MIN_RADIUS_PX = 26;
const LABEL_GAP_PX = 3;
const SIDE_GAP_PX = 6;
const KEEP_CLEAR_SHARE = 0.62;
const SMALL_CIRCLE_PX = 26;

export const getPackSize = (width: number, height: number): number =>
    Math.max(Math.min(width, height - LABEL_BAND), MIN_PACK_SIZE);

// Centres the pack in the drawing area and spreads the top-level circles apart
export const positionCircles = (
    circles: PackedCircle[],
    width: number,
    height: number,
    size: number,
): PackedCircle[] => {
    const offsetX = (width - size) / 2;
    const offsetY = Math.max((height - LABEL_BAND - size) / 2, 0);
    const tops = circles.filter((circle) => circle.depth === 1);
    return circles.map((circle) => {
        // Top-level circles never overlap, so the one holding this centre is its ancestor
        const anchor =
            circle.depth === 1
                ? circle
                : (tops.find(
                      (top) =>
                          Math.hypot(top.x - circle.x, top.y - circle.y) <=
                          top.r,
                  ) ?? circle);
        return {
            ...circle,
            x: offsetX + anchor.x + (circle.x - anchor.x) * SPREAD,
            y: offsetY + anchor.y + (circle.y - anchor.y) * SPREAD,
            r: circle.r * SPREAD,
        };
    });
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

type Box = { x: number; y: number; width: number; height: number };

type LabelPlacement = 'below' | 'above' | 'right' | 'left';

export type CircleLabel = {
    id: string;
    placement: LabelPlacement;
    // Anchor on the circle's edge, in map coordinates
    x: number;
    y: number;
    name: string;
    detail: string | null;
    // Estimated footprint on screen at the current zoom, used to keep labels apart
    box: Box;
};

type Candidate = Omit<CircleLabel, 'id'>;
type LabelText = { name: string; detail: string | null };

const overlaps = (a: Box, b: Box): boolean =>
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;

// Fits a name to a pixel width through the shared truncation rule
const fitName = (name: string, widthPx: number): string =>
    truncateLabel(name, widthPx / 2);

const getTextSize = ({ name, detail }: LabelText) => ({
    width: Math.max(
        name.length * NAME_PX_PER_CHAR,
        (detail?.length ?? 0) * DETAIL_PX_PER_CHAR,
    ),
    height: NAME_LINE_PX + (detail === null ? 0 : DETAIL_LINE_PX),
});

const below = (
    circle: PackedCircle,
    zoom: number,
    text: LabelText,
): Candidate => {
    const { width, height } = getTextSize(text);
    return {
        ...text,
        placement: 'below',
        x: circle.x,
        y: circle.y + circle.r,
        box: {
            x: circle.x * zoom - width / 2,
            y: (circle.y + circle.r) * zoom + LABEL_GAP_PX,
            width,
            height,
        },
    };
};

const beside = (
    circle: PackedCircle,
    zoom: number,
    side: 'right' | 'left',
    text: LabelText,
): Candidate => {
    const { width, height } = getTextSize(text);
    const edge = circle.x + (side === 'right' ? circle.r : -circle.r);
    return {
        ...text,
        placement: side,
        x: edge,
        y: circle.y,
        box: {
            x:
                side === 'right'
                    ? edge * zoom + SIDE_GAP_PX
                    : edge * zoom - SIDE_GAP_PX - width,
            y: circle.y * zoom - height / 2,
            width,
            height,
        },
    };
};

// Under the circle first, then beside it; the line of numbers is given up last
const topLevelCandidates = (
    circle: PackedCircle,
    stats: CircleStats,
    zoom: number,
): Candidate[] => {
    const diameter = circle.r * 2 * zoom;
    const variants = getCaptionVariants(stats);
    const fitText = (budget: number): LabelText => ({
        name: fitName(circle.name, budget),
        detail:
            variants.find(
                (variant) => variant.length * DETAIL_PX_PER_CHAR <= budget,
            ) ?? null,
    });
    const wide = fitText(Math.max(diameter, WIDE_LABEL_PX));
    const tight = fitText(diameter);
    const side = fitText(WIDE_LABEL_PX);
    const build = (strip: boolean): Candidate[] => {
        const text = (value: LabelText): LabelText =>
            strip ? { ...value, detail: null } : value;
        return [
            below(circle, zoom, text(wide)),
            below(circle, zoom, text(tight)),
            beside(circle, zoom, 'right', text(side)),
            beside(circle, zoom, 'left', text(side)),
        ];
    };
    return [
        ...build(false).filter((candidate) => candidate.detail !== null),
        ...build(true),
    ];
};

const nestedCandidates = (
    circle: PackedCircle,
    stats: CircleStats,
    zoom: number,
): Candidate[] => {
    if (circle.r * zoom < NESTED_MIN_RADIUS_PX) return [];
    const count = ` · ${formatCount(stats.people)}`;
    const budget = circle.r * 2 * zoom - count.length * DETAIL_PX_PER_CHAR;
    const name = `${fitName(circle.name, Math.max(budget, 0))}${count}`;
    const width = name.length * DETAIL_PX_PER_CHAR;
    return [
        {
            placement: 'above',
            x: circle.x,
            y: circle.y - circle.r,
            name,
            detail: null,
            box: {
                x: circle.x * zoom - width / 2,
                y: (circle.y - circle.r) * zoom - LABEL_GAP_PX - NESTED_LINE_PX,
                width,
                height: NESTED_LINE_PX,
            },
        },
    ];
};

// The part of a circle no other label may cover: all of a small circle, the middle of a large one
const getKeepClearBox = (circle: PackedCircle, zoom: number): Box => {
    const radius = circle.r * zoom;
    const half = Math.max(
        radius * KEEP_CLEAR_SHARE,
        Math.min(radius, SMALL_CIRCLE_PX),
    );
    return {
        x: circle.x * zoom - half,
        y: circle.y * zoom - half,
        width: half * 2,
        height: half * 2,
    };
};

// Bigger and shallower circles claim space first; a label that cannot fit is shortened, moved, then dropped
export const placeLabels = (
    circles: PackedCircle[],
    info: Map<string, CircleInfo>,
    zoom: number,
    area: { width: number; height: number },
): CircleLabel[] => {
    const placed: CircleLabel[] = [];
    const keepClear = circles
        .filter((circle) => circle.depth === 1)
        .map((circle) => ({
            id: circle.id,
            box: getKeepClearBox(circle, zoom),
        }));
    const isInside = (box: Box): boolean =>
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= area.width * zoom &&
        box.y + box.height <= area.height * zoom;
    [...circles]
        .sort((a, b) => a.depth - b.depth || b.r - a.r)
        .forEach((circle) => {
            const stats = info.get(circle.id)?.stats;
            if (!stats) return;
            const isTopLevel = circle.depth === 1;
            const candidates = isTopLevel
                ? topLevelCandidates(circle, stats, zoom)
                : nestedCandidates(circle, stats, zoom);
            const fit = candidates.find(
                ({ box }) =>
                    isInside(box) &&
                    !placed.some((label) => overlaps(label.box, box)) &&
                    // A sub-department label sits inside its own parent, so only top-level labels check circles
                    !(
                        isTopLevel &&
                        keepClear.some(
                            (other) =>
                                other.id !== circle.id &&
                                overlaps(other.box, box),
                        )
                    ),
            );
            if (fit) placed.push({ id: circle.id, ...fit });
        });
    return placed;
};

export type LabelLine = {
    role: 'name' | 'detail' | 'nested';
    text: string;
    x: number;
    y: number;
    anchor: 'start' | 'middle' | 'end';
};

// Where each line of a label is drawn; screen offsets shrink with zoom so text keeps its size
export const getLabelLines = (
    label: CircleLabel,
    zoom: number,
): LabelLine[] => {
    const px = (value: number) => value / zoom;
    if (label.placement === 'above') {
        return [
            {
                role: 'nested',
                text: label.name,
                x: label.x,
                y: label.y - px(6),
                anchor: 'middle',
            },
        ];
    }
    const isBelow = label.placement === 'below';
    const isRight = label.placement === 'right';
    const x = isBelow
        ? label.x
        : label.x + px(isRight ? SIDE_GAP_PX : -SIDE_GAP_PX);
    const anchor: LabelLine['anchor'] = isBelow
        ? 'middle'
        : isRight
          ? 'start'
          : 'end';
    // Under the circle the lines hang from its edge; beside it they centre on its middle
    const nameY = isBelow ? px(16) : label.detail === null ? px(4.5) : px(-3);
    const detailY = isBelow ? px(31) : px(12);
    return [
        { role: 'name', text: label.name, x, y: label.y + nameY, anchor },
        ...(label.detail === null
            ? []
            : [
                  {
                      role: 'detail' as const,
                      text: label.detail,
                      x,
                      y: label.y + detailY,
                      anchor,
                  },
              ]),
    ];
};
