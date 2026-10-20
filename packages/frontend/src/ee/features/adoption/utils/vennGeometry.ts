// Circles of one size, each centre on the others' edges, which leaves every region room for its count
const RADIUS = 80;
const CENTRE_DISTANCE = RADIUS;
// Room around the circles for the outline of a chosen region
const PADDING = 4;
const POINTS_PER_ARC = 48;
const SAME_POINT = 1e-6;
const FULL_TURN = 2 * Math.PI;

type VennPoint = { x: number; y: number };
export type VennCircle = { cx: number; cy: number; r: number };

export type VennRegionShape = {
    positions: number[]; // the circles that hold the region, in order
    path: string; // its outline, as arcs of the circles
    label: VennPoint; // its centroid, where its count is written
};

export type VennLayout = {
    width: number;
    height: number;
    circles: VennCircle[];
    regions: VennRegionShape[]; // single circles first, then pairs, then all three
};

// A run of a circle's edge between two crossing points; a region lies on each side of it
type Arc = {
    circle: number;
    startAngle: number;
    span: number; // radians, measured the way SVG sweeps (clockwise on screen)
    start: VennPoint;
    end: VennPoint;
    insideOthers: (boolean | null)[]; // null for the arc's own circle
};

// An arc as walked around a region, in either direction
type Step = { arc: Arc; isForward: boolean };

const round = (value: number): number => Math.round(value * 100) / 100;

const isInside = (circle: VennCircle, { x, y }: VennPoint): boolean =>
    Math.hypot(x - circle.cx, y - circle.cy) < circle.r;

const isSamePoint = (a: VennPoint, b: VennPoint): boolean =>
    Math.hypot(a.x - b.x, a.y - b.y) < SAME_POINT;

const pointAt = (circle: VennCircle, angle: number): VennPoint => ({
    x: circle.cx + circle.r * Math.cos(angle),
    y: circle.cy + circle.r * Math.sin(angle),
});

const angleOf = (circle: VennCircle, { x, y }: VennPoint): number => {
    const angle = Math.atan2(y - circle.cy, x - circle.cx);
    return angle < 0 ? angle + FULL_TURN : angle;
};

// Where two circles' edges cross
const crossings = (a: VennCircle, b: VennCircle): VennPoint[] => {
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    const distance = Math.hypot(dx, dy);
    const along =
        (a.r * a.r - b.r * b.r + distance * distance) / (2 * distance);
    const across = Math.sqrt(a.r * a.r - along * along);
    const x = a.cx + (along * dx) / distance;
    const y = a.cy + (along * dy) / distance;
    return [
        { x: x + (across * dy) / distance, y: y - (across * dx) / distance },
        { x: x - (across * dy) / distance, y: y + (across * dx) / distance },
    ];
};

const placeCircles = (
    count: 2 | 3,
): Pick<VennLayout, 'width' | 'height' | 'circles'> => {
    const width = 2 * RADIUS + CENTRE_DISTANCE + 2 * PADDING;
    const middle = width / 2;
    const top = PADDING + RADIUS;
    if (count === 2) {
        return {
            width,
            height: 2 * (RADIUS + PADDING),
            circles: [
                { cx: middle - CENTRE_DISTANCE / 2, cy: top, r: RADIUS },
                { cx: middle + CENTRE_DISTANCE / 2, cy: top, r: RADIUS },
            ],
        };
    }
    // The first circle at the top, the other two below it
    const rise = (CENTRE_DISTANCE * Math.sqrt(3)) / 2;
    return {
        width,
        height: 2 * (RADIUS + PADDING) + rise,
        circles: [
            { cx: middle, cy: top, r: RADIUS },
            { cx: middle - CENTRE_DISTANCE / 2, cy: top + rise, r: RADIUS },
            { cx: middle + CENTRE_DISTANCE / 2, cy: top + rise, r: RADIUS },
        ],
    };
};

// Each circle's edge, cut at every point where another circle crosses it
const cutEdges = (circles: VennCircle[]): Arc[] =>
    circles.flatMap((circle, index) => {
        const cuts = circles
            .flatMap((other, j) =>
                j === index ? [] : crossings(circle, other),
            )
            .map((point) => ({ point, angle: angleOf(circle, point) }))
            .sort((a, b) => a.angle - b.angle);
        return cuts.map((cut, k): Arc => {
            const next = cuts[(k + 1) % cuts.length];
            const span =
                (next.angle - cut.angle + FULL_TURN) % FULL_TURN || FULL_TURN;
            const middle = pointAt(circle, cut.angle + span / 2);
            return {
                circle: index,
                startAngle: cut.angle,
                span,
                start: cut.point,
                end: next.point,
                insideOthers: circles.map((other, j) =>
                    j === index ? null : isInside(other, middle),
                ),
            };
        });
    });

// The arcs around a region, end to end: an arc bounds it when its middle is inside exactly the region's other circles
const walkBoundary = (arcs: Arc[], positions: number[]): Step[] => {
    const remaining = arcs.filter((arc) =>
        arc.insideOthers.every(
            (inside, j) => inside === null || inside === positions.includes(j),
        ),
    );
    const first = remaining.shift();
    if (first === undefined) return [];
    const steps: Step[] = [{ arc: first, isForward: true }];
    let tip = first.end;
    while (remaining.length > 0) {
        const index = remaining.findIndex(
            (arc) => isSamePoint(arc.start, tip) || isSamePoint(arc.end, tip),
        );
        if (index < 0) break;
        const [arc] = remaining.splice(index, 1);
        const isForward = isSamePoint(arc.start, tip);
        steps.push({ arc, isForward });
        tip = isForward ? arc.end : arc.start;
    }
    return steps;
};

const toPath = (steps: Step[], circles: VennCircle[]): string => {
    const [first] = steps;
    const origin = first.isForward ? first.arc.start : first.arc.end;
    const arcs = steps.map(({ arc, isForward }) => {
        const { r } = circles[arc.circle];
        const to = isForward ? arc.end : arc.start;
        const isLarge = arc.span > Math.PI ? 1 : 0;
        return `A${r} ${r} 0 ${isLarge} ${isForward ? 1 : 0} ${round(to.x)} ${round(to.y)}`;
    });
    return `M${round(origin.x)} ${round(origin.y)}${arcs.join('')}Z`;
};

// The centroid of the outline, traced finely along each arc (the shoelace formula)
const centroidOf = (steps: Step[], circles: VennCircle[]): VennPoint => {
    const points = steps.flatMap(({ arc, isForward }) =>
        Array.from({ length: POINTS_PER_ARC }, (_, i) => {
            const share = i / POINTS_PER_ARC;
            const angle = isForward
                ? arc.startAngle + share * arc.span
                : arc.startAngle + (1 - share) * arc.span;
            return pointAt(circles[arc.circle], angle);
        }),
    );
    let area = 0;
    let x = 0;
    let y = 0;
    points.forEach((point, i) => {
        const next = points[(i + 1) % points.length];
        const cross = point.x * next.y - next.x * point.y;
        area += cross;
        x += (point.x + next.x) * cross;
        y += (point.y + next.y) * cross;
    });
    return { x: round(x / (3 * area)), y: round(y / (3 * area)) };
};

// Every non-empty combination of the circles: single circles first, then pairs, then all three
const combinationsOf = (count: number): number[][] => {
    const combinations: number[][] = [];
    for (let mask = 1; mask < 1 << count; mask += 1) {
        combinations.push(
            Array.from({ length: count }, (_, i) => i).filter(
                (i) => (mask & (1 << i)) !== 0,
            ),
        );
    }
    return combinations.sort((a, b) => a.length - b.length);
};

const buildLayout = (count: 2 | 3): VennLayout => {
    const { width, height, circles } = placeCircles(count);
    const arcs = cutEdges(circles);
    return {
        width,
        height,
        circles,
        regions: combinationsOf(count).map((positions) => {
            const steps = walkBoundary(arcs, positions);
            return {
                positions,
                path: toPath(steps, circles),
                label: centroidOf(steps, circles),
            };
        }),
    };
};

const layouts = new Map<2 | 3, VennLayout>();

// The drawing never changes, so each one is worked out once
export const getVennLayout = (count: 2 | 3): VennLayout => {
    const cached = layouts.get(count);
    if (cached) return cached;
    const layout = buildLayout(count);
    layouts.set(count, layout);
    return layout;
};
