import { Box } from '@mantine/core';
import { type FC } from 'react';
import {
    getFaces,
    project,
    type Solid,
} from '../../../../../components/Explorer/ResultsCard/isometric';
import classes from './StudioDraftIllustration.module.css';

type Piece = Solid & {
    tone: 'neutral' | 'dimension' | 'metric' | 'ghost';
    // Rising pieces are the draft, which moves on hover
    rises: boolean;
    // Dotted lines drop from the piece's corners to this height
    guideTo: number | null;
};

const FLOOR = 96;
const GRID = [24, 48, 72];
const PLATE: Solid = { x: 0, y: 0, z: -6, w: FLOOR, d: FLOOR, h: 6 };

const getStorey = (z: number): Piece => ({
    x: 20,
    y: 20,
    z,
    w: 56,
    d: 56,
    h: 4,
    tone: 'neutral',
    rises: false,
    guideTo: null,
});

// Corner pillars, back to front
const getPillars = (z: number): Piece[] =>
    [
        [20, 20],
        [72, 20],
        [20, 72],
        [72, 72],
    ].map(([x, y]) => ({
        x,
        y,
        z,
        w: 4,
        d: 4,
        h: 14,
        tone: 'neutral',
        rises: false,
        guideTo: null,
    }));

// Published storeys, then the drafted one being lowered on with its new fields
const PIECES: Piece[] = [
    getStorey(0),
    ...getPillars(4),
    getStorey(18),
    ...getPillars(22),
    getStorey(36),
    { ...getStorey(62), tone: 'ghost', rises: true, guideTo: 40 },
    {
        x: 52,
        y: 28,
        z: 66,
        w: 14,
        d: 14,
        h: 20,
        tone: 'metric',
        rises: true,
        guideTo: null,
    },
    {
        x: 28,
        y: 52,
        z: 66,
        w: 18,
        d: 18,
        h: 3,
        tone: 'dimension',
        rises: true,
        guideTo: null,
    },
];

const Faces: FC<{ solid: Solid }> = ({ solid }) => {
    const faces = getFaces(solid);
    return (
        <>
            <polygon className={classes.left} points={faces.left} />
            <polygon className={classes.right} points={faces.right} />
            <polygon className={classes.top} points={faces.top} />
        </>
    );
};

const PieceShape: FC<{ piece: Piece; index: number }> = ({ piece, index }) => {
    const { x, y, z, w, d, guideTo } = piece;
    return (
        <>
            {guideTo !== null &&
                [
                    [x, y + d],
                    [x + w, y + d],
                    [x + w, y],
                ].map(([a, b]) => (
                    <polyline
                        key={`${a}-${b}`}
                        className={classes.guide}
                        points={`${project(a, b, z)} ${project(a, b, guideTo)}`}
                    />
                ))}
            <Box
                component="g"
                className={classes.piece}
                data-tone={piece.tone}
                mod={{ rises: piece.rises }}
                __vars={{ '--i': `${index}` }}
            >
                <Faces solid={piece} />
            </Box>
        </>
    );
};

/** A building whose top storey is still a draft, apart from the published ones. */
export const StudioDraftIllustration: FC = () => (
    <Box
        component="svg"
        viewBox="0 -14 240 170"
        w={200}
        className={classes.root}
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
        <g className={classes.plate}>
            <Faces solid={PLATE} />
        </g>
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
        {PIECES.map((piece, index) => (
            <PieceShape
                key={`${piece.x}-${piece.y}-${piece.z}`}
                piece={piece}
                index={index}
            />
        ))}
    </Box>
);
