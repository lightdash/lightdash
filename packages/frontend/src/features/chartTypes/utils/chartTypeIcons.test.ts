import { IconChartScatter3d, IconPuzzle } from '@tabler/icons-react';
import { describe, expect, it } from 'vitest';
import { getChartTypeIcon } from './chartTypeIcons';

describe('getChartTypeIcon', () => {
    it('falls back to the puzzle piece for no icon', () => {
        expect(getChartTypeIcon(null)).toBe(IconPuzzle);
    });

    it('resolves a known icon name to its component', () => {
        expect(getChartTypeIcon('chart-scatter-3d')).toBe(IconChartScatter3d);
    });
});
