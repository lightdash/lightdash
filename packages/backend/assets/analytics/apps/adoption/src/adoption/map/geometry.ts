import { packEnclose, packSiblings } from 'd3';

// The layout maths of the people map, carried over from the October adoption map: circles packed by size and
// fitted to the panel, people laid out inside them on a ring or a sunflower.

export const MIN_CIRCLE_RADIUS = 14;
// Gap between neighbouring circles, in pack units
const CIRCLE_PADDING = 8;
// An enlarged circle stays this far from its neighbours, so names still fit between them, and from the drawing's edge
const ENLARGED_CLEARANCE = 24;
const EDGE_CLEARANCE = 2;
// A circle that could grow by no more than this is left at its true size
const MIN_ENLARGEMENT = 0.5;
const DOT_MARGIN = 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const ROOMY_DOT_RADIUS = 11;
const DENSE_DOT_RADIUS = 5;
const ROOMY_COUNT = 20;
const DENSE_COUNT = 150;
// Up to this many people sit on a ring; at exactly this many one of them takes the centre
const RING_WITH_CENTRE_COUNT = 7;
// Centres are kept this multiple of a dot's diameter apart, so neighbours never touch
const DOT_SPACING = 1.06;
// The ring around a person who is in another team too, and the gap inside it, at readable sizes
const SHARED_RING_PX = 1;
const SHARED_RING_GAP_PX = 1;

export type Area = { width: number; height: number };

export type PackInput = { id: string; name: string; size: number };

export type PackedCircle = PackInput & {
    x: number;
    y: number;
    r: number;
    // False when the circle was enlarged so it can be selected, which means it is not to scale
    isAreaHonest: boolean;
};

export const sunflowerPositions = (
    count: number,
    radius: number,
): { x: number; y: number }[] =>
    Array.from({ length: Math.max(count, 0) }, (_, index) => {
        const distance = radius * Math.sqrt((index + 0.5) / count);
        const angle = index * GOLDEN_ANGLE;
        return {
            x: distance * Math.cos(angle),
            y: distance * Math.sin(angle),
        };
    });

// A handful of people get dots big enough to read as people; the cap eases down as the count grows
const getDotRadiusCap = (count: number): number => {
    const roominess = Math.min(
        Math.max((DENSE_COUNT - count) / (DENSE_COUNT - ROOMY_COUNT), 0),
        1,
    );
    return DENSE_DOT_RADIUS + (ROOMY_DOT_RADIUS - DENSE_DOT_RADIUS) * roominess;
};

export const getDotRadius = (count: number, radius: number): number =>
    count <= 0
        ? 0
        : Math.min(
              Math.max((radius / Math.sqrt(count)) * 0.6, 0.75),
              getDotRadiusCap(count),
          );

type DotLayout = { dotRadius: number; positions: { x: number; y: number }[] };

// A few people sit evenly on a ring, the first at the top; from seven up one takes the centre
const layoutFewDots = (count: number, usable: number): DotLayout => {
    if (count === 1) {
        return {
            dotRadius: Math.min(usable / 2, getDotRadiusCap(count)),
            positions: [{ x: 0, y: 0 }],
        };
    }
    const onRing = count === RING_WITH_CENTRE_COUNT ? count - 1 : count;
    // Half the distance between ring neighbours, per unit of ring radius
    const reach = Math.sin(Math.PI / onRing);
    const dotRadius = Math.min(
        (usable * reach) / (1 + reach) / DOT_SPACING,
        getDotRadiusCap(count),
    );
    // Halfway out where there is room, never closer than the dots need nor past the edge
    const ringRadius = Math.min(
        Math.max(usable / 2, (dotRadius * DOT_SPACING) / reach),
        usable - dotRadius,
    );
    const ring = Array.from({ length: onRing }, (_, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / onRing;
        return {
            x: ringRadius * Math.cos(angle),
            y: ringRadius * Math.sin(angle),
        };
    });
    return {
        dotRadius,
        positions: onRing === count ? ring : [{ x: 0, y: 0 }, ...ring],
    };
};

const FIBONACCI = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987];
const sunflowerSpacings = new Map<number, number>();

// The closest any two dots of a sunflower come, for a sunflower of radius 1.
// A dot's nearest neighbours are a Fibonacci number of steps along the spiral.
export const getSunflowerSpacing = (count: number): number => {
    const known = sunflowerSpacings.get(count);
    if (known !== undefined) return known;
    const positions = sunflowerPositions(count, 1);
    let closest = Number.POSITIVE_INFINITY;
    positions.forEach((position, index) => {
        FIBONACCI.forEach((step) => {
            const other = positions[index + step];
            if (!other) return;
            closest = Math.min(
                closest,
                Math.hypot(position.x - other.x, position.y - other.y),
            );
        });
    });
    sunflowerSpacings.set(count, closest);
    return closest;
};

// Dots never overlap and stay inside the circle with a margin at the edge: the radius is
// worked out from how close the positions actually come, then held to the readable sizes
export const layoutDots = (count: number, circleRadius: number): DotLayout => {
    if (count <= 0) return { dotRadius: 0, positions: [] };
    const usable = Math.max(circleRadius - DOT_MARGIN, 0);
    if (count <= RING_WITH_CENTRE_COUNT) return layoutFewDots(count, usable);
    // Positions spread to (usable - dotRadius), so the largest radius that fits solves for both
    const spacing = getSunflowerSpacing(count);
    const fitting = (usable * spacing) / (2 * DOT_SPACING + spacing);
    const dotRadius = Math.min(fitting, getDotRadius(count, usable));
    return {
        dotRadius,
        positions: sunflowerPositions(count, usable - dotRadius),
    };
};

// A person who is in another team too: a thin ring at the edge of the room their dot has, and the dot
// inside it, so the ring never reaches a neighbour
export const getSharedDotShape = (
    room: number,
): { dotRadius: number; ringRadius: number; ringWidth: number } => {
    const ringWidth = Math.min(SHARED_RING_PX, room * 0.2);
    const gap = Math.min(SHARED_RING_GAP_PX, room * 0.15);
    return {
        dotRadius: room - ringWidth - gap,
        ringRadius: room - ringWidth / 2,
        ringWidth,
    };
};

// Radius in pack units before scaling; every circle gets some area, so an empty one stays visible
const unitRadius = (input: PackInput): number =>
    Math.sqrt(Math.max(input.size, 1));

// Largest first, then by name: the densest packing, and the same whatever order the teams arrive in
const byPackingOrder = (a: PackInput, b: PackInput): number =>
    b.size - a.size || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

// Teams packed from their own sizes around the origin, `CIRCLE_PADDING` apart once drawn at `size`
const layoutPack = (inputs: PackInput[], size: number): PackedCircle[] => {
    const ordered = [...inputs].sort(byPackingOrder);
    const radii = ordered.map(unitRadius);
    const arrange = (padding: number) => {
        const circles = packSiblings(radii.map((r) => ({ r: r + padding, x: 0, y: 0 })));
        return { circles, enclosing: packEnclose(circles) };
    };
    // A first pass finds the scale, so the padding can be set in drawn units for the second
    const radius = size / 2;
    const rough = arrange(0);
    const roughScale = (radius - CIRCLE_PADDING) / rough.enclosing.r;
    const padding = CIRCLE_PADDING / 2 / roughScale;
    const { circles, enclosing } = arrange(padding);
    const scale = (radius - CIRCLE_PADDING / 2) / enclosing.r;
    return ordered.map((input, index) => ({
        ...input,
        x: radius + (circles[index].x - enclosing.x) * scale,
        y: radius + (circles[index].y - enclosing.y) * scale,
        r: radii[index] * scale,
        isAreaHonest: true,
    }));
};

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

// Moves circles apart without resizing them
const spreadCircles = (
    circles: PackedCircle[],
    spreadX: number,
    spreadY: number,
): PackedCircle[] => {
    const extent = getExtent(circles);
    const centreX = (extent.minX + extent.maxX) / 2;
    const centreY = (extent.minY + extent.maxY) / 2;
    return circles.map((circle) => ({
        ...circle,
        x: centreX + (circle.x - centreX) * spreadX,
        y: centreY + (circle.y - centreY) * spreadY,
    }));
};

const LABEL_BAND_PX = 4 + 16 + 14 + 6;
export const MAP_MARGIN = { top: 12, right: 12, bottom: LABEL_BAND_PX, left: 12 };
const MIN_PACK_SIZE = 240;
// A wide panel gets a wide arrangement, up to this ratio between the two directions
const MAX_STRETCH_RATIO = 4;

// Stretches the pack to the panel's shape, then scales it to fill the panel inside the margins
const fitCircles = (packed: PackedCircle[], area: Area): PackedCircle[] => {
    const availableWidth = Math.max(
        area.width - MAP_MARGIN.left - MAP_MARGIN.right,
        1,
    );
    const availableHeight = Math.max(
        area.height - MAP_MARGIN.top - MAP_MARGIN.bottom,
        1,
    );
    const spreadBy = (ratio: number) =>
        spreadCircles(packed, Math.max(ratio, 1), Math.max(1 / ratio, 1));
    const shapeOf = (circles: PackedCircle[]) => {
        const extent = getExtent(circles);
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
    const offsetX = MAP_MARGIN.left + (availableWidth - width * scale) / 2;
    const offsetY = MAP_MARGIN.top + (availableHeight - height * scale) / 2;
    return spreadOut.map((circle) => ({
        ...circle,
        x: offsetX + (circle.x - extent.minX) * scale,
        y: offsetY + (circle.y - extent.minY) * scale,
        r: circle.r * scale,
    }));
};

// A circle below the minimum radius grows in place as far as the drawing's edge, its neighbours and every
// team with more people allow; it is then not to scale
const enlargeSmallCircles = (
    circles: PackedCircle[],
    minRadius: number,
    area: Area,
): PackedCircle[] => {
    const current = new Map(circles.map((circle) => [circle.id, circle]));
    [...circles]
        .sort(
            (a, b) =>
                b.size - a.size ||
                a.name.localeCompare(b.name) ||
                a.id.localeCompare(b.id),
        )
        .forEach(({ id }) => {
            const circle = current.get(id);
            if (!circle || circle.r >= minRadius) return;
            const others = [...current.values()].filter(
                (other) => other.id !== id,
            );
            const roomInside = Math.min(
                circle.x,
                area.width - circle.x,
                circle.y,
                area.height - circle.y,
            );
            const roomBeside = others.reduce(
                (room, other) =>
                    Math.min(
                        room,
                        Math.hypot(circle.x - other.x, circle.y - other.y) -
                            other.r,
                    ),
                Number.POSITIVE_INFINITY,
            );
            const largestAllowed = others
                .filter((other) => other.size > circle.size)
                .reduce(
                    (smallest, other) => Math.min(smallest, other.r),
                    Number.POSITIVE_INFINITY,
                );
            const r = Math.min(
                minRadius,
                roomInside - EDGE_CLEARANCE,
                roomBeside - ENLARGED_CLEARANCE,
                largestAllowed,
            );
            if (r - circle.r <= MIN_ENLARGEMENT) return;
            current.set(id, { ...circle, r, isAreaHonest: false });
        });
    return circles.map((circle) => current.get(circle.id) ?? circle);
};

// A few small circles alone in a wide panel would be blown up to fill it. Below this many pixels of radius per
// person-root nothing grows further, so a small organisation keeps dots the size of people.
const MAX_SCALE = 34;

// Packs at true size and fits the pack to the panel; only then are the smallest circles enlarged
export const fitToArea = (inputs: PackInput[], area: Area): PackedCircle[] => {
    if (inputs.length === 0 || area.width <= 0 || area.height <= 0) return [];
    const size = Math.max(Math.min(area.width, area.height), MIN_PACK_SIZE);
    const fitted = fitCircles(layoutPack(inputs, size), area);
    const scale = fitted[0].r / unitRadius(fitted[0]);
    const held = scale > MAX_SCALE ? shrinkInPlace(fitted, MAX_SCALE / scale) : fitted;
    return enlargeSmallCircles(makeRoomForLabels(spreadOverPanel(held, area)), MIN_CIRCLE_RADIUS, area);
};

// Circles get smaller where they are, so the space they leave stays between them rather than at the edges
const shrinkInPlace = (circles: PackedCircle[], factor: number): PackedCircle[] =>
    circles.map((circle) => ({ ...circle, r: circle.r * factor }));

// The room a team's name and count need under its circle, kept between any two circles
const LABEL_GAP_PX = 44;
// The zoom buttons sit over the bottom-left corner of the panel; nothing is placed over them or its name under them
export const CONTROLS_SIZE = { width: 172, height: 46 };
// A circle and the name under it, below the circle's edge
const NAME_HEIGHT_PX = 38;
// How the spreading works: the free space is sampled this finely, circles move this share of the way to the middle
// of the space they have, and it is repeated this many times
const SPREAD_SAMPLE_PX = 16;
const SPREAD_PULL = 0.5;
const SPREAD_STEPS = 60;

// Spreads circles over the whole panel so no space is left empty beside a crowded corner. Each circle moves toward
// the middle of the part of the panel nearer to it than to any other circle (nearer measured from its edge, so
// bigger circles claim more), which evens the space out; circles are then kept apart, inside the panel and clear
// of the zoom buttons. The same circles always give the same arrangement.
const spreadOverPanel = (circles: PackedCircle[], area: Area): PackedCircle[] => {
    if (circles.length < 2) return circles;
    const left = MAP_MARGIN.left;
    const right = area.width - MAP_MARGIN.right;
    const top = MAP_MARGIN.top;
    const bottom = area.height - MAP_MARGIN.bottom;
    if (right <= left || bottom <= top) return circles;
    const samples: { x: number; y: number }[] = [];
    for (let y = top + SPREAD_SAMPLE_PX / 2; y < bottom; y += SPREAD_SAMPLE_PX) {
        for (let x = left + SPREAD_SAMPLE_PX / 2; x < right; x += SPREAD_SAMPLE_PX) {
            samples.push({ x, y });
        }
    }
    const spots = circles.map((circle) => ({ x: circle.x, y: circle.y }));
    const controls = {
        left: 0,
        right: CONTROLS_SIZE.width,
        top: area.height - CONTROLS_SIZE.height,
        bottom: area.height,
    };
    for (let step = 0; step < SPREAD_STEPS; step += 1) {
        const sums = spots.map(() => ({ x: 0, y: 0, count: 0 }));
        samples.forEach((sample) => {
            let nearest = 0;
            let nearestGap = Number.POSITIVE_INFINITY;
            spots.forEach((spot, index) => {
                const gap = Math.hypot(sample.x - spot.x, sample.y - spot.y) - circles[index].r;
                if (gap < nearestGap) {
                    nearestGap = gap;
                    nearest = index;
                }
            });
            sums[nearest].x += sample.x;
            sums[nearest].y += sample.y;
            sums[nearest].count += 1;
        });
        spots.forEach((spot, index) => {
            const { x, y, count } = sums[index];
            if (count === 0) return;
            spot.x += (x / count - spot.x) * SPREAD_PULL;
            spot.y += (y / count - spot.y) * SPREAD_PULL;
        });
        // Keep apart, with the room for names between circles
        for (let pass = 0; pass < 3; pass += 1) {
            spots.forEach((a, i) => {
                spots.slice(i + 1).forEach((b, offset) => {
                    const j = i + 1 + offset;
                    const want = circles[i].r + circles[j].r + LABEL_GAP_PX;
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const apart = Math.hypot(dx, dy) || 0.01;
                    if (apart >= want) return;
                    const push = (want - apart) / 2 / apart;
                    a.x -= dx * push;
                    a.y -= dy * push;
                    b.x += dx * push;
                    b.y += dy * push;
                });
            });
        }
        // Inside the panel, and not over the zoom buttons or the name that would sit under a circle beside them
        spots.forEach((spot, index) => {
            const { r } = circles[index];
            spot.x = Math.min(Math.max(spot.x, left + r), Math.max(right - r, left + r));
            spot.y = Math.min(Math.max(spot.y, top + r), Math.max(bottom - r, top + r));
            const overlapX =
                Math.min(spot.x + r, controls.right) - Math.max(spot.x - r, controls.left);
            const overlapY =
                Math.min(spot.y + r + NAME_HEIGHT_PX, controls.bottom) -
                Math.max(spot.y - r, controls.top);
            if (overlapX > 0 && overlapY > 0) {
                if (overlapX < overlapY) spot.x += spot.x < controls.right / 2 ? -overlapX : overlapX;
                else spot.y -= overlapY;
                spot.x = Math.min(Math.max(spot.x, left + r), Math.max(right - r, left + r));
                spot.y = Math.min(Math.max(spot.y, top + r), Math.max(bottom - r, top + r));
            }
        });
    }
    return circles.map((circle, index) => ({ ...circle, x: spots[index].x, y: spots[index].y }));
};
// Circles shrink to make that room, but never below this share of their size
const MIN_GAP_SHRINK = 0.6;

// Every circle shrinks by the same share until the nearest pair of them has the room for labels between them
const makeRoomForLabels = (circles: PackedCircle[]): PackedCircle[] => {
    let factor = 1;
    circles.forEach((a, index) => {
        circles.slice(index + 1).forEach((b) => {
            const reach = a.r + b.r;
            if (reach > 0) {
                factor = Math.min(factor, (Math.hypot(a.x - b.x, a.y - b.y) - LABEL_GAP_PX) / reach);
            }
        });
    });
    const held = Math.max(factor, MIN_GAP_SHRINK);
    return held >= 1 ? circles : shrinkInPlace(circles, held);
};
