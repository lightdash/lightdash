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

const AIM_WINDOW_MS = 80;
const AIM_DWELL_MS = 150;
const AIM_SLACK_PX = 8;

const contains = (box: Box, p: Point) =>
    p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom;

// Does the ray from `from` through `to` reach the box ahead of `to`
const isMovingToward = (from: Point, to: Point, box: Box) => {
    const axes: Array<[number, number, number, number]> = [
        [to.x, to.x - from.x, box.left, box.right],
        [to.y, to.y - from.y, box.top, box.bottom],
    ];
    let enter = 0;
    let exit = Infinity;
    for (const [p, v, min, max] of axes) {
        if (v === 0) {
            if (p < min || p > max) return false;
        } else {
            const t1 = (min - p) / v;
            const t2 = (max - p) / v;
            enter = Math.max(enter, Math.min(t1, t2));
            exit = Math.min(exit, Math.max(t1, t2));
        }
    }
    return enter <= exit;
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
        isMovingToward(from, point, {
            left: actions.left - AIM_SLACK_PX,
            top: actions.top - AIM_SLACK_PX,
            right: actions.right + AIM_SLACK_PX,
            bottom: actions.bottom + AIM_SLACK_PX,
        });
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
    // Escape hides the hover until the pointer leaves the title
    const dismissedRef = useRef(false);
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
    useEffect(
        function dismissOnEscape() {
            if (!titleHovered) return;
            const onKeyDown = (e: KeyboardEvent) => {
                if (e.key !== 'Escape') return;
                dismissedRef.current = true;
                setHovered(false);
            };
            window.addEventListener('keydown', onKeyDown);
            return () => window.removeEventListener('keydown', onKeyDown);
        },
        [titleHovered, setHovered],
    );

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
            if (aim !== 'title') dismissedRef.current = false;
            setHovered(aim === 'title' && !dismissedRef.current);
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
        dismissedRef.current = false;
        setHovered(false);
    }, [setHovered]);

    return {
        titleHovered: enabled && titleHovered,
        pointerHandlers: { onPointerMove, onPointerLeave },
    };
};
