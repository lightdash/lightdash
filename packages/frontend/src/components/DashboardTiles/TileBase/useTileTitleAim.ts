import {
    useCallback,
    useEffect,
    useRef,
    useState,
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

const sideOf = (p: Point, a: Point, b: Point) =>
    (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);

const inTriangle = (p: Point, a: Point, b: Point, c: Point) => {
    const sides = [sideOf(p, a, b), sideOf(p, b, c), sideOf(p, c, a)];
    return !(sides.some((s) => s < 0) && sides.some((s) => s > 0));
};

type TitleAim = 'title' | 'headingForActions' | 'elsewhere';

// The actions own their box, shown or not; the title owns its resting text and,
// while hovered, the wrapped lines of its expanded form
export const resolveTitleAim = ({
    point,
    from,
    restingTitle,
    expandedTitle,
    actions,
    titleHovered,
}: {
    point: Point;
    from: Point | null;
    restingTitle: Box | null;
    expandedTitle: Box | null;
    actions: Box | null;
    titleHovered: boolean;
}): TitleAim => {
    if (!restingTitle || (actions && contains(actions, point)))
        return 'elsewhere';
    const onWrappedLines =
        titleHovered &&
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

/** Whether the title is hovered, judged by where the pointer is and is heading. */
export const useTileTitleAim = ({
    enabled,
    titleRef,
    actionsSelector,
}: {
    enabled: boolean;
    titleRef: RefObject<HTMLElement | null>;
    actionsSelector: string;
}) => {
    const [titleHovered, setTitleHovered] = useState(false);
    const hoveredRef = useRef(false);
    const restingTitleRef = useRef<DOMRect | null>(null);
    const trailRef = useRef<Array<Point & { t: number }>>([]);
    const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const setHovered = useCallback((hovered: boolean) => {
        hoveredRef.current = hovered;
        setTitleHovered(hovered);
    }, []);
    const clearDwell = () => {
        if (dwellRef.current) clearTimeout(dwellRef.current);
        dwellRef.current = null;
    };
    useEffect(function clearDwellOnUnmount() {
        return clearDwell;
    }, []);

    const onPointerMove = useCallback(
        (e: PointerEvent<HTMLElement>) => {
            if (!enabled || e.pointerType === 'touch') return;
            const title = titleRef.current;
            // The expanded title covers the header, so measure it at rest
            if (title && !hoveredRef.current)
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
                titleHovered: hoveredRef.current,
            });
            setHovered(aim === 'title');
            if (aim === 'headingForActions')
                dwellRef.current = setTimeout(
                    () => setHovered(true),
                    AIM_DWELL_MS,
                );
        },
        [enabled, titleRef, actionsSelector, setHovered],
    );

    const onPointerLeave = useCallback(() => {
        clearDwell();
        trailRef.current = [];
        setHovered(false);
    }, [setHovered]);

    return {
        titleHovered: enabled && titleHovered,
        pointerHandlers: { onPointerMove, onPointerLeave },
    };
};
