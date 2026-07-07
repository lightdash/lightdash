/**
 * Brand → dashboard theme derivation for the brand prototype page.
 * All palettes are derived in OKLCH: brand hues seed the ramps but raw brand
 * hexes are intentionally not reused as data colours (e.g. the sequential
 * palette is built from the primary hue, not the exact brand colour).
 */

type Oklch = { L: number; C: number; H: number };

export type DerivedBrandTheme = {
    neutral: Record<string, string>;
    primaryRamp: Record<string, string>;
    categorical: string[];
    sequential: string[];
    diverging: string[];
    tokens: {
        appBg: string;
        cardBg: string;
        text: string;
        sub: string;
        line: string;
        headerBg: string;
        headerText: string;
        btnBg: string;
        btnText: string;
    };
};

const clamp = (x: number, min = 0, max = 1) => Math.min(max, Math.max(min, x));

const HEX_COLOR_REGEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const isValidHexColor = (value: string) =>
    HEX_COLOR_REGEX.test(value.trim());

const normalizeHex = (value: string) => {
    let hex = value.trim().replace('#', '').toLowerCase();
    if (hex.length === 3) {
        hex = hex
            .split('')
            .map((c) => c + c)
            .join('');
    }
    return hex;
};

const hexToRgb = (value: string): [number, number, number] => {
    const hex = normalizeHex(value);
    return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
    ];
};

const rgbToHex = (rgb: [number, number, number]) => {
    const channel = (v: number) =>
        clamp(Math.round(v * 255), 0, 255)
            .toString(16)
            .padStart(2, '0');
    return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`;
};

const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

const toSrgb = (c: number) =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

const linearToOklab = ([r, g, b]: number[]): [number, number, number] => {
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    const l3 = Math.cbrt(l);
    const m3 = Math.cbrt(m);
    const s3 = Math.cbrt(s);
    return [
        0.2104542553 * l3 + 0.793617785 * m3 - 0.0040720468 * s3,
        1.9779984951 * l3 - 2.428592205 * m3 + 0.4505937099 * s3,
        0.0259040371 * l3 + 0.7827717662 * m3 - 0.808675766 * s3,
    ];
};

const oklabToLinear = ([L, a, b]: number[]): [number, number, number] => {
    const l3 = L + 0.3963377774 * a + 0.2158037573 * b;
    const m3 = L - 0.1055613458 * a - 0.0638541728 * b;
    const s3 = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l3 ** 3;
    const m = m3 ** 3;
    const s = s3 ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
};

const rgbToOklch = (rgb: [number, number, number]): Oklch => {
    const [L, a, b] = linearToOklab(rgb.map(toLinear));
    const C = Math.hypot(a, b);
    let H = (Math.atan2(b, a) * 180) / Math.PI;
    if (H < 0) H += 360;
    return { L, C, H };
};

export const hexToOklch = (hex: string): Oklch => rgbToOklch(hexToRgb(hex));

const oklchToLinear = (L: number, C: number, H: number) => {
    const hr = (H * Math.PI) / 180;
    return oklabToLinear([L, C * Math.cos(hr), C * Math.sin(hr)]);
};

const inGamut = (linear: number[]) =>
    linear.every((c) => c >= -0.001 && c <= 1.001);

// Gamut-map by reducing chroma until the colour is valid sRGB
const oklchToHex = (L: number, C: number, H: number): string => {
    let linear = oklchToLinear(L, C, H);
    if (!inGamut(linear)) {
        let lo = 0;
        let hi = C;
        for (let i = 0; i < 18; i += 1) {
            const mid = (lo + hi) / 2;
            if (inGamut(oklchToLinear(L, mid, H))) {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        linear = oklchToLinear(L, lo, H);
    }
    return rgbToHex(
        linear.map((c) => clamp(toSrgb(clamp(c)))) as [number, number, number],
    );
};

const relativeLuminance = (rgb: [number, number, number]) => {
    const [r, g, b] = rgb.map(toLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a: string, b: string) => {
    const la = relativeLuminance(hexToRgb(a));
    const lb = relativeLuminance(hexToRgb(b));
    const hi = Math.max(la, lb);
    const lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
};

// Scan lightness in a direction until the swatch hits the target contrast
const solveLightnessForContrast = (
    C: number,
    H: number,
    bgHex: string,
    target: number,
    direction: -1 | 1,
): number | null => {
    for (
        let L = direction < 0 ? 0.9 : 0.1;
        L >= 0 && L <= 1;
        L += direction * 0.01
    ) {
        if (contrastRatio(oklchToHex(L, C, H), bgHex) >= target) {
            return L;
        }
    }
    return null;
};

// Machado 2009 CVD simulation matrices (severity 1.0), applied in linear RGB
const CVD_MATRICES: Record<string, number[][]> = {
    deuter: [
        [0.367322, 0.860646, -0.227968],
        [0.280085, 0.672501, 0.047413],
        [-0.01182, 0.04294, 0.968881],
    ],
    protan: [
        [0.152286, 1.052583, -0.204868],
        [0.114503, 0.786281, 0.099216],
        [-0.003882, -0.048116, 1.051998],
    ],
};

const simulateCvd = (hex: string, type: keyof typeof CVD_MATRICES) => {
    const linear = hexToRgb(hex).map(toLinear);
    const matrix = CVD_MATRICES[type];
    const out = matrix.map((row) =>
        clamp(row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2]),
    );
    return rgbToHex(out.map(toSrgb) as [number, number, number]);
};

const deltaE = (hex1: string, hex2: string) => {
    const a = hexToOklch(hex1);
    const b = hexToOklch(hex2);
    const ax = a.C * Math.cos((a.H * Math.PI) / 180);
    const ay = a.C * Math.sin((a.H * Math.PI) / 180);
    const bx = b.C * Math.cos((b.H * Math.PI) / 180);
    const by = b.C * Math.sin((b.H * Math.PI) / 180);
    return Math.hypot(a.L - b.L, ax - bx, ay - by);
};

const STOPS: Array<[string, number]> = [
    ['50', 0.975],
    ['100', 0.945],
    ['200', 0.885],
    ['300', 0.805],
    ['400', 0.71],
    ['500', 0.61],
    ['600', 0.51],
    ['700', 0.41],
    ['800', 0.3],
    ['900', 0.2],
];

const CATEGORICAL_COUNT = 8;
const CATEGORICAL_CHROMA = 0.14;
const CATEGORICAL_LIGHTNESS = 0.62;

const hueGap = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360;
    return Math.min(d, 360 - d);
};

export const deriveBrandTheme = (brandHexes: string[]): DerivedBrandTheme => {
    const seeds = brandHexes.filter(isValidHexColor).map(hexToOklch);
    const primary = seeds[0] ?? { L: 0.6, C: 0, H: 0 };
    const chromatic = seeds.filter((seed) => seed.C > 0.02);
    const isGreyscaleBrand = chromatic.length === 0;

    // Neutral ramp: primary hue with crushed chroma
    const neutralHue = isGreyscaleBrand ? 250 : primary.H;
    const neutralChroma = isGreyscaleBrand ? 0.004 : Math.min(primary.C, 0.012);
    const neutral = Object.fromEntries(
        STOPS.map(([key, L]) => [key, oklchToHex(L, neutralChroma, neutralHue)]),
    );

    // Primary ramp: brand hue and chroma, bell-clamped so mids stay saturated
    const primaryChroma = isGreyscaleBrand ? 0.14 : primary.C;
    const primaryRamp = Object.fromEntries(
        STOPS.map(([key, L]) => {
            const bell = 1 - Math.abs(L - 0.55) * 1.1;
            return [
                key,
                oklchToHex(L, primaryChroma * clamp(bell, 0.25, 1), primary.H),
            ];
        }),
    );

    const appBg = neutral['50'];

    // Categorical: brand hues as anchors, greedy max-gap fill to 8 series
    const hues = isGreyscaleBrand ? [250] : chromatic.map((seed) => seed.H);
    while (hues.length < CATEGORICAL_COUNT) {
        let bestHue = 0;
        let bestGap = -1;
        for (let h = 0; h < 360; h += 3) {
            const gap = Math.min(...hues.map((existing) => hueGap(existing, h)));
            if (gap > bestGap) {
                bestGap = gap;
                bestHue = h;
            }
        }
        hues.push(bestHue);
    }
    const categoricalEntries = hues
        .slice(0, CATEGORICAL_COUNT)
        .map((H) => {
            let hex = oklchToHex(CATEGORICAL_LIGHTNESS, CATEGORICAL_CHROMA, H);
            // Enforce >=3:1 against the app surface
            if (contrastRatio(hex, appBg) < 3) {
                const solved = solveLightnessForContrast(
                    CATEGORICAL_CHROMA,
                    H,
                    appBg,
                    3,
                    -1,
                );
                if (solved !== null) {
                    hex = oklchToHex(solved, CATEGORICAL_CHROMA, H);
                }
            }
            return { H, hex };
        });
    // CVD gate: rotate adjacent hues that collide under simulation
    Object.keys(CVD_MATRICES).forEach((type) => {
        for (let i = 1; i < categoricalEntries.length; i += 1) {
            let tries = 0;
            while (
                deltaE(
                    simulateCvd(categoricalEntries[i - 1].hex, type),
                    simulateCvd(categoricalEntries[i].hex, type),
                ) < 0.08 &&
                tries < 12
            ) {
                const rotatedHue = (categoricalEntries[i].H + 11) % 360;
                categoricalEntries[i] = {
                    H: rotatedHue,
                    hex: oklchToHex(
                        CATEGORICAL_LIGHTNESS,
                        CATEGORICAL_CHROMA,
                        rotatedHue,
                    ),
                };
                tries += 1;
            }
        }
    });
    const categorical = categoricalEntries.map((entry) => entry.hex);

    // Sequential: primary hue, light → dark. Deliberately seeded from the
    // brand hue rather than the exact brand colour.
    const sequentialHue = isGreyscaleBrand ? 250 : primary.H;
    const sequential = Array.from({ length: 9 }, (_, i) => {
        const t = i / 8;
        return oklchToHex(0.95 - t * 0.6, 0.03 + t * 0.13, sequentialHue);
    });

    // Diverging: two brand hues (or primary + complement) through a light mid
    const hueA = isGreyscaleBrand ? 250 : chromatic[0].H;
    const hueB = isGreyscaleBrand
        ? 25
        : chromatic[1]?.H ?? (hueA + 180) % 360;
    const diverging = Array.from({ length: 9 }, (_, i) => {
        const t = i / 8;
        if (t < 0.5) {
            const k = t / 0.5;
            return oklchToHex(0.55 + k * 0.38, 0.15 * (1 - k), hueA);
        }
        const k = (t - 0.5) / 0.5;
        return oklchToHex(0.93 - k * 0.38, 0.15 * k, hueB);
    });

    const headerBg = primaryRamp['600'];
    const btnBg = primaryRamp['500'];
    const pickTextOn = (bg: string) =>
        contrastRatio('#ffffff', bg) >= contrastRatio('#111111', bg)
            ? '#ffffff'
            : neutral['900'];

    return {
        neutral,
        primaryRamp,
        categorical,
        sequential,
        diverging,
        tokens: {
            appBg,
            cardBg: '#ffffff',
            text: neutral['900'],
            sub: neutral['600'],
            line: neutral['200'],
            headerBg,
            headerText: pickTextOn(headerBg),
            btnBg,
            btnText: pickTextOn(btnBg),
        },
    };
};
