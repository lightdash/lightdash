import { type Anchor, type Box, type LayerMark, type Point } from './types';

const contains = (rect: Box, point: Point) =>
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height;

const sameRect = (a: Box, b: Box) =>
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/**
 * Moves each mark with the anchor it sat on, keeping its place within it.
 * A mark whose anchor is gone is dropped; one on no anchor stays put.
 */
export const followAnchors = (
    marks: LayerMark[],
    before: Anchor[],
    after: Anchor[],
): LayerMark[] =>
    marks.flatMap((mark) => {
        const centre = {
            x: mark.box.x + mark.box.width / 2,
            y: mark.box.y + mark.box.height / 2,
        };
        // The smallest anchor under the mark is the one it was made on.
        const from = before
            .filter(
                (anchor) =>
                    contains(anchor.rect, centre) &&
                    anchor.rect.width > 0 &&
                    anchor.rect.height > 0,
            )
            .sort(
                (a, b) =>
                    a.rect.width * a.rect.height - b.rect.width * b.rect.height,
            )[0];
        if (!from) return [mark];
        const to = after.find((anchor) => anchor.id === from.id);
        if (!to) return [];
        if (sameRect(from.rect, to.rect)) return [mark];
        const scaleX = to.rect.width / from.rect.width;
        const scaleY = to.rect.height / from.rect.height;
        const move = (point: Point): Point => ({
            x: to.rect.x + (point.x - from.rect.x) * scaleX,
            y: to.rect.y + (point.y - from.rect.y) * scaleY,
        });
        const corner = move(mark.box);
        return [
            {
                ...mark,
                box: {
                    x: corner.x,
                    y: corner.y,
                    width: mark.box.width * scaleX,
                    height: mark.box.height * scaleY,
                },
                strokes: mark.strokes.map((stroke) => ({
                    points: stroke.points.map(move),
                })),
            },
        ];
    });
