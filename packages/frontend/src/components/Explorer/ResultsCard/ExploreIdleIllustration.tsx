import { Box } from '@mantine/core';
import { type FC } from 'react';
import classes from './ExploreIdleIllustration.module.css';

type Tone = 'neutral' | 'dimension' | 'metric' | 'ghost';
type Variant = 'chart' | 'table' | 'fields' | 'tables';
// A box on the isometric floor: x runs down-right, y down-left, z up
type Piece = {
    x: number;
    y: number;
    z: number;
    w: number;
    d: number;
    h: number;
    tone: Tone;
    // Rising pieces move on hover and while loading
    rises: boolean;
};

const FLOOR = 96;
const ORIGIN = { x: 120, y: 44 };

const project = (x: number, y: number, z: number) =>
    `${ORIGIN.x + x - y},${ORIGIN.y + (x + y) / 2 - z}`;

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
    w: FLOOR,
    d: FLOOR,
    h: 6,
    tone: 'neutral',
    rises: false,
};

const GRID = [24, 48, 72];

// Dimensions are flat tiles on the floor; metrics are the columns they hold
const getBars = (columnTone: Tone): Piece[] =>
    [16, 30, 22, 40].flatMap((h, i) => [
        {
            x: 6 + 22 * i,
            y: 38,
            z: 0,
            w: 16,
            d: 20,
            h: 4,
            tone: 'dimension',
            rises: false,
        },
        {
            x: 9 + 22 * i,
            y: 42,
            z: 4,
            w: 10,
            d: 12,
            h,
            tone: columnTone,
            rises: true,
        },
    ]);

// Two dimension columns and a metric column heading empty rows
const TABLE: Piece[] = [0, 1, 2, 3].flatMap((row) =>
    (['dimension', 'dimension', 'metric'] as const).map((tone, column) => ({
        x: 6 + 29 * column,
        y: 12 + 17 * row,
        z: 0,
        w: 26,
        d: 14,
        h: row === 0 ? 5 : 2,
        tone: row === 0 ? tone : 'neutral',
        rises: row === 0,
    })),
);

// One metric to measure, and the dimensions to split it by
const FIELDS: Piece[] = [
    {
        x: 38,
        y: 12,
        z: 0,
        w: 22,
        d: 22,
        h: 44,
        tone: 'metric',
        rises: true,
    },
    ...[0, 1, 2].map(
        (i): Piece => ({
            x: 5 + 30 * i,
            y: 62,
            z: 0,
            w: 26,
            d: 22,
            h: 4,
            tone: 'dimension',
            rises: false,
        }),
    ),
];

// A stack of tables to choose from, the top one lifted
const TABLES: Piece[] = [0, 1, 2].map((i) => ({
    x: 18,
    y: 18,
    z: 16 * i,
    w: 60,
    d: 60,
    h: 4,
    tone: 'neutral',
    rises: i === 2,
}));

const getPieces = (variant: Variant, loading: boolean): Piece[] => {
    switch (variant) {
        case 'chart':
            return getBars(loading ? 'metric' : 'ghost');
        case 'table':
            return TABLE;
        case 'fields':
            return FIELDS;
        case 'tables':
            return TABLES;
    }
};

const PieceShape: FC<{ piece: Piece; className: string; index: number }> = ({
    piece,
    className,
    index,
}) => {
    const faces = getFaces(piece);
    return (
        <Box
            component="g"
            className={className}
            data-tone={piece.tone}
            mod={{ rises: piece.rises }}
            __vars={{ '--i': `${index}` }}
        >
            <polygon className={classes.left} points={faces.left} />
            <polygon className={classes.right} points={faces.right} />
            <polygon className={classes.top} points={faces.top} />
        </Box>
    );
};

type Props = {
    variant: Variant;
    // Loops the pieces as a progress indicator
    loading?: boolean;
};

const ExploreIdleIllustration: FC<Props> = ({ variant, loading = false }) => (
    <Box
        component="svg"
        viewBox="0 0 240 164"
        className={classes.root}
        mod={{ loading }}
        aria-hidden
    >
        <polygon
            className={classes.shadow}
            points={[
                project(0, 0, -16),
                project(FLOOR, 0, -16),
                project(FLOOR, FLOOR, -16),
                project(0, FLOOR, -16),
            ].join(' ')}
        />
        <PieceShape piece={PLATE} className={classes.plate} index={0} />
        <g className={classes.grid}>
            {GRID.map((at) => (
                <polyline
                    key={`x${at}`}
                    points={`${project(at, 0, 0)} ${project(at, FLOOR, 0)}`}
                />
            ))}
            {GRID.map((at) => (
                <polyline
                    key={`y${at}`}
                    points={`${project(0, at, 0)} ${project(FLOOR, at, 0)}`}
                />
            ))}
        </g>
        {getPieces(variant, loading).map((piece, index) => (
            <PieceShape
                key={`${piece.x}-${piece.y}-${piece.z}`}
                piece={piece}
                className={classes.piece}
                index={index}
            />
        ))}
    </Box>
);

export default ExploreIdleIllustration;
