/**
 * A gradient config option as delivered to a chart type: two to five hex
 * colours from low to high, evenly spaced, between `min` and `max`. A
 * per-field gradient arrives with automatic bounds resolved from that field's
 * values; a chart-wide one arrives with null automatic bounds for the chart to
 * fill with `domain`.
 */
export type VizGradient = {
    colors: string[];
    min: number | null;
    max: number | null;
};

type Rgba = [number, number, number, number];

const parseHex = (hex: string): Rgba | null => {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex);
    if (!match) return null;
    const digits =
        match[1].length === 3
            ? match[1]
                  .split('')
                  .map((d) => d + d)
                  .join('')
            : match[1];
    const channel = (index: number) =>
        parseInt(digits.slice(index * 2, index * 2 + 2), 16) / 255;
    return [
        channel(0),
        channel(1),
        channel(2),
        digits.length === 8 ? channel(3) : 1,
    ];
};

const toLinear = (c: number) =>
    Math.abs(c) <= 0.04045
        ? c / 12.92
        : Math.sign(c) * ((Math.abs(c) + 0.055) / 1.055) ** 2.4;

const fromLinear = (c: number) =>
    Math.abs(c) > 0.0031308
        ? Math.sign(c) * (1.055 * Math.abs(c) ** (1 / 2.4) - 0.055)
        : 12.92 * c;

const toOklab = ([r, g, b, alpha]: Rgba): Rgba => {
    const [lr, lg, lb] = [r, g, b].map(toLinear);
    const l = Math.cbrt(
        0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
    );
    const m = Math.cbrt(
        0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
    );
    const s = Math.cbrt(
        0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
    );
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
        alpha,
    ];
};

const fromOklab = ([lightness, a, b, alpha]: Rgba): Rgba => {
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
        alpha,
    ].map((c, index) => (index < 3 ? fromLinear(c) : c)) as Rgba;
};

const toHex = (rgba: Rgba): string => {
    const [r, g, b, alpha] = rgba.map((c) => Math.min(1, Math.max(0, c)));
    const channels = alpha < 1 ? [r, g, b, alpha] : [r, g, b];
    return `#${channels
        .map((c) =>
            Math.round(c * 255)
                .toString(16)
                .padStart(2, '0'),
        )
        .join('')}`;
};

const toFiniteNumber = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

/**
 * The hex colour of `value` on a gradient option. Null bounds take `domain`
 * (for chart-wide gradients, the values the chart decides the scale covers).
 * Returns null for missing, non-numeric or non-finite values, when a bound is
 * still unknown or not finite, when `min` is above `max`, or for an invalid colour. Values
 * outside the range take the end colour; when `min` equals `max` every value
 * takes the last colour. Colours are interpolated in OKLab, like Lightdash's
 * own gradients.
 */
export function getGradientColor(
    gradient: VizGradient,
    value: unknown,
    domain?: { min: number; max: number },
): string | null {
    const numeric = toFiniteNumber(value);
    const min = toFiniteNumber(gradient.min ?? domain?.min ?? null);
    const max = toFiniteNumber(gradient.max ?? domain?.max ?? null);
    const stops = gradient.colors.map(parseHex);
    if (
        numeric === null ||
        min === null ||
        max === null ||
        min > max ||
        stops.length === 0 ||
        stops.some((stop) => stop === null)
    ) {
        return null;
    }
    if (stops.length === 1) return gradient.colors[0];

    const t =
        min === max
            ? 1
            : Math.max(0, Math.min(1, (numeric - min) / (max - min)));
    const segmentCount = stops.length - 1;
    const segment = Math.min(Math.floor(t * segmentCount), segmentCount - 1);
    const localT = t * segmentCount - segment;
    const start = toOklab(stops[segment] as Rgba);
    const end = toOklab(stops[segment + 1] as Rgba);
    return toHex(
        fromOklab(
            start.map((c, index) => c + (end[index] - c) * localT) as Rgba,
        ),
    );
}
