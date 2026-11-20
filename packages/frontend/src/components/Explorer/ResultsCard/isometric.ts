// A box on the isometric floor: x runs down-right, y down-left, z up
export type Solid = {
    x: number;
    y: number;
    z: number;
    w: number;
    d: number;
    h: number;
};

const ORIGIN = { x: 120, y: 44 };

export const project = (x: number, y: number, z: number) =>
    `${ORIGIN.x + x - y},${ORIGIN.y + (x + y) / 2 - z}`;

export const getFaces = ({ x, y, z, w, d, h }: Solid) => {
    const t = z + h;
    return {
        top: [
            project(x, y, t),
            project(x + w, y, t),
            project(x + w, y + d, t),
            project(x, y + d, t),
        ].join(' '),
        left: [
            project(x, y + d, t),
            project(x + w, y + d, t),
            project(x + w, y + d, z),
            project(x, y + d, z),
        ].join(' '),
        right: [
            project(x + w, y, t),
            project(x + w, y + d, t),
            project(x + w, y + d, z),
            project(x + w, y, z),
        ].join(' '),
    };
};
