// PROTOTYPE (throwaway): decides whether the pointer is on the title or heading for the action pill
import { useCallback, useEffect, useRef, type PointerEvent } from 'react';

type Point = { x: number; y: number; t: number };

const AIM_WINDOW_MS = 80;
// A pointer that stops on the title while "aiming" still gets the title
const DWELL_MS = 150;
const AIM_SLACK_PX = 8;

const contains = (r: DOMRect, x: number, y: number) =>
    x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

const sign = (p: Point, a: Point, b: Point) =>
    (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);

const inTriangle = (p: Point, a: Point, b: Point, c: Point) => {
    const d1 = sign(p, a, b);
    const d2 = sign(p, b, c);
    const d3 = sign(p, c, a);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
};

/**
 * The title owns the pointer only over its resting text box, and not while the
 * pointer is moving toward the pill (safe-triangle test, as nested menus do).
 * The pill owns its own box. Same position, same answer, whatever the path.
 */
export const useTitleAim = ({
    enabled,
    titleRef,
    pillSelector,
    onTitleActiveChange,
}: {
    enabled: boolean;
    titleRef: React.RefObject<HTMLElement | null>;
    pillSelector: string;
    onTitleActiveChange: (active: boolean) => void;
}) => {
    const activeRef = useRef(false);
    const restingTitleRect = useRef<DOMRect | null>(null);
    const trail = useRef<Point[]>([]);
    const dwell = useRef<ReturnType<typeof setTimeout> | null>(null);

    const set = useCallback(
        (active: boolean) => {
            if (activeRef.current === active) return;
            activeRef.current = active;
            onTitleActiveChange(active);
        },
        [onTitleActiveChange],
    );
    const clearDwell = () => {
        if (dwell.current) clearTimeout(dwell.current);
        dwell.current = null;
    };
    useEffect(() => clearDwell, []);

    const onPointerMove = useCallback(
        (e: PointerEvent<HTMLElement>) => {
            if (!enabled || e.pointerType !== 'mouse') return;
            const title = titleRef.current;
            const pill = e.currentTarget.querySelector(pillSelector);
            // Measure the title only while it is not expanded over the header
            if (title && !activeRef.current)
                restingTitleRect.current = title.getBoundingClientRect();
            const titleRect = restingTitleRect.current;
            const pillRect = pill?.getBoundingClientRect() ?? null;

            const now: Point = { x: e.clientX, y: e.clientY, t: e.timeStamp };
            trail.current = [
                ...trail.current.filter((p) => now.t - p.t <= AIM_WINDOW_MS),
                now,
            ];

            const inPill = !!pillRect && contains(pillRect, now.x, now.y);
            const inTitle =
                !!titleRect && !inPill && contains(titleRect, now.x, now.y);
            clearDwell();
            if (!inTitle) {
                set(false);
                return;
            }
            const from = trail.current[0];
            const aimingAtPill =
                !!pillRect &&
                from !== now &&
                inTriangle(
                    now,
                    from,
                    { x: pillRect.left, y: pillRect.top - AIM_SLACK_PX, t: 0 },
                    {
                        x: pillRect.left,
                        y: pillRect.bottom + AIM_SLACK_PX,
                        t: 0,
                    },
                );
            if (aimingAtPill) {
                set(false);
                dwell.current = setTimeout(() => set(true), DWELL_MS);
            } else {
                set(true);
            }
        },
        [enabled, titleRef, pillSelector, set],
    );

    const onPointerLeave = useCallback(() => {
        if (!enabled) return;
        clearDwell();
        trail.current = [];
        set(false);
    }, [enabled, set]);

    return enabled ? { onPointerMove, onPointerLeave } : {};
};
