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

export const LD_FIELD_COLORS = {
    dimension: {
        bg: 'light-dark(#EDF0FD, #202539)',
        bgHover: 'light-dark(#4b69ef28, #4b69ef35)',
        color: 'light-dark(#3b5bdb, #95aaf0)',
        columnHeaderColor: 'light-dark(#1c2b67, #93acff)',
        mantineColor: 'dimension',
    },
    metric: {
        bg: 'light-dark(#FBE9E0, #3E2F1A)',
        bgHover: 'light-dark(#e8590c30, #81510d75)',
        color: 'light-dark(#de7f0b, #e08a20)',
        columnHeaderColor: 'light-dark(#502e06, #de7f0b)',
        mantineColor: 'metric',
    },
    calculation: {
        bg: 'light-dark(#EBF5ED, #1D3525)',
        bgHover: 'light-dark(#2f9e4428, #23753565)',
        color: 'light-dark(#2b8a3e, #38af4d)',
        columnHeaderColor: 'light-dark(#1b5326, #48b95d)',
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
