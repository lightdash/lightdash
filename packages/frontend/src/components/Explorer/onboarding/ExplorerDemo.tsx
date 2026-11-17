import { Box } from '@mantine/core';
import { type FC } from 'react';
import illustration from '../ResultsCard/ExploreIdleIllustration.module.css';
import classes from './ExplorerDemo.module.css';

type Tone = 'neutral' | 'dimension' | 'metric';
// What a box does in the loop: sit there, get picked, arrive as a result, or
// grow as a chart column
type Role = 'still' | 'pick-first' | 'pick-second' | 'result' | 'column';
// A box on the isometric floor: x runs down-right, y down-left, z up
type Piece = {
    x: number;
    y: number;
    z: number;
    w: number;
    d: number;
    h: number;
    tone: Tone;
    role: Role;
};

const FLOOR = { w: 150, d: 96 };
const ORIGIN = { x: 102, y: 22 };

const point = (x: number, y: number, z: number) => ({
    x: ORIGIN.x + x - y,
    y: ORIGIN.y + (x + y) / 2 - z,
});
const project = (x: number, y: number, z: number) => {
    const p = point(x, y, z);
    return `${p.x},${p.y}`;
};

const getFaces = ({ x, y, z, w, d, h }: Piece) => {
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

const PLATE: Piece = {
    x: 0,
    y: 0,
    z: -6,
    w: FLOOR.w,
    d: FLOOR.d,
    h: 6,
    tone: 'neutral',
    role: 'still',
};

// The field list: a raised panel of tiles, two of which get picked
const FIELD_ROWS = [6, 28, 50, 72];
const SIDEBAR: Piece[] = [
    {
        x: 2,
        y: 2,
        z: 0,
        w: 40,
        d: 92,
        h: 2,
        tone: 'neutral',
        role: 'still',
    },
    ...FIELD_ROWS.map((y, i): Piece => {
        const pick = i === 1 ? 'metric' : i === 3 ? 'dimension' : 'neutral';
        return {
            x: 6,
            y,
            z: 2,
            w: 32,
            d: 16,
            h: 3,
            tone: pick,
            role:
                pick === 'metric'
                    ? 'pick-first'
                    : pick === 'dimension'
                      ? 'pick-second'
                      : 'still',
        };
    }),
];

// The results: a dimension column and a metric column heading three rows
const RESULTS: Piece[] = [10, 32, 50, 68].flatMap((y, row) =>
    (['dimension', 'metric'] as const).map(
        (tone, column): Piece => ({
            x: 54 + 23 * column,
            y,
            z: 0,
            w: 20,
            d: row === 0 ? 16 : 13,
            h: row === 0 ? 5 : 2,
            tone: row === 0 ? tone : 'neutral',
            role: 'result',
        }),
    ),
);

// The chart: dimension tiles on the floor, each holding a metric column
const CHART: Piece[] = [20, 36, 26, 46].flatMap((h, i): Piece[] => [
    {
        x: 112,
        y: 6 + 22 * i,
        z: 0,
        w: 30,
        d: 18,
        h: 3,
        tone: 'dimension',
        role: 'result',
    },
    {
        x: 119,
        y: 9 + 22 * i,
        z: 3,
        w: 16,
        d: 12,
        h,
        tone: 'metric',
        role: 'column',
    },
]);

// Paint far pieces first so nearer ones overlap them
const PIECES = [...SIDEBAR, ...RESULTS, ...CHART].sort(
    (a, b) => a.x + a.y + a.z / 100 - (b.x + b.y + b.z / 100),
);

// Where the pointer rests while it picks each field
const FIRST_PICK = point(22, 36, 8);
const SECOND_PICK = point(22, 80, 8);

/**
 * A miniature of the Explorer on a loop, in the product's isometric style: a
 * metric and a dimension are picked from the field list, results arrive, then
 * the chart's columns rise.
 */
const ExplorerDemo: FC = () => (
    <Box className={classes.stage}>
        <Box
            component="svg"
            viewBox="0 0 256 170"
            className={classes.scene}
            aria-hidden
            __vars={{
                '--first-x': `${FIRST_PICK.x}px`,
                '--first-y': `${FIRST_PICK.y}px`,
                '--second-x': `${SECOND_PICK.x}px`,
                '--second-y': `${SECOND_PICK.y}px`,
            }}
        >
            <polygon
                className={illustration.shadow}
                points={[
                    project(0, 0, -16),
                    project(FLOOR.w, 0, -16),
                    project(FLOOR.w, FLOOR.d, -16),
                    project(0, FLOOR.d, -16),
                ].join(' ')}
            />
            <g className={illustration.plate}>
                <polygon
                    className={illustration.left}
                    points={getFaces(PLATE).left}
                />
                <polygon
                    className={illustration.right}
                    points={getFaces(PLATE).right}
                />
                <polygon
                    className={illustration.top}
                    points={getFaces(PLATE).top}
                />
            </g>
            {PIECES.map((piece, index) => {
                const faces = getFaces(piece);
                return (
                    <Box
                        component="g"
                        key={`${piece.x}-${piece.y}-${piece.z}`}
                        className={`${illustration.piece} ${classes.piece}`}
                        data-tone={piece.tone}
                        data-role={piece.role}
                        __vars={{ '--i': `${index}` }}
                    >
                        <polygon
                            className={illustration.left}
                            points={faces.left}
                        />
                        <polygon
                            className={illustration.right}
                            points={faces.right}
                        />
                        <polygon
                            className={illustration.top}
                            points={faces.top}
                        />
                    </Box>
                );
            })}
            <circle className={classes.pointer} r={4} cx={0} cy={0} />
        </Box>
    </Box>
);

export default ExplorerDemo;
