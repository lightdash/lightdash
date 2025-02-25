import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import {
    IconBolt,
    IconColorFilter,
    IconCubeUnfolded,
    IconLeaf,
    IconRipple,
} from '@tabler/icons-react';

export const PRESET_COLOR_PALETTES = [
    {
        name: 'Default Colors',
        icon: IconColorFilter,
        colors: [
            // Use the initial 9 colors directly from ECHARTS to keep them in sync:
            ...ECHARTS_DEFAULT_COLORS,
            '#33ff7d',
            '#33ffb1',
            '#33ffe6',
            '#33e6ff',
            '#33b1ff',
            '#337dff',
            '#3349ff',
            '#5e33ff',
            '#9233ff',
            '#c633ff',
            '#ff33e1',
        ],
    },
    {
        name: 'Modern',
        icon: IconCubeUnfolded,
        colors: [
            '#7162FF', // Lightdash Purple
            '#1A1B1E', // Charcoal
            '#2D2E30', // Dark Gray
            '#4A4B4D', // Medium Gray
            '#6B6C6E', // Light Gray
            '#E8DDFB', // Lavender
            '#D4F7E9', // Mint
            '#F0A3FF', // Pink
            '#00FFEA', // Cyan
            '#FFEA00', // Yellow
            '#00FF7A', // Neon Green
            '#FF0080', // Magenta
            '#FF6A00', // Orange
            '#6A00FF', // Deep Purple
            '#00FF00', // Lime
            '#FF0000', // Red
            '#FF00FF', // Fuchsia
            '#00FFFF', // Aqua
            '#7A00FF', // Violet
            '#FFAA00', // Amber
        ],
    },
    {
        name: 'Retro',
        icon: IconLeaf,
        colors: [
            '#FF6B35', // Vibrant Orange
            '#ECB88A', // Peach
            '#D4A373', // Terracotta
            '#BC8A5F', // Clay
            '#A47148', // Brown
            '#8A5A39', // Dark Brown
            '#6F4E37', // Mocha
            '#544334', // Umber
            '#393731', // Slate
            '#2E2E2E', // Charcoal
            '#F4D06F', // Mustard
            '#FFD700', // Gold
            '#C0BABC', // Silver
            '#A9A9A9', // Medium Gray
            '#808080', // Gray
            '#696969', // Dim Gray
            '#556B2F', // Olive
            '#6B8E23', // Olive Drab
            '#8FBC8B', // Dark Sea Green
            '#BDB76B', // Dark Khaki
        ],
    },
    {
        name: 'Business',
        icon: IconRipple,
        colors: [
            '#1A237E',
            '#283593',
            '#303F9F',
            '#3949AB',
            '#3F51B5',
            '#5C6BC0',
            '#7986CB',
            '#9FA8DA',
            '#C5CAE9',
            '#E8EAF6',
            '#4CAF50',
            '#66BB6A',
            '#81C784',
            '#A5D6A7',
            '#C8E6C9',
            '#FFA726',
            '#FFB74D',
            '#FFCC80',
            '#FFE0B2',
            '#FFF3E0',
        ],
    },
    {
        name: 'Lightdash of Color',
        icon: IconBolt,
        colors: [
            '#7162FF',
            '#1A1B1E',
            '#E8DDFB',
            '#D4F7E9',
            '#F0A3FF',
            '#00FFEA',
            '#FFEA00',
            '#00FF7A',
            '#FF0080',
            '#FF6A00',
            '#6A00FF',
            '#00FF00',
            '#FF0000',
            '#FF00FF',
            '#00FFFF',
            '#7A00FF',
            '#FF7A00',
            '#00FFAA',
            '#FF00AA',
            '#FFAA00',
        ],
    },
    {
        name: 'Data Matrix',
        icon: IconCubeUnfolded,
        colors: [
            '#FF00FF',
            '#00FFFF',
            '#FFFF00',
            '#FF0080',
            '#00FF00',
            '#00FF80',
            '#8000FF',
            '#FF8000',
            '#FF0088',
            '#00FF88',
            '#0088FF',
            '#88FF00',
            '#FF8800',
            '#FF8800',
            '#FF0088',
            '#8800FF',
            '#0088FF',
            '#8800FF',
            '#00FF88',
            '#FF8800',
        ],
    },
];
