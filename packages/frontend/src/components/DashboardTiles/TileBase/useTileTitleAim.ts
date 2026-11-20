import {
    useCallback,
    useEffect,
    useRef,
    type PointerEvent,
    type RefObject,
} from 'react';

type Point = { x: number; y: number };
type Box = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>;

// How far back the pointer's direction is read from
const AIM_WINDOW_MS = 80;
// A pointer that stops on the title while heading for the actions gets the title
const AIM_DWELL_MS = 150;
const AIM_SLACK_PX = 8;

const contains = (box: Box, p: Point) =>
    p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom;

const cross = (p: Point, a: Point, b: Point) =>
    (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);

const inTriangle = (p: Point, a: Point, b: Point, c: Point) => {
    const d = [cross(p, a, b), cross(p, b, c), cross(p, c, a)];
    return !(d.some((v) => v < 0) && d.some((v) => v > 0));
};

export type TitleAim = 'title' | 'headingForActions' | 'elsewhere';

/**
 * The actions own their box whether shown or not. The title owns only its
 * resting text, plus the lower lines of its expanded, wrapped form while it is
 * active. A pointer on the title moving toward the actions is heading for them.
 */
export const resolveTitleAim = ({
    point,
    from,
    restingTitle,
    expandedTitle,
    actions,
    titleActive,
}: {
    point: Point;
    from: Point | null;
    restingTitle: Box | null;
    expandedTitle: Box | null;
    actions: Box | null;
    titleActive: boolean;
}): TitleAim => {
    if (!restingTitle || (actions && contains(actions, point)))
        return 'elsewhere';
    const onWrappedLines =
        titleActive &&
        !!expandedTitle &&
        point.y > restingTitle.bottom &&
        contains(expandedTitle, point);
    if (!contains(restingTitle, point) && !onWrappedLines) return 'elsewhere';
    const headingForActions =
        !!actions &&
        !!from &&
        (from.x !== point.x || from.y !== point.y) &&
        inTriangle(
            point,
            from,
            { x: actions.left, y: actions.top - AIM_SLACK_PX },
            { x: actions.left, y: actions.bottom + AIM_SLACK_PX },
        );
    return headingForActions ? 'headingForActions' : 'title';
};

/** Pointer handlers for the tile that decide when the title is hovered. */
export const useTileTitleAim = ({
    enabled,
    titleRef,
    actionsSelector,
    onTitleActiveChange,
}: {
    enabled: boolean;
    titleRef: RefObject<HTMLElement | null>;
    actionsSelector: string;
    onTitleActiveChange: (active: boolean) => void;
}) => {
    const activeRef = useRef(false);
    const restingTitleRef = useRef<DOMRect | null>(null);
    const trailRef = useRef<Array<Point & { t: number }>>([]);
    const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const setActive = useCallback(
        (active: boolean) => {
            if (activeRef.current === active) return;
            activeRef.current = active;
            onTitleActiveChange(active);
        },
        [onTitleActiveChange],
    );
    const clearDwell = () => {
        if (dwellRef.current) clearTimeout(dwellRef.current);
        dwellRef.current = null;
    };
    useEffect(() => clearDwell, []);

    const onPointerMove = useCallback(
        (e: PointerEvent<HTMLElement>) => {
            if (e.pointerType === 'touch') return;
            const title = titleRef.current;
            // The expanded title covers the header, so measure it at rest
            if (title && !activeRef.current)
                restingTitleRef.current = title.getBoundingClientRect();

            const point = { x: e.clientX, y: e.clientY, t: e.timeStamp };
            trailRef.current = [
                ...trailRef.current.filter(
                    (p) => point.t - p.t <= AIM_WINDOW_MS,
                ),
                point,
            ];

            clearDwell();
            const aim = resolveTitleAim({
                point,
                from: trailRef.current[0],
                restingTitle: restingTitleRef.current,
                expandedTitle: title?.getBoundingClientRect() ?? null,
                actions:
                    e.currentTarget
                        .querySelector(actionsSelector)
                        ?.getBoundingClientRect() ?? null,
                titleActive: activeRef.current,
            });
            setActive(aim === 'title');
            if (aim === 'headingForActions')
                dwellRef.current = setTimeout(
                    () => setActive(true),
                    AIM_DWELL_MS,
                );
        },
        [titleRef, actionsSelector, setActive],
    );

    const onPointerLeave = useCallback(() => {
        clearDwell();
        trailRef.current = [];
        setActive(false);
    }, [setActive]);

    return enabled ? { onPointerMove, onPointerLeave } : {};
};
