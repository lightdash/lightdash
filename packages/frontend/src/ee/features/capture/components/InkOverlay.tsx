import {
    useEffect,
    useRef,
    type CSSProperties,
    type FC,
    type MouseEvent,
} from 'react';
import { CAPTURE_IGNORE_ATTRIBUTE } from '../frameSource';
import { type Box, type Point, type Stroke } from '../types';
import classes from './InkOverlay.module.css';

export type FadingMark = { strokes: Stroke[]; number: number; box: Box };

/** How far, in pixels, a press moves before it draws instead of picking. */
const DRAG_THRESHOLD_PX = 4;

type Press = { x: number; y: number; points: Point[]; drawing: boolean };

type Props = {
    rect: DOMRect;
    /** Option is held: the layer takes the pointer. */
    holding: boolean;
    /** Ink is hidden until the clean picture of the screen has been taken. */
    inkVisible: boolean;
    strokes: Stroke[];
    /** The colour of the bubble the ink goes into. */
    color: string;
    fading: FadingMark | null;
    /** The outline of what a click would pick. */
    hover: Box | null;
    /** The pointer moved with no button down; null when it left. */
    onHover: (point: Point | null) => void;
    onStrokePoint: (point: Point) => void;
    onStrokeEnd: () => void;
    /** A press released without moving past the threshold. */
    onPick: (point: Point) => void;
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
    onHover,
    onStrokePoint,
    onStrokeEnd,
    onPick,
}) => {
    const pressRef = useRef<Press | null>(null);
    useEffect(() => {
        if (!holding) pressRef.current = null;
    }, [holding]);

    const toPoint = (event: MouseEvent<HTMLDivElement>): Point => ({
        x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    });

    // A press that stays put picks; one that moves draws from where it began.
    const onMove = (event: MouseEvent<HTMLDivElement>) => {
        if (!holding) return;
        const press = pressRef.current;
        if (!press) {
            onHover(toPoint(event));
            return;
        }
        if (press.drawing) {
            onStrokePoint(toPoint(event));
            return;
        }
        press.points.push(toPoint(event));
        const moved = Math.hypot(
            event.clientX - press.x,
            event.clientY - press.y,
        );
        if (moved <= DRAG_THRESHOLD_PX) return;
        press.drawing = true;
        onHover(null);
        press.points.forEach(onStrokePoint);
    };

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
                // No text selection, native drag or focus change under the press.
                onMouseDown={(event) => {
                    event.preventDefault();
                    if (!holding || event.button !== 0) return;
                    pressRef.current = {
                        x: event.clientX,
                        y: event.clientY,
                        points: [toPoint(event)],
                        drawing: false,
                    };
                }}
                onMouseMove={onMove}
                onMouseUp={() => {
                    const press = pressRef.current;
                    pressRef.current = null;
                    if (!press) return;
                    if (press.drawing) onStrokeEnd();
                    else onPick(press.points[0]);
                }}
                onMouseLeave={() => {
                    const press = pressRef.current;
                    pressRef.current = null;
                    if (press?.drawing) onStrokeEnd();
                    onHover(null);
                }}
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
