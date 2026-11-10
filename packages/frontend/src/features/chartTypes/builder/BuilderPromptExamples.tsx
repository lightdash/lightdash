import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { Group, Text, UnstyledButton } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { type CSSProperties, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useResolvedColorPalette } from '../../../hooks/appearance/useResolvedColorPalette';
import classes from './BuilderPromptExamples.module.css';

type ThumbnailProps = {
    /** The project palette; every fill comes from it so the cards never
     *  introduce colors the project doesn't use. */
    colors: string[];
};

/** Near-white palette entries vanish on a light card, so the previews skip them. */
const isVisibleOnLight = (color: string) => {
    const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
    if (!hex) return true;
    const [r, g, b] = [0, 2, 4].map(
        (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.9;
};

const usePreviewColors = (projectUuid: string) => {
    const palette =
        useResolvedColorPalette(projectUuid).filter(isVisibleOnLight);
    return palette.length >= 3 ? palette : ECHARTS_DEFAULT_COLORS;
};

const VIEWBOX = '0 0 200 112';

const Axis: FC = () => (
    <line x1="10" x2="190" y1="98" y2="98" className={classes.axis} />
);

const STREAM_LAYERS = [
    'M10,78 C40,66 70,72 100,76 C130,80 160,72 190,66 L190,98 L10,98 Z',
    'M10,62 C40,46 70,56 100,62 C130,68 160,54 190,46 L190,66 C160,72 130,80 100,76 C70,72 40,66 10,78 Z',
    'M10,46 C40,30 70,42 100,48 C130,54 160,36 190,28 L190,46 C160,54 130,68 100,62 C70,56 40,46 10,62 Z',
    'M10,36 C40,20 70,32 100,38 C130,44 160,24 190,14 L190,28 C160,36 130,54 100,48 C70,42 40,30 10,46 Z',
];

const StreamThumbnail: FC<ThumbnailProps> = ({ colors }) => (
    <svg viewBox={VIEWBOX} className={classes.thumbnail} aria-hidden>
        {STREAM_LAYERS.map((d, index) => (
            <path
                key={d}
                d={d}
                fill={colors[index % 3]}
                opacity={index === 3 ? 0.45 : 1}
                className={classes.layer}
            />
        ))}
        <Axis />
    </svg>
);

const FUNNEL_STEPS = [
    { width: 176, y: 10, label: '100%' },
    { width: 132, y: 36, label: '64%' },
    { width: 88, y: 62, label: '38%' },
    { width: 52, y: 88, label: '19%' },
];
const FUNNEL_STEP_HEIGHT = 16;

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
                    opacity="0.16"
                />
            );
        })}
        {FUNNEL_STEPS.map((step, index) => (
            <g key={step.y} className={classes.bar}>
                <rect
                    x={100 - step.width / 2}
                    y={step.y}
                    width={step.width}
                    height={FUNNEL_STEP_HEIGHT}
                    rx="5"
                    fill={colors[index]}
                />
                <text
                    x="100"
                    y={step.y + 11.5}
                    textAnchor="middle"
                    className={classes.barLabel}
                >
                    {step.label}
                </text>
            </g>
        ))}
    </svg>
);

const CALENDAR_WEEKS = 17;
const CALENDAR_DAYS = 7;
/** Deterministic busy-weekday pattern, so every render draws the same calendar. */
const dayIntensity = (week: number, day: number) => {
    const weekday = day > 0 && day < 6 ? 0.3 : 0;
    const wave = (Math.sin(week * 0.9 + day * 1.7) + 1) / 2;
    return Math.min(1, 0.1 + weekday + wave * 0.6);
};

const HeatmapThumbnail: FC<ThumbnailProps> = ({ colors }) => (
    <svg viewBox={VIEWBOX} className={classes.thumbnail} aria-hidden>
        {['Jan', 'Feb', 'Mar', 'Apr'].map((month, index) => (
            <text
                key={month}
                x={24 + index * 44}
                y="13"
                className={classes.tick}
            >
                {month}
            </text>
        ))}
        {['M', 'W', 'F'].map((day, index) => (
            <text
                key={day}
                x="10"
                y={34 + index * 24}
                textAnchor="middle"
                className={classes.tick}
            >
                {day}
            </text>
        ))}
        {Array.from({ length: CALENDAR_WEEKS }, (_, week) =>
            Array.from({ length: CALENDAR_DAYS }, (__, day) => (
                <rect
                    key={`${week}-${day}`}
                    x={22 + week * 10}
                    y={18 + day * 12}
                    width="8"
                    height="9"
                    rx="2"
                    fill={colors[0]}
                    opacity={dayIntensity(week, day)}
                    className={classes.cell}
                    style={{ '--delay': `${week * 18}ms` } as CSSProperties}
                />
            )),
        )}
    </svg>
);

/** A base, two rises, a dip, then the total. */
const WATERFALL_BARS = [
    { x: 16, top: 56, bottom: 98, kind: 'total', label: '42' },
    { x: 52, top: 38, bottom: 56, kind: 'up', label: '+18' },
    { x: 88, top: 24, bottom: 38, kind: 'up', label: '+14' },
    { x: 124, top: 24, bottom: 42, kind: 'down', label: '−18' },
    { x: 160, top: 42, bottom: 98, kind: 'total', label: '56' },
] as const;
const WATERFALL_BAR_WIDTH = 26;

const WaterfallThumbnail: FC<ThumbnailProps> = ({ colors }) => {
    const color = { total: colors[0], up: colors[1], down: colors[2] };
    return (
        <svg viewBox={VIEWBOX} className={classes.thumbnail} aria-hidden>
            {WATERFALL_BARS.slice(0, -1).map((bar, index) => {
                const next = WATERFALL_BARS[index + 1];
                const level = bar.kind === 'down' ? bar.bottom : bar.top;
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
                <g key={bar.x} className={classes.bar}>
                    <rect
                        x={bar.x}
                        y={bar.top}
                        width={WATERFALL_BAR_WIDTH}
                        height={bar.bottom - bar.top}
                        rx="4"
                        fill={color[bar.kind]}
                    />
                    <text
                        x={bar.x + WATERFALL_BAR_WIDTH / 2}
                        y={bar.top - 4}
                        textAnchor="middle"
                        className={classes.tick}
                    >
                        {bar.label}
                    </text>
                </g>
            ))}
            <Axis />
        </svg>
    );
};

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
    const colors = usePreviewColors(projectUuid);

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
