import { Box, Text, useComputedColorScheme } from '@mantine/core';
import { useEffect, useRef, type FC } from 'react';
import classes from './AiCreditsUsageBar.module.css';

const BLEND_FROM = 50;
const ACCENT_FROM = 80;
const MARKERS = [BLEND_FROM, ACCENT_FROM] as const;

const PIXEL_SIZE = 2;
// Higher values keep the accent sparse until usage nears the accent marker.
const BLEND_CURVE = 4;
const SHIMMER_INTERVAL_MS = 125;
const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
] as const;

type Palette = { ink: string; track: string; accent: string };

// Canvas can't take CSS variables, so resolve the theme tokens declared in the CSS module.
const readPalette = (element: HTMLElement): Palette => {
    const style = getComputedStyle(element);
    const read = (name: string) => style.getPropertyValue(name).trim();
    return {
        ink: read('--bar-ink'),
        track: read('--bar-track'),
        accent: read('--bar-accent'),
    };
};

const drawDitheredSegment = (
    ctx: CanvasRenderingContext2D,
    {
        from,
        to,
        fillX,
        height,
        base,
        target,
        curve,
        frame,
    }: {
        from: number;
        to: number;
        fillX: number;
        height: number;
        base: string;
        target: string;
        curve: number;
        frame: number;
    },
) => {
    const end = Math.min(fillX, to);
    if (end <= from) return;
    const cols = Math.ceil((end - from) / PIXEL_SIZE);
    const rows = Math.ceil(height / PIXEL_SIZE);
    for (let c = 0; c < cols; c += 1) {
        const x = from + c * PIXEL_SIZE;
        const progress = ((x - from + PIXEL_SIZE / 2) / (to - from)) ** curve;
        for (let r = 0; r < rows; r += 1) {
            const threshold =
                (BAYER[(r + frame) % 4][(c + frame) % 4] + 0.5) / 16;
            ctx.fillStyle = progress > threshold ? target : base;
            ctx.fillRect(
                x,
                r * PIXEL_SIZE,
                Math.min(PIXEL_SIZE, end - x),
                PIXEL_SIZE,
            );
        }
    }
};

const drawBar = (
    canvas: HTMLCanvasElement,
    percent: number,
    palette: Palette,
    frame: number,
) => {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ctx = canvas.getContext('2d');
    if (width === 0 || ctx === null) return;
    if (canvas.width !== Math.round(width * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const fillX = (width * Math.min(Math.max(percent, 0), 100)) / 100;
    const blendX = (width * BLEND_FROM) / 100;
    const accentX = (width * ACCENT_FROM) / 100;

    ctx.fillStyle = palette.track;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = palette.ink;
    ctx.fillRect(0, 0, Math.min(fillX, blendX), height);

    drawDitheredSegment(ctx, {
        from: blendX,
        to: accentX,
        fillX,
        height,
        base: palette.ink,
        target: palette.accent,
        curve: BLEND_CURVE,
        frame,
    });
    if (fillX > accentX) {
        ctx.fillStyle = palette.accent;
        ctx.fillRect(accentX, 0, fillX - accentX, height);
    }

    MARKERS.forEach((marker) =>
        ctx.clearRect((width * marker) / 100 - 1, 0, 2, height),
    );
};

export const AiCreditsUsageBar: FC<{ percent: number }> = ({ percent }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const colorScheme = useComputedColorScheme('light');

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas === null) return undefined;
        const palette = readPalette(canvas);
        let frame = 0;
        let lastTick = 0;
        let animationId = 0;

        const draw = () => drawBar(canvas, percent, palette, frame);
        const tick = (now: number) => {
            animationId = requestAnimationFrame(tick);
            if (now - lastTick < SHIMMER_INTERVAL_MS) return;
            lastTick = now;
            frame += 1;
            draw();
        };

        draw();
        const prefersReducedMotion = window.matchMedia(
            '(prefers-reduced-motion: reduce)',
        ).matches;
        if (percent > BLEND_FROM && !prefersReducedMotion) {
            animationId = requestAnimationFrame(tick);
        }
        const resizeObserver = new ResizeObserver(draw);
        resizeObserver.observe(canvas);
        return () => {
            cancelAnimationFrame(animationId);
            resizeObserver.disconnect();
        };
    }, [percent, colorScheme]);

    return (
        <Box>
            <Box
                className={classes.bar}
                role="progressbar"
                aria-label="Credits used"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(percent, 100))}
            >
                <canvas ref={canvasRef} className={classes.canvas} />
            </Box>
            <Box className={classes.markerLabels}>
                {MARKERS.map((marker) => (
                    <Text
                        key={marker}
                        fz="xs"
                        c="dimmed"
                        className={classes.markerLabel}
                        left={`${marker}%`}
                    >
                        {marker}%
                    </Text>
                ))}
            </Box>
        </Box>
    );
};
