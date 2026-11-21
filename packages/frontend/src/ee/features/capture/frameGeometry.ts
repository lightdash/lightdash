import { type CaptureMark } from './types';

export type Size = { width: number; height: number };
export type PixelRect = { x: number; y: number; width: number; height: number };

/** What the user is looking at when a mark is made. */
export type ScreenView = {
    tabUuid: string | null;
    scroll: { x: number; y: number };
    size: Size;
    /** Counts the times the page's content was replaced. */
    epoch: number;
};

const SAME_SCREEN_MAX_SCROLL_PX = 4;

/** Marks on the same view share one picture, so no new one is taken. */
export const sameScreen = (a: ScreenView, b: ScreenView): boolean =>
    a.tabUuid === b.tabUuid &&
    a.epoch === b.epoch &&
    a.size.width === b.size.width &&
    a.size.height === b.size.height &&
    Math.abs(a.scroll.x - b.scroll.x) <= SAME_SCREEN_MAX_SCROLL_PX &&
    Math.abs(a.scroll.y - b.scroll.y) <= SAME_SCREEN_MAX_SCROLL_PX;

/** Moves marks by a share of the picture, for one taken after the page scrolled. */
export const shiftMarks = (
    marks: CaptureMark[],
    by: { x: number; y: number },
): CaptureMark[] =>
    by.x === 0 && by.y === 0
        ? marks
        : marks.map((mark) => ({
              ...mark,
              box: { ...mark.box, x: mark.box.x + by.x, y: mark.box.y + by.y },
              strokes: mark.strokes.map((stroke) => ({
                  points: stroke.points.map((point) => ({
                      x: point.x + by.x,
                      y: point.y + by.y,
                  })),
              })),
          }));
