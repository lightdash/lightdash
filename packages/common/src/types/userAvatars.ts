export const USER_AVATAR_GRADIENT_IDS = [
    'lilac',
    'blush',
    'amethyst',
    'sunrise',
    'slate',
    'pearl',
] as const;

export type UserAvatarGradientId = (typeof USER_AVATAR_GRADIENT_IDS)[number];

export const isUserAvatarGradientId = (
    value: string,
): value is UserAvatarGradientId =>
    (USER_AVATAR_GRADIENT_IDS as readonly string[]).includes(value);

export const getUserAvatarGradient = (
    userUuid: string,
    override: UserAvatarGradientId | null,
): UserAvatarGradientId => {
    if (override) return override;
    let hash = 0;
    for (let i = 0; i < userUuid.length; i += 1) {
        hash = (hash * 31 + userUuid.charCodeAt(i)) % 2147483647;
    }
    return USER_AVATAR_GRADIENT_IDS[hash % USER_AVATAR_GRADIENT_IDS.length];
};

export const getUserAvatarUrl = (
    userUuid: string,
    contentHash: string,
): string => `/api/v1/users/${userUuid}/avatar/${contentHash}`;

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/* Not a template literal type: tsoa's OpenAPI generator can't resolve those. */
export type HexColor = string;

export const isHexColorString = (value: string): value is HexColor =>
    HEX_COLOR_REGEX.test(value);

const SOLID_COLOR_REGEX = /^solid:#[0-9a-fA-F]{6}$/;

export type SolidColor = string;

export const isSolidColorString = (value: string): value is SolidColor =>
    SOLID_COLOR_REGEX.test(value);

export const toSolidColor = (hex: HexColor): SolidColor => `solid:${hex}`;

export const getHexFromSolidColor = (value: SolidColor): HexColor =>
    value.slice('solid:'.length);

/* A curated preset id, a user-picked custom mesh hex color, or a flat solid hex color. */
export type UserAvatarColorValue = UserAvatarGradientId | HexColor | SolidColor;

export const isUserAvatarColorValue = (
    value: string,
): value is UserAvatarColorValue =>
    isUserAvatarGradientId(value) ||
    isHexColorString(value) ||
    isSolidColorString(value);

type Hsl = { h: number; s: number; l: number };

const hexToHsl = (hex: HexColor): Hsl => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: l * 100 };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    switch (max) {
        case r:
            h = (g - b) / d + (g < b ? 6 : 0);
            break;
        case g:
            h = (b - r) / d + 2;
            break;
        default:
            h = (r - g) / d + 4;
    }
    return { h: h * 60, s: s * 100, l: l * 100 };
};

const hslToHex = ({ h, s, l }: Hsl): HexColor => {
    const sNorm = Math.min(100, Math.max(0, s)) / 100;
    const lNorm = Math.min(100, Math.max(0, l)) / 100;
    const hNorm = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
    const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
    const m = lNorm - c / 2;
    let rp = 0;
    let gp = 0;
    let bp = 0;
    if (hNorm < 60) [rp, gp, bp] = [c, x, 0];
    else if (hNorm < 120) [rp, gp, bp] = [x, c, 0];
    else if (hNorm < 180) [rp, gp, bp] = [0, c, x];
    else if (hNorm < 240) [rp, gp, bp] = [0, x, c];
    else if (hNorm < 300) [rp, gp, bp] = [x, 0, c];
    else [rp, gp, bp] = [c, 0, x];
    const toHex = (v: number) =>
        Math.round((v + m) * 255)
            .toString(16)
            .padStart(2, '0');
    return `#${toHex(rp)}${toHex(gp)}${toHex(bp)}`;
};

const shiftHsl = (
    hex: HexColor,
    { hueShift = 0, satShift = 0, lightShift = 0 },
): HexColor => {
    const { h, s, l } = hexToHsl(hex);
    return hslToHex({
        h: h + hueShift,
        s: s + satShift,
        l: l + lightShift,
    });
};

export const hexToRgba = (hex: HexColor, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/* Generates the same "paint splatter" mesh recipe used by the curated
   gradients (bright corner, subtle opposite corner, two saturated spots,
   diagonal wash) but parameterized from an arbitrary base hex color. */
export const generateAvatarMeshBackgroundImage = (hex: HexColor): string => {
    const spotA = shiftHsl(hex, { hueShift: 24, satShift: 15, lightShift: 0 });
    const spotB = shiftHsl(hex, {
        hueShift: -24,
        satShift: 10,
        lightShift: -8,
    });
    const washLight = shiftHsl(hex, { satShift: -20, lightShift: 32 });
    return [
        'radial-gradient(circle at 18% 12%, rgba(255, 255, 255, 0.9) 0%, transparent 40%)',
        'radial-gradient(circle at 85% 90%, rgba(255, 255, 255, 0.3) 0%, transparent 36%)',
        `radial-gradient(circle at 72% 25%, ${spotA} 0%, transparent 32%)`,
        `radial-gradient(circle at 25% 75%, ${spotB} 0%, transparent 34%)`,
        `linear-gradient(135deg, ${washLight} 0%, ${hex} 100%)`,
    ].join(', ');
};

export const generateAvatarMeshBorderColor = (hex: HexColor): string =>
    hexToRgba(hex, 0.4);

export const getAvatarMeshClassName = (hex: HexColor): string =>
    `avatar-mesh-${hex.slice(1).toLowerCase()}`;

/* Relative luminance (WCAG) decides whether initials read better in black or white. */
export const getContrastTextColor = (hex: HexColor): 'black' | 'white' => {
    const toLinear = (channel: number) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const r = toLinear(parseInt(hex.slice(1, 3), 16));
    const g = toLinear(parseInt(hex.slice(3, 5), 16));
    const b = toLinear(parseInt(hex.slice(5, 7), 16));
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.55 ? 'black' : 'white';
};

export const getAvatarSolidClassName = (hex: HexColor): string =>
    `avatar-solid-${hex.slice(1).toLowerCase()}`;
