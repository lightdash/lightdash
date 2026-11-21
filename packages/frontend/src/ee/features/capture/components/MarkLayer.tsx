import { Box } from '@mantine/core';
import { type CSSProperties, type FC } from 'react';
import { INK_COLOR } from '../composeImage';
import { CAPTURE_IGNORE_ATTRIBUTE } from '../frameSource';
import { type LayerMark, type Stroke } from '../types';
import classes from './MarkLayer.module.css';

type Props = {
    /** The surface's area on screen; marks are clipped to it. */
    region: DOMRect;
    /** The surface's scroll now. Marks are stored in content pixels. */
    scroll: { x: number; y: number };
    marks: LayerMark[];
};

const toPath = (stroke: Stroke): string =>
    stroke.points
        .map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
        .join(' ');

const MarkLayer: FC<Props> = ({ region, scroll, marks }) => (
    <Box
        className={classes.layer}
        {...{ [CAPTURE_IGNORE_ATTRIBUTE]: '' }}
        style={
            {
                '--region-left': `${region.left}px`,
                '--region-top': `${region.top}px`,
                '--region-right': `${region.right}px`,
                '--region-bottom': `${region.bottom}px`,
            } as CSSProperties
        }
    >
        <svg className={classes.ink}>
            <g transform={`translate(${-scroll.x} ${-scroll.y})`}>
                {marks.flatMap((mark) =>
                    mark.strokes.map((stroke, i) => (
                        <path
                            // oxlint-disable-next-line react/no-array-index-key
                            key={`${mark.bubbleId}-${mark.number}-${i}`}
                            d={toPath(stroke)}
                            fill="none"
                            stroke={INK_COLOR}
                            strokeWidth={3}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    )),
                )}
            </g>
        </svg>
        {marks
            .filter((mark) => mark.outlined)
            .map((mark) => (
                <Box
                    key={`${mark.bubbleId}-${mark.number}`}
                    className={classes.outline}
                    data-mark-outline=""
                    style={
                        {
                            '--mark-left': `${mark.box.x - scroll.x}px`,
                            '--mark-top': `${mark.box.y - scroll.y}px`,
                            '--mark-width': `${mark.box.width}px`,
                            '--mark-height': `${mark.box.height}px`,
                        } as CSSProperties
                    }
                />
            ))}
        {marks.map((mark) => (
            <Box
                key={`${mark.bubbleId}-${mark.number}`}
                className={classes.badge}
                data-mark-number={mark.number}
                style={
                    {
                        '--mark-left': `${mark.box.x - scroll.x}px`,
                        '--mark-top': `${mark.box.y - scroll.y}px`,
                    } as CSSProperties
                }
            >
                {mark.number}
            </Box>
        ))}
    </Box>
);

export default MarkLayer;
