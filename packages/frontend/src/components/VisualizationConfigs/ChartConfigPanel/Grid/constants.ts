export const defaultGrid = {
    containLabel: true,
    left: '25px', // small padding
    right: '25px', // small padding
    top: '30px', // base padding from top
    bottom: '30px', // pixels from bottom (makes room for x-axis)
} as const;

// Legacy grid config with fixed top spacing (pre-dashboard-redesign)
export const defaultGridLegacy = {
    containLabel: true,
    left: '25px', // small padding
    right: '25px', // small padding
    top: '70px', // pixels from top (makes room for legend)
    bottom: '30px', // pixels from bottom (makes room for x-axis)
} as const;

export const legendTopSpacing = 40; // extra spacing added when legend is shown

export const defaultAxisLabelGap = 20;
