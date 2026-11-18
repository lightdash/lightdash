import { type CSSProperties, type FC, type MouseEvent } from 'react';
import { INK_COLOR } from '../composeImage';
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
    fading: FadingMark | null;
    onStrokePoint: (point: Point) => void;
    onStrokeEnd: () => void;
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
    fading,
    onStrokePoint,
    onStrokeEnd,
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
                stroke={INK_COLOR}
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
                data-holding={holding}
                style={
                    {
                        '--region-left': `${rect.left}px`,
                        '--region-top': `${rect.top}px`,
                        '--region-width': `${rect.width}px`,
                        '--region-height': `${rect.height}px`,
                    } as CSSProperties
                }
                // Moving the mouse draws; a click must not reach the app.
                onMouseDown={(event) => event.preventDefault()}
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
