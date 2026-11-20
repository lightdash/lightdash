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

const textLines = (el: HTMLElement): Box[] => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return [...range.getClientRects()];
};

type TitleAim = 'title' | 'headingForActions' | 'elsewhere';

// The actions own their box, shown or not; the title owns its resting text and,
// while hovered, the wrapped lines of its expanded form
export const resolveTitleAim = ({
    point,
    from,
    restingTitle,
    expandedTitleLines,
    actions,
    titleHovered,
}: {
    point: Point;
    from: Point | null;
    restingTitle: Box | null;
    expandedTitleLines: Box[];
    actions: Box | null;
    titleHovered: boolean;
}): TitleAim => {
    if (!restingTitle || (actions && contains(actions, point)))
        return 'elsewhere';
    const onWrappedLines =
        titleHovered &&
        point.y > restingTitle.bottom &&
        expandedTitleLines.some((line) => contains(line, point));
    if (!contains(restingTitle, point) && !onWrappedLines) return 'elsewhere';
    const headingForActions =
        !!actions &&
        !!from &&
        (from.x !== point.x || from.y !== point.y) &&
        isMovingToward(from, point, actions);
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
    // Escape closes the description until the pointer leaves the title
    const [descriptionDismissed, setDescriptionDismissed] = useState(false);
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
    const reset = useCallback(() => {
        clearDwell();
        trailRef.current = [];
        restingTitleRef.current = null;
        setDescriptionDismissed(false);
        setHovered(false);
    }, [setHovered]);
    useEffect(function clearDwellOnUnmount() {
        return clearDwell;
    }, []);
    useEffect(
        function resetWhenDisabled() {
            if (!enabled) reset();
        },
        [enabled, reset],
    );
    // A still pointer gets no moves while the page scrolls under it
    useEffect(
        function resetOnScroll() {
            if (!titleHovered) return;
            window.addEventListener('scroll', reset, true);
            return () => window.removeEventListener('scroll', reset, true);
        },
        [titleHovered, reset],
    );
    useEffect(
        function dismissOnEscape() {
            if (!titleHovered) return;
            const onKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') setDescriptionDismissed(true);
            };
            window.addEventListener('keydown', onKeyDown);
            return () => window.removeEventListener('keydown', onKeyDown);
        },
        [titleHovered],
    );

    const onPointerMove = useCallback(
        (e: PointerEvent<HTMLElement>) => {
            if (!enabled || e.pointerType === 'touch') return;
            // A pen pressed to the screen is dragging, not hovering
            if (e.pointerType === 'pen' && e.buttons !== 0) return;
            const title = titleRef.current;
            if (!title) {
                reset();
                return;
            }
            // The expanded title covers the header, so measure it at rest
            if (!hoveredRef.current)
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
                expandedTitleLines: textLines(title),
                actions:
                    e.currentTarget
                        .querySelector(actionsSelector)
                        ?.getBoundingClientRect() ?? null,
                titleHovered: hoveredRef.current,
            });
            if (aim === 'elsewhere') setDescriptionDismissed(false);
            setHovered(aim === 'title');
            if (aim === 'headingForActions')
                dwellRef.current = setTimeout(
                    () => setHovered(true),
                    AIM_DWELL_MS,
                );
        },
        [enabled, titleRef, actionsSelector, setHovered, reset],
    );

    return {
        titleHovered: enabled && titleHovered,
        descriptionOpened: enabled && titleHovered && !descriptionDismissed,
        pointerHandlers: { onPointerMove, onPointerLeave: reset },
    };
};
