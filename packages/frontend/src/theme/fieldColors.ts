export interface LightdashFieldColors {
    /** CSS variable for background color (auto-switches for dark/light modes) */
    bg: string;
    /** CSS variable for hover background color */
    bgHover: string;
    /** CSS variable for text color */
    color: string;
    /** CSS variable for column header text color */
    columnHeaderColor: string;
    /** Mantine color token for component color property */
    mantineColor: string;
}

type FieldTone = Omit<LightdashFieldColors, 'mantineColor'>;
type FieldKind = 'dimension' | 'metric';
/** A hex per kind, or null for the default tone */
export type FieldColorOverrides = Record<FieldKind, string | null>;

const DEFAULT_TONES: Record<FieldKind, FieldTone> = {
    dimension: {
        bg: 'light-dark(#EDF0FD, #202539)',
        bgHover: 'light-dark(#4b69ef28, #4b69ef35)',
        color: 'light-dark(#3b5bdb, #95aaf0)',
        columnHeaderColor: 'light-dark(#3b5bdb, #93acff)',
    },
    metric: {
        bg: 'light-dark(#FBE9E0, rgb(249 115 22 / 7%))',
        bgHover: 'light-dark(#e8590c30, rgb(249 115 22 / 12%))',
        color: 'light-dark(#de7f0b, #FB923C)',
        columnHeaderColor: 'light-dark(#b45309, #F0A15A)',
    },
};
export const DEFAULT_FIELD_HEX: Record<FieldKind, string> = {
    dimension: '#3b5bdb',
    metric: '#de7f0b',
};
const NO_OVERRIDES: FieldColorOverrides = { dimension: null, metric: null };

const toneFromHex = (hex: string): FieldTone => {
    const text = `light-dark(${hex}, color-mix(in srgb, ${hex} 60%, white))`;
    return {
        bg: `color-mix(in srgb, ${hex} 12%, transparent)`,
        bgHover: `color-mix(in srgb, ${hex} 22%, transparent)`,
        color: text,
        columnHeaderColor: text,
    };
};

export const getFieldColorVariables = (
    overrides: FieldColorOverrides = NO_OVERRIDES,
) =>
    Object.fromEntries(
        (['dimension', 'metric'] as const).flatMap((kind) => {
            const hex = overrides[kind];
            const tone = hex ? toneFromHex(hex) : DEFAULT_TONES[kind];
            return [
                [`--ld-field-${kind}-bg`, tone.bg],
                [`--ld-field-${kind}-bg-hover`, tone.bgHover],
                [`--ld-field-${kind}-color`, tone.color],
                [`--ld-field-${kind}-header-color`, tone.columnHeaderColor],
            ];
        }),
    );

const STORAGE_KEY = 'ld.explorer.fieldColors.v2';
const HEX = /^#[0-9a-f]{6}$/i;
const validHex = (value: unknown) =>
    typeof value === 'string' && HEX.test(value) ? value : null;

export const getStoredFieldColors = (): FieldColorOverrides => {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
        return {
            dimension: validHex(stored?.dimension),
            metric: validHex(stored?.metric),
        };
    } catch {
        return NO_OVERRIDES;
    }
};

const applyFieldColors = (overrides: FieldColorOverrides) => {
    const rootStyle = document.documentElement.style;
    Object.entries(getFieldColorVariables(overrides)).forEach(
        ([name, value]) => {
            const kind = name.includes('dimension') ? 'dimension' : 'metric';
            if (overrides[kind]) rootStyle.setProperty(name, value);
            else rootStyle.removeProperty(name);
        },
    );
};

export const setFieldColors = (overrides: FieldColorOverrides) => {
    applyFieldColors(overrides);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch {
        // Storage can be blocked; the choice then lasts until reload
    }
};

if (typeof document !== 'undefined') applyFieldColors(getStoredFieldColors());

export const LD_FIELD_COLORS = {
    dimension: {
        bg: 'var(--ld-field-dimension-bg)',
        bgHover: 'var(--ld-field-dimension-bg-hover)',
        color: 'var(--ld-field-dimension-color)',
        columnHeaderColor: 'var(--ld-field-dimension-header-color)',
        mantineColor: 'dimension',
    },
    metric: {
        bg: 'var(--ld-field-metric-bg)',
        bgHover: 'var(--ld-field-metric-bg-hover)',
        color: 'var(--ld-field-metric-color)',
        columnHeaderColor: 'var(--ld-field-metric-header-color)',
        mantineColor: 'metric',
    },
    calculation: {
        bg: 'light-dark(#EBF5ED, #1D3525)',
        bgHover: 'light-dark(#2f9e4428, #23753565)',
        color: 'light-dark(#2b8a3e, #38af4d)',
        columnHeaderColor: 'light-dark(#237032, #48b95d)',
        mantineColor: 'calculation',
    },
    DEFAULT: {
        bg: 'var(--mantine-color-gray-light)',
        bgHover: 'var(--mantine-color-gray-light-hover)',
        color: 'var(--mantine-color-gray-light-color)',
        columnHeaderColor: 'var(--mantine-color-gray-light-color)',
        mantineColor: 'ldGray',
    },
} satisfies {
    dimension: LightdashFieldColors;
    metric: LightdashFieldColors;
    calculation: LightdashFieldColors;
    DEFAULT: LightdashFieldColors;
};
