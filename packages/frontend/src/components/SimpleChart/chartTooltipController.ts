// Bridge tiny visual gaps without using ECharts' default 44px touch halo.
export const CHART_POINTER_OPTIONS = {
    useCoarsePointer: true,
    pointerSize: 12,
};
const GAP_GRACE_MS = 120;

type Point = { x: number; y: number };
type TooltipControllerOptions<Item> = {
    dispatchAction: (
        action: Record<string, unknown> & { type: string },
    ) => void;
    formatItem: (item: Item) => string;
    focusItem: (item: Item | null) => void;
    containsPoint: (point: Point) => boolean;
    projectAxisPoint: (point: Point) => Point | null;
    requestFrame?: typeof requestAnimationFrame;
    cancelFrame?: typeof cancelAnimationFrame;
};

/** Drive tooltip actions without rebuilding chart options on pointer movement. */
export const createChartTooltipController = <Item>({
    dispatchAction,
    formatItem,
    focusItem,
    containsPoint,
    projectAxisPoint,
    requestFrame = requestAnimationFrame,
    cancelFrame = cancelAnimationFrame,
}: TooltipControllerOptions<Item>) => {
    let item: Item | null = null;
    let point: Point = { x: 0, y: 0 };
    let frame: number | null = null;
    let gapTimer: ReturnType<typeof setTimeout> | undefined;
    let itemContent: string | undefined;

    const cancelGap = () => {
        clearTimeout(gapTimer);
        gapTimer = undefined;
    };
    const releaseItem = () => {
        cancelGap();
        item = null;
        itemContent = undefined;
        focusItem(null);
    };
    const cancel = () => {
        cancelGap();
        if (frame !== null) cancelFrame(frame);
        frame = null;
    };
    const render = () => {
        frame = null;
        const projectedPoint = projectAxisPoint(point);
        if (projectedPoint || !containsPoint(point)) releaseItem();
        if (item !== null) {
            itemContent ??= formatItem(item);
            const content = itemContent;
            dispatchAction({
                type: 'showTip',
                ...point,
                tooltip: { content, formatter: () => content },
            });
        } else if (projectedPoint) {
            dispatchAction({ type: 'showTip', ...projectedPoint });
        }
        // ECharts owns ordinary category/legend tooltips.
    };

    return {
        setItem: (nextItem: Item | null) => {
            if (nextItem !== null) {
                cancelGap();
                item = nextItem;
                itemContent = undefined;
                focusItem(nextItem);
            } else if (item !== null && gapTimer === undefined) {
                // A short gap is part of the same gesture. Only resting in
                // whitespace restores the full category, with no chart update.
                gapTimer = setTimeout(() => {
                    releaseItem();
                    if (containsPoint(point)) {
                        dispatchAction({ type: 'showTip', ...point });
                    }
                }, GAP_GRACE_MS);
            }
        },
        move: (nextPoint: Point) => {
            point = nextPoint;
            if (frame === null) frame = requestFrame(render);
        },
        leave: () => {
            cancel();
            releaseItem();
            dispatchAction({ type: 'updateAxisPointer', currTrigger: 'leave' });
            dispatchAction({ type: 'hideTip' });
        },
        dispose: () => {
            cancel();
            releaseItem();
        },
    };
};
