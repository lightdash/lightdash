import { type CSSProperties, type FC, type MouseEvent } from 'react';
import { CAPTURE_IGNORE_ATTRIBUTE } from '../frameSource';
import { type Box, type Point, type Stroke } from '../types';
import classes from './InkOverlay.module.css';

export type FadingMark = { strokes: Stroke[]; number: number; box: Box };

type Props = {
    rect: DOMRect;
    /** Shift is held: the layer takes the pointer. */
    holding: boolean;
    /** Ink is hidden until the clean picture of the screen has been taken. */
    inkVisible: boolean;
    strokes: Stroke[];
    /** The colour of the bubble the ink goes into. */
    color: string;
    fading: FadingMark | null;
    /** Cursor: the outline of the element under the pointer. */
    hover: Box | null;
    onStrokePoint: (point: Point) => void;
    onStrokeEnd: () => void;
    /** Cursor: a press picks what is under the pointer. Null for the stylus. */
    onPick: ((point: Point) => void) | null;
};

const toPath = (stroke: Stroke): string =>
    stroke.points
        .map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
        .join(' ');

const InkOverlay: FC<Props> = ({
    rect,
    holding,
    inkVisible,
    strokes,
    color,
    fading,
    hover,
    onStrokePoint,
    onStrokeEnd,
    onPick,
}) => {
    const toPoint = (event: MouseEvent<HTMLDivElement>): Point => ({
        x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    });

    const renderStrokes = (items: Stroke[]) =>
        items.map((stroke, i) => (
            <path
                // oxlint-disable-next-line react/no-array-index-key
                key={i}
                d={toPath(stroke)}
                fill="none"
                stroke={color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
            />
        ));

    return (
        <>
            <div
                className={classes.outline}
                {...{ [CAPTURE_IGNORE_ATTRIBUTE]: '' }}
                style={
                    {
                        '--region-left': `${rect.left}px`,
                        '--region-top': `${rect.top}px`,
                        '--region-width': `${rect.width}px`,
                        '--region-height': `${rect.height}px`,
                    } as CSSProperties
                }
            />
            <div
                className={classes.layer}
                {...{ [CAPTURE_IGNORE_ATTRIBUTE]: '' }}
                data-holding={holding}
                style={
                    {
                        '--region-left': `${rect.left}px`,
                        '--region-top': `${rect.top}px`,
                        '--region-width': `${rect.width}px`,
                        '--region-height': `${rect.height}px`,
                        '--bubble-color': color,
                    } as CSSProperties
                }
                // Moving the mouse draws; a click must not reach the app.
                onMouseDown={(event) => {
                    event.preventDefault();
                    if (holding && onPick) onPick(toPoint(event));
                }}
                onMouseMove={(event) => {
                    if (holding) onStrokePoint(toPoint(event));
                }}
                onMouseLeave={onStrokeEnd}
            >
                <svg
                    className={classes.ink}
                    viewBox="0 0 1 1"
                    preserveAspectRatio="none"
                >
                    {inkVisible && renderStrokes(strokes)}
                    {fading && (
                        <g className={classes.fading}>
                            {renderStrokes(fading.strokes)}
                        </g>
                    )}
                </svg>
                {hover && (
                    <div
                        className={classes.hover}
                        style={
                            {
                                '--hover-left': `${hover.x * 100}%`,
                                '--hover-top': `${hover.y * 100}%`,
                                '--hover-width': `${hover.width * 100}%`,
                                '--hover-height': `${hover.height * 100}%`,
                            } as CSSProperties
                        }
                    />
                )}
                {fading && (
                    <div
                        className={`${classes.badge} ${classes.fading}`}
                        style={
                            {
                                '--badge-left': `${fading.box.x * 100}%`,
                                '--badge-top': `${fading.box.y * 100}%`,
                            } as CSSProperties
                        }
                    >
                        {fading.number}
                    </div>
                )}
            </div>
        </>
    );
};

export default InkOverlay;
