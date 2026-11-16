import { CONTROLS_SIZE, type Area, type PackedCircle } from './geometry';

// Names under the circles, carried over from the October map: every circle big enough is named at rest, placed to
// stay clear of other names where it can, and the hovered circle gets a fuller line.

export type TextRole = 'name' | 'detail';
export type TextMeasurer = (text: string, role: TextRole) => number;

export const TEXT_FONTS: Record<TextRole, { size: number; weight: number }> = {
    name: { size: 13, weight: 600 },
    detail: { size: 11, weight: 400 },
};

const LINE_PX: Record<TextRole, number> = { name: 16, detail: 14 };
const LABEL_GAP_PX = 4;
const SIDE_GAP_PX = 8;
const CLEARANCE_PX = 2;
const PANEL_INSET_PX = 6;
const EDGE_TOLERANCE_PX = 1e-6;
const ELLIPSIS = '…';
// A circle narrower than this on screen is named on hover only
const REST_LABEL_MIN_DIAMETER_PX = 24;

export type Box = { x: number; y: number; width: number; height: number };

export type CircleLabel = {
    id: string;
    name: string;
    detail: string | null;
    // Footprint on screen at the zoom it was placed for
    box: Box;
};

export type LabelText = { name: string; detail: string | null };

let canvas: CanvasRenderingContext2D | null | undefined;

// Measures with the page's own font, and falls back to a generous estimate where that is not possible
export const measureText: TextMeasurer = (text, role) => {
    if (canvas === undefined) {
        canvas =
            typeof document === 'undefined'
                ? null
                : document.createElement('canvas').getContext('2d');
    }
    const font = TEXT_FONTS[role];
    if (!canvas) return text.length * (role === 'name' ? 7.8 : 6.4);
    canvas.font = `${font.weight} ${font.size}px ${getComputedStyle(document.body).fontFamily}`;
    return canvas.measureText(text).width;
};

const boxesOverlap = (a: Box, b: Box): boolean =>
    a.x < b.x + b.width + CLEARANCE_PX &&
    b.x < a.x + a.width + CLEARANCE_PX &&
    a.y < b.y + b.height + CLEARANCE_PX &&
    b.y < a.y + a.height + CLEARANCE_PX;

const truncateToWidth = (
    text: string,
    maxWidth: number,
    measure: TextMeasurer,
): string => {
    if (measure(text, 'name') <= maxWidth) return text;
    const shortened = (length: number) =>
        `${text.slice(0, length).trimEnd()}${ELLIPSIS}`;
    let low = 1;
    let high = text.length - 1;
    let best = 1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (measure(shortened(middle), 'name') <= maxWidth) {
            best = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    return shortened(best);
};

const measureLabel = (text: LabelText, measure: TextMeasurer) => ({
    width: Math.max(
        measure(text.name, 'name'),
        text.detail === null ? 0 : measure(text.detail, 'detail'),
    ),
    height: LINE_PX.name + (text.detail === null ? 0 : LINE_PX.detail),
});

// The first of the texts that fits the drawing's width: under the circle, or over it when under is off the drawing
// or on the zoom buttons
// Every place the first text that fits could go, best first. When none sits fully on the drawing, under the circle.
const placeLabelOptions = (
    circle: PackedCircle,
    texts: LabelText[],
    zoom: number,
    area: Area,
    measure: TextMeasurer,
): { text: LabelText; boxes: Box[] } | null => {
    const maxWidth = area.width * zoom - PANEL_INSET_PX * 2;
    const text = texts.find(
        (each) =>
            each.detail === null || measure(each.detail, 'detail') <= maxWidth,
    );
    if (!text) return null;
    const fitted: LabelText = {
        name: truncateToWidth(text.name, maxWidth, measure),
        detail: text.detail,
    };
    const size = measureLabel(fitted, measure);
    const reserved: Box[] =
        zoom === 1
            ? [
                  {
                      x: 0,
                      y: area.height - CONTROLS_SIZE.height,
                      ...CONTROLS_SIZE,
                  },
              ]
            : [];
    const centred = circle.x * zoom - size.width / 2;
    const x = Math.max(
        PANEL_INSET_PX,
        Math.min(centred, area.width * zoom - PANEL_INSET_PX - size.width),
    );
    const below: Box = {
        x,
        y: (circle.y + circle.r) * zoom + LABEL_GAP_PX,
        ...size,
    };
    const above: Box = {
        x,
        y: (circle.y - circle.r) * zoom - LABEL_GAP_PX - size.height,
        ...size,
    };
    const fits = (box: Box): boolean =>
        box.x >= PANEL_INSET_PX - EDGE_TOLERANCE_PX &&
        box.y >= PANEL_INSET_PX - EDGE_TOLERANCE_PX &&
        box.y + box.height <=
            area.height * zoom - PANEL_INSET_PX + EDGE_TOLERANCE_PX &&
        box.x + box.width <=
            area.width * zoom - PANEL_INSET_PX + EDGE_TOLERANCE_PX &&
        !reserved.some((taken) => boxesOverlap(taken, box));
    const pastControls = reserved.map((taken) => ({
        ...below,
        x: Math.max(below.x, taken.x + taken.width + CLEARANCE_PX),
    }));
    // Other places near the circle, tried before a name is pushed away from it: under or over it lined up with its
    // left or right edge, then beside it
    const left = (circle.x - circle.r) * zoom;
    const right = (circle.x + circle.r) * zoom;
    const middleY = circle.y * zoom - size.height / 2;
    const alongside: Box[] = [
        { ...below, x: Math.max(PANEL_INSET_PX, left) },
        { ...below, x: Math.min(right - size.width, area.width * zoom - PANEL_INSET_PX - size.width) },
        { ...above, x: Math.max(PANEL_INSET_PX, left) },
        { ...above, x: Math.min(right - size.width, area.width * zoom - PANEL_INSET_PX - size.width) },
        { x: right + SIDE_GAP_PX, y: middleY, ...size },
        { x: left - SIDE_GAP_PX - size.width, y: middleY, ...size },
    ];
    const fitting = [below, above, ...alongside, ...pastControls].filter(fits);
    return { text: fitted, boxes: fitting.length > 0 ? fitting : [below] };
};

const placeLabel = (
    circle: PackedCircle,
    texts: LabelText[],
    zoom: number,
    area: Area,
    measure: TextMeasurer,
): CircleLabel | null => {
    const options = placeLabelOptions(circle, texts, zoom, area, measure);
    return options === null ? null : { id: circle.id, ...options.text, box: options.boxes[0] };
};

export const getHoverLabel = (
    circle: PackedCircle,
    texts: LabelText[],
    zoom: number,
    area: Area,
    measure: TextMeasurer,
): CircleLabel | null => placeLabel(circle, texts, zoom, area, measure);

// How far a name is moved down, line by line, to clear another name
const NUDGE_PX = 18;
const NUDGE_TRIES = 8;

// Every circle big enough keeps its name. Where one would sit on another name or circle it moves to another spot or
// shrinks to its name alone; as a last resort it is moved down clear of the other names, and the halo keeps it readable.
export const getRestLabels = (
    circles: PackedCircle[],
    textsFor: (circle: PackedCircle) => LabelText[],
    zoom: number,
    area: Area,
    measure: TextMeasurer,
): CircleLabel[] => {
    const hitsCircle = (box: Box, own: PackedCircle): boolean =>
        circles.some((other) => {
            if (other.id === own.id) return false;
            const nearestX = Math.max(box.x, Math.min(other.x * zoom, box.x + box.width));
            const nearestY = Math.max(box.y, Math.min(other.y * zoom, box.y + box.height));
            return Math.hypot(nearestX - other.x * zoom, nearestY - other.y * zoom) < other.r * zoom;
        });
    const placed = circles.flatMap((circle) => {
        if (circle.r * 2 * zoom < REST_LABEL_MIN_DIAMETER_PX) return [];
        // Each text, fullest first, in each place it could go
        const options = textsFor(circle).flatMap((text) => {
            const found = placeLabelOptions(circle, [text], zoom, area, measure);
            return found === null ? [] : found.boxes.map((box): CircleLabel => ({ id: circle.id, ...found.text, box }));
        });
        return options.length > 0 ? [{ circle, options }] : [];
    });
    const kept: CircleLabel[] = [];
    // The larger circle chooses first
    [...placed]
        .sort(
            (a, b) =>
                b.circle.r - a.circle.r ||
                b.circle.size - a.circle.size ||
                a.circle.id.localeCompare(b.circle.id),
        )
        .forEach(({ circle, options }) => {
            const isFree = (label: CircleLabel): boolean => !kept.some((other) => boxesOverlap(other.box, label.box));
            const isInside = (box: Box): boolean => box.y + box.height <= area.height * zoom - PANEL_INSET_PX;
            const nudged = (): CircleLabel | undefined => {
                for (let step = 1; step <= NUDGE_TRIES; step += 1) {
                    const found = options
                        .map((label) => ({ ...label, box: { ...label.box, y: label.box.y + step * NUDGE_PX } }))
                        .find((label) => isInside(label.box) && isFree(label));
                    if (found) return found;
                }
                return undefined;
            };
            kept.push(
                options.find((label) => isFree(label) && !hitsCircle(label.box, circle)) ??
                    options.find(isFree) ??
                    nudged() ??
                    options[0],
            );
        });
    return kept;
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

export type LabelLine = { role: TextRole; text: string; x: number; y: number };

// Where each line is drawn, in map coordinates: the screen footprint divided by the zoom
export const getLabelLines = (label: CircleLabel, zoom: number): LabelLine[] => {
    const { box } = label;
    const line = (role: TextRole, text: string, y: number): LabelLine => ({
        role,
        text,
        x: (box.x + box.width / 2) / zoom,
        y: y / zoom,
    });
    // Baselines sit about three quarters down each line
    return [
        line('name', label.name, box.y + LINE_PX.name * 0.78),
        ...(label.detail === null
            ? []
            : [
                  line(
                      'detail',
                      label.detail,
                      box.y + LINE_PX.name + LINE_PX.detail * 0.78,
                  ),
              ]),
    ];
};
