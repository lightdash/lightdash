import { type CreateColorPalette } from '@lightdash/common';

// Managed palette for the Analytics project. Library charts take their series
// colours from the palette the host resolves, so every analytics dashboard
// shares one theme. Vivid and pastel colours alternate so neighbouring stacked
// series stay distinguishable. The name identifies the palette on each sync.
export const analyticsColorPalette = {
    name: 'Lightdash analytics',
    colors: [
        '#6366F1',
        '#A5B4FC',
        '#22D3EE',
        '#F472B6',
        '#C4B5FD',
        '#34D399',
        '#FBCFE8',
        '#FBBF24',
        '#A5F3FC',
        '#8B5CF6',
        '#6EE7B7',
        '#FB7185',
        '#FDE68A',
        '#38BDF8',
        '#E879F9',
        '#BBF7D0',
        '#818CF8',
        '#F9A8D4',
        '#2DD4BF',
        '#DDD6FE',
    ],
    darkColors: [
        '#818CF8',
        '#C7D2FE',
        '#67E8F9',
        '#F9A8D4',
        '#DDD6FE',
        '#6EE7B7',
        '#FCE7F3',
        '#FCD34D',
        '#CFFAFE',
        '#A78BFA',
        '#A7F3D0',
        '#FDA4AF',
        '#FEF3C7',
        '#7DD3FC',
        '#F0ABFC',
        '#DCFCE7',
        '#A5B4FC',
        '#FBCFE8',
        '#5EEAD4',
        '#EDE9FE',
    ],
} satisfies Required<CreateColorPalette>;
