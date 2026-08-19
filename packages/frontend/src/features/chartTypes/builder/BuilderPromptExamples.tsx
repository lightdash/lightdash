import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { Group, Text, UnstyledButton } from '@mantine/core';
import { type FC } from 'react';
import { useResolvedColorPalette } from '../../../hooks/appearance/useResolvedColorPalette';
import classes from './BuilderPromptExamples.module.css';

type ThumbnailProps = {
    /** The project palette; every fill comes from it so the cards never
     *  introduce colors the project doesn't use. */
    colors: string[];
};

const StreamThumbnail: FC<ThumbnailProps> = ({ colors }) => (
    <svg viewBox="0 0 160 64" className={classes.thumbnail} aria-hidden>
        <path
            d="M6,26 C38,8 68,12 88,24 C113,38 133,36 154,22 L154,38 C132,50 107,52 82,42 C57,32 26,36 6,42 Z"
            fill={colors[0]}
            opacity="0.85"
        />
        <path
            d="M6,42 C26,36 57,32 82,42 C107,52 132,50 154,38 L154,52 C122,60 58,60 6,52 Z"
            fill={colors[1]}
            opacity="0.85"
        />
    </svg>
);

const FUNNEL_BARS = [
    { x: 10, y: 8, width: 30, height: 48 },
    { x: 48, y: 18, width: 30, height: 38 },
    { x: 86, y: 28, width: 30, height: 28 },
    { x: 124, y: 40, width: 26, height: 16 },
];

const FunnelThumbnail: FC<ThumbnailProps> = ({ colors }) => (
    <svg viewBox="0 0 160 64" className={classes.thumbnail} aria-hidden>
        {FUNNEL_BARS.map((bar, index) => (
            <rect
                key={bar.x}
                {...bar}
                rx="3"
                fill={colors[index]}
                opacity="0.9"
            />
        ))}
    </svg>
);

/** Row-major intensities, so one project color reads as a full scale. */
const HEATMAP_CELLS = [
    [0.15, 0.4, 0.85, 0.4, 0.15, 0.6],
    [0.4, 0.85, 1, 0.85, 0.4, 0.15],
    [0.15, 0.4, 0.6, 0.15, 0.4, 0.15],
];

const HeatmapThumbnail: FC<ThumbnailProps> = ({ colors }) => (
    <svg viewBox="0 0 160 64" className={classes.thumbnail} aria-hidden>
        {HEATMAP_CELLS.map((row, rowIndex) =>
            row.map((intensity, cellIndex) => (
                <rect
                    key={`${rowIndex}-${cellIndex}`}
                    x={10 + cellIndex * 24}
                    y={8 + rowIndex * 18}
                    width="20"
                    height="14"
                    rx="3"
                    fill={colors[0]}
                    opacity={intensity}
                />
            )),
        )}
    </svg>
);

/** A staircase: a base, two steps up, one step down, then the total. */
const WATERFALL_BARS = [
    { x: 10, y: 30, width: 22, height: 26, color: 0 },
    { x: 38, y: 20, width: 22, height: 10, color: 1 },
    { x: 66, y: 12, width: 22, height: 8, color: 1 },
    { x: 94, y: 12, width: 22, height: 6, color: 2 },
    { x: 122, y: 18, width: 24, height: 38, color: 0 },
];

const WaterfallThumbnail: FC<ThumbnailProps> = ({ colors }) => (
    <svg viewBox="0 0 160 64" className={classes.thumbnail} aria-hidden>
        {WATERFALL_BARS.map(({ color, ...bar }) => (
            <rect key={bar.x} {...bar} rx="3" fill={colors[color]} />
        ))}
    </svg>
);

const EXAMPLES: { prompt: string; Thumbnail: FC<ThumbnailProps> }[] = [
    { prompt: 'A stream graph of share over time', Thumbnail: StreamThumbnail },
    { prompt: 'A funnel of signup steps', Thumbnail: FunnelThumbnail },
    {
        prompt: 'A calendar heatmap of daily orders',
        Thumbnail: HeatmapThumbnail,
    },
    {
        prompt: 'A waterfall of revenue changes',
        Thumbnail: WaterfallThumbnail,
    },
];

type Props = {
    projectUuid: string;
    /** Drops the prompt into the composer so it can still be edited. */
    onPick: (prompt: string) => void;
};

/** Starter prompts for the empty builder, previewed in the project's colors. */
const BuilderPromptExamples: FC<Props> = ({ projectUuid, onPick }) => {
    const palette = useResolvedColorPalette(projectUuid);
    const colors = palette.length > 0 ? palette : ECHARTS_DEFAULT_COLORS;

    return (
        <Group gap="sm" align="stretch" justify="center">
            {EXAMPLES.map(({ prompt, Thumbnail }) => (
                <UnstyledButton
                    key={prompt}
                    className={classes.card}
                    onClick={() => onPick(prompt)}
                >
                    <Thumbnail colors={colors} />
                    <Text fz={13} fw={500} c="ldGray.8" lh={1.35}>
                        {prompt}
                    </Text>
                </UnstyledButton>
            ))}
        </Group>
    );
};

export default BuilderPromptExamples;
