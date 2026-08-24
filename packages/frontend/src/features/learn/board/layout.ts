import { GROUP_ORDER, type BoardGroup } from './model';

export const BOARD_WIDTH = 1120;
export const NODE_SIZE = 38;

const GUTTER_X = 24;
const GUTTER_Y = 60;
const CELL_HEIGHT = 320;
const BOTTOM_PAD = 40;
const CLUSTER_Y_OFFSET = 16;
const MIN_RADIUS = 78;
const ARC_PER_NODE = 54;
const MIN_TRUNK_RADIUS = 42;
const CAPTION_HALF_WIDTH = 75;
const CAPTION_GAP = 22;
const TRIM = 22;

export type LayoutModule = { id: string; group: BoardGroup; unlocked: boolean };
export type Seat = { x: number; y: number };
export type NodeSeat = Seat & { id: string; unlocked: boolean; index: number };
export type Connector = {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    kind: 'ring' | 'trunk';
};
export type Caption = {
    group: BoardGroup;
    x: number;
    y: number;
    unlocked: number;
    total: number;
};
export type BoardLayout = {
    width: number;
    height: number;
    nodes: NodeSeat[];
    connectors: Connector[];
    captions: Caption[];
};

type Grid = {
    rows: number;
    cols: number;
    cellWidth: number;
    height: number;
    live: BoardGroup[];
};

type Cluster = {
    group: BoardGroup;
    cx: number;
    cy: number;
    radius: number;
    visible: LayoutModule[];
};

const groupModules = (
    modules: LayoutModule[],
): Map<BoardGroup, LayoutModule[]> => {
    const byGroup = new Map<BoardGroup, LayoutModule[]>();
    for (const m of modules) {
        const list = byGroup.get(m.group) ?? [];
        list.push(m);
        byGroup.set(m.group, list);
    }
    return new Map(
        [...byGroup.entries()].sort(
            ([a], [b]) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b),
        ),
    );
};

const gridFor = (byGroup: Map<BoardGroup, LayoutModule[]>): Grid => {
    const live = [...byGroup.entries()]
        .filter(([, list]) => list.some((m) => m.unlocked))
        .map(([group]) => group);
    const rows = live.length <= 3 ? 1 : 2;
    const cols = Math.ceil(Math.max(1, live.length) / rows);
    return {
        rows,
        cols,
        cellWidth: (BOARD_WIDTH - GUTTER_X * 2) / cols,
        height: GUTTER_Y + rows * CELL_HEIGHT + BOTTOM_PAD,
        live,
    };
};

const ringRadius = (visibleCount: number): number =>
    visibleCount > 1
        ? Math.max(MIN_RADIUS, (visibleCount * ARC_PER_NODE) / (2 * Math.PI))
        : 0;

const clusterFor = (
    group: BoardGroup,
    list: LayoutModule[],
    grid: Grid,
): Cluster => {
    const slot = grid.live.indexOf(group);
    const visible = list.filter((m) => m.unlocked);
    if (slot < 0) {
        return {
            group,
            cx: BOARD_WIDTH / 2,
            cy: GUTTER_Y + (grid.rows * CELL_HEIGHT) / 2,
            radius: 0,
            visible,
        };
    }
    const col = slot % grid.cols;
    const row = Math.floor(slot / grid.cols);
    return {
        group,
        cx: GUTTER_X + col * grid.cellWidth + grid.cellWidth / 2,
        cy: GUTTER_Y + row * CELL_HEIGHT + CELL_HEIGHT / 2 + CLUSTER_Y_OFFSET,
        radius: ringRadius(visible.length),
        visible,
    };
};

const seatIn = (cluster: Cluster, visibleIndex: number): Seat => {
    if (visibleIndex < 0 || cluster.radius === 0)
        return { x: cluster.cx, y: cluster.cy };
    const angle =
        ((-90 + (visibleIndex * 360) / cluster.visible.length) * Math.PI) / 180;
    return {
        x: cluster.cx + cluster.radius * Math.cos(angle),
        y: cluster.cy + cluster.radius * Math.sin(angle),
    };
};

const trim = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    kind: Connector['kind'],
): Connector => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1;
    const ux = (dx / length) * TRIM;
    const uy = (dy / length) * TRIM;
    return { x1: x1 + ux, y1: y1 + uy, x2: x2 - ux, y2: y2 - uy, kind };
};

export const seatMap = (modules: LayoutModule[]): Map<string, Seat> => {
    const seats = new Map<string, Seat>();
    const byGroup = groupModules(modules);
    const grid = gridFor(byGroup);
    for (const [group, list] of byGroup) {
        const cluster = clusterFor(group, list, grid);
        for (const m of list) {
            seats.set(m.id, seatIn(cluster, cluster.visible.indexOf(m)));
        }
    }
    return seats;
};

export const buildLayout = (modules: LayoutModule[]): BoardLayout => {
    const byGroup = groupModules(modules);
    const grid = gridFor(byGroup);
    const nodes: NodeSeat[] = [];
    const connectors: Connector[] = [];
    const captions: Caption[] = [];
    const liveClusters: Cluster[] = [];

    for (const [group, list] of byGroup) {
        const cluster = clusterFor(group, list, grid);
        const seats = list.map((m) => ({
            m,
            seat: seatIn(cluster, cluster.visible.indexOf(m)),
        }));
        for (const { m, seat } of seats) {
            nodes.push({
                id: m.id,
                unlocked: m.unlocked,
                index: nodes.length,
                ...seat,
            });
        }
        const ring = seats
            .filter(({ m }) => m.unlocked)
            .map(({ seat }) => seat);
        if (ring.length === 2) {
            connectors.push(
                trim(ring[0].x, ring[0].y, ring[1].x, ring[1].y, 'ring'),
            );
        } else if (ring.length > 2) {
            ring.forEach((seat, i) => {
                const next = ring[(i + 1) % ring.length];
                connectors.push(trim(seat.x, seat.y, next.x, next.y, 'ring'));
            });
        }
        if (cluster.visible.length > 0) {
            const edge = Math.max(cluster.radius, MIN_TRUNK_RADIUS);
            captions.push({
                group,
                x: cluster.cx - CAPTION_HALF_WIDTH,
                y: cluster.cy - edge - CAPTION_GAP,
                unlocked: cluster.visible.length,
                total: list.length,
            });
            liveClusters.push(cluster);
        }
    }

    const trunk = (a: Cluster, b: Cluster) => {
        const ra = Math.max(a.radius, MIN_TRUNK_RADIUS);
        const rb = Math.max(b.radius, MIN_TRUNK_RADIUS);
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const length = Math.hypot(dx, dy) || 1;
        connectors.push(
            trim(
                a.cx + (dx / length) * ra,
                a.cy + (dy / length) * ra,
                b.cx - (dx / length) * rb,
                b.cy - (dy / length) * rb,
                'trunk',
            ),
        );
    };
    liveClusters.forEach((cluster, i) => {
        const col = i % grid.cols;
        const row = Math.floor(i / grid.cols);
        const right = liveClusters[i + 1];
        if (
            col < grid.cols - 1 &&
            right &&
            Math.floor((i + 1) / grid.cols) === row
        ) {
            trunk(cluster, right);
        }
        const below = liveClusters[i + grid.cols];
        if (row === 0 && (col === 0 || col === grid.cols - 1) && below) {
            trunk(cluster, below);
        }
    });

    return {
        width: BOARD_WIDTH,
        height: grid.height,
        nodes,
        connectors,
        captions,
    };
};
