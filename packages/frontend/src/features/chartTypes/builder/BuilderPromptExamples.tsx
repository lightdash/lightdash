import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { Group, Text, UnstyledButton } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useResolvedColorPalette } from '../../../hooks/appearance/useResolvedColorPalette';
import classes from './BuilderPromptExamples.module.css';

type ThumbnailProps = {
    /** The project palette; every fill comes from it so the cards never
     *  introduce colors the project doesn't use. */
    colors: string[];
};

const VIEWBOX = '0 0 200 112';

/** Three stacked layers, bottom to top. */
const STREAM_LAYERS = [
    'M8,74 C40,60 70,66 100,72 C130,78 160,70 192,62 L192,96 L8,96 Z',
    'M8,56 C40,40 70,50 100,58 C130,66 160,50 192,40 L192,62 C160,70 130,78 100,72 C70,66 40,60 8,74 Z',
    'M8,40 C40,22 70,34 100,42 C130,50 160,30 192,22 L192,40 C160,50 130,66 100,58 C70,50 40,40 8,56 Z',
];

const StreamThumbnail: FC<ThumbnailProps> = ({ colors }) => (
    <svg viewBox={VIEWBOX} className={classes.thumbnail} aria-hidden>
        {STREAM_LAYERS.map((d, index) => (
            <path key={d} d={d} fill={colors[index]} opacity="0.9" />
        ))}
    </svg>
);

const FUNNEL_STEPS = [
    { width: 176, y: 12 },
    { width: 132, y: 38 },
    { width: 88, y: 64 },
    { width: 48, y: 90 },
];
const FUNNEL_STEP_HEIGHT = 14;

const FunnelThumbnail: FC<ThumbnailProps> = ({ colors }) => (
    <svg viewBox={VIEWBOX} className={classes.thumbnail} aria-hidden>
        {FUNNEL_STEPS.slice(1).map((step, index) => {
            const prev = FUNNEL_STEPS[index];
            const top = prev.y + FUNNEL_STEP_HEIGHT;
            return (
                <path
                    key={`flow-${step.y}`}
                    d={`M${100 - prev.width / 2},${top} L${100 + prev.width / 2},${top} L${100 + step.width / 2},${step.y} L${100 - step.width / 2},${step.y} Z`}
                    fill={colors[index]}
                    opacity="0.18"
                />
            );
        })}
        {FUNNEL_STEPS.map((step, index) => (
            <rect
                key={step.y}
                x={100 - step.width / 2}
                y={step.y}
                width={step.width}
                height={FUNNEL_STEP_HEIGHT}
                rx="4"
                fill={colors[index]}
            />
        ))}
    </svg>
);

const CALENDAR_WEEKS = 18;
const CALENDAR_DAYS = 7;
/** Deterministic busy-weekday pattern, so every render draws the same calendar. */
const dayIntensity = (week: number, day: number) => {
    const weekday = day > 0 && day < 6 ? 0.35 : 0;
    const wave = (Math.sin(week * 0.9 + day * 1.7) + 1) / 2;
    return Math.min(1, 0.12 + weekday + wave * 0.55);
};

const HeatmapThumbnail: FC<ThumbnailProps> = ({ colors }) => (
    <svg viewBox={VIEWBOX} className={classes.thumbnail} aria-hidden>
        {Array.from({ length: CALENDAR_WEEKS }, (_, week) =>
            Array.from({ length: CALENDAR_DAYS }, (__, day) => (
                <rect
                    key={`${week}-${day}`}
                    x={10 + week * 10.2}
                    y={18 + day * 11}
                    width="8"
                    height="8"
                    rx="2"
                    fill={colors[0]}
                    opacity={dayIntensity(week, day)}
                />
            )),
        )}
    </svg>
);

/** A base, two rises, a dip, then the total. */
const WATERFALL_BARS = [
    { x: 14, top: 58, bottom: 96, color: 0 },
    { x: 50, top: 38, bottom: 58, color: 1 },
    { x: 86, top: 22, bottom: 38, color: 1 },
    { x: 122, top: 22, bottom: 40, color: 2 },
    { x: 158, top: 40, bottom: 96, color: 0 },
];
const WATERFALL_BAR_WIDTH = 28;

const WaterfallThumbnail: FC<ThumbnailProps> = ({ colors }) => (
    <svg viewBox={VIEWBOX} className={classes.thumbnail} aria-hidden>
        {WATERFALL_BARS.slice(0, -1).map((bar, index) => {
            const next = WATERFALL_BARS[index + 1];
            const level = bar.color === 2 ? bar.bottom : bar.top;
            return (
                <line
                    key={`link-${bar.x}`}
                    x1={bar.x + WATERFALL_BAR_WIDTH}
                    x2={next.x}
                    y1={level}
                    y2={level}
                    className={classes.connector}
                />
            );
        })}
        {WATERFALL_BARS.map((bar) => (
            <rect
                key={bar.x}
                x={bar.x}
                y={bar.top}
                width={WATERFALL_BAR_WIDTH}
                height={bar.bottom - bar.top}
                rx="3"
                fill={colors[bar.color]}
            />
        ))}
    </svg>
);

const EXAMPLES: {
    key: string;
    prompt: string;
    Thumbnail: FC<ThumbnailProps>;
}[] = [
    {
        key: 'stream',
        prompt: 'A stream graph of share over time',
        Thumbnail: StreamThumbnail,
    },
    {
        key: 'funnel',
        prompt: 'A funnel of signup steps',
        Thumbnail: FunnelThumbnail,
    },
    {
        key: 'heatmap',
        prompt: 'A calendar heatmap of daily orders',
        Thumbnail: HeatmapThumbnail,
    },
    {
        key: 'waterfall',
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
        <Group gap="md" align="stretch" justify="center">
            {EXAMPLES.map(({ key, prompt, Thumbnail }) => (
                <UnstyledButton
                    key={key}
                    className={classes.card}
                    onClick={() => onPick(prompt)}
                >
                    <div className={classes.stage}>
                        <Thumbnail colors={colors} />
                    </div>
                    <Group
                        gap="xs"
                        wrap="nowrap"
                        justify="space-between"
                        align="flex-start"
                        px={6}
                        pb={4}
                    >
                        <Text fz="sm" fw={500} lh={1.35}>
                            {prompt}
                        </Text>
                        <MantineIcon
                            icon={IconArrowRight}
                            size={14}
                            className={classes.arrow}
                        />
                    </Group>
                </UnstyledButton>
            ))}
        </Group>
    );
};

export default BuilderPromptExamples;
