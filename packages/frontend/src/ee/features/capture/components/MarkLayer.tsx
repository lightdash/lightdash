import { Box } from '@mantine/core';
import { type FC, type Ref } from 'react';
import { BUBBLE_COLOR_VAR } from '../bubblePalette';
import { CAPTURE_IGNORE_ATTRIBUTE } from '../frameSource';
import { type LayerMark, type Stroke } from '../types';
import classes from './MarkLayer.module.css';

type Props = {
    /**
     * The surface's area on screen, which marks are cut off at. Null when the
     * layer sits in the page's own scrolling content.
     */
    clip: DOMRect | null;
    /** Moved to follow a surface that scrolls on its own; null when the page scrolls the layer. */
    shiftRef: Ref<HTMLDivElement> | null;
    /** Boxes and strokes are content pixels. */
    marks: LayerMark[];
    /** The colour of a bubble's marks. */
    colorOf: (bubbleId: string) => string;
};

const toPath = (stroke: Stroke): string =>
    stroke.points
        .map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
        .join(' ');

const MarkLayer: FC<Props> = ({ clip, shiftRef, marks, colorOf }) => (
    <Box
        className={classes.layer}
        data-clipped={clip !== null}
        {...{ [CAPTURE_IGNORE_ATTRIBUTE]: '' }}
        __vars={
            clip
                ? {
                      '--region-left': `${clip.left}px`,
                      '--region-top': `${clip.top}px`,
                      '--region-right': `${clip.right}px`,
                      '--region-bottom': `${clip.bottom}px`,
                  }
                : {}
        }
    >
        <Box ref={shiftRef} className={classes.content}>
            <svg className={classes.ink}>
                {marks.flatMap((mark) =>
                    mark.strokes.map((stroke, i) => (
                        <path
                            // oxlint-disable-next-line react/no-array-index-key
                            key={`${mark.bubbleId}-${mark.number}-${i}`}
                            d={toPath(stroke)}
                            fill="none"
                            stroke={colorOf(mark.bubbleId)}
                            strokeWidth={3}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    )),
                )}
            </svg>
            {marks
                .filter((mark) => mark.outlined)
                .map((mark) => (
                    <Box
                        key={`${mark.bubbleId}-${mark.number}`}
                        className={classes.outline}
                        data-mark-outline=""
                        __vars={{
                            '--mark-left': `${mark.box.x}px`,
                            '--mark-top': `${mark.box.y}px`,
                            '--mark-width': `${mark.box.width}px`,
                            '--mark-height': `${mark.box.height}px`,
                            [BUBBLE_COLOR_VAR]: colorOf(mark.bubbleId),
                        }}
                    />
                ))}
            {marks.map((mark) => (
                <Box
                    key={`${mark.bubbleId}-${mark.number}`}
                    className={classes.badge}
                    data-mark-number={mark.number}
                    __vars={{
                        '--mark-left': `${mark.box.x}px`,
                        '--mark-top': `${mark.box.y}px`,
                        [BUBBLE_COLOR_VAR]: colorOf(mark.bubbleId),
                    }}
                >
                    {mark.number}
                </Box>
            ))}
        </Box>
    </Box>
);

export default MarkLayer;
