import { IconChartScatter3d, IconPuzzle } from '@tabler/icons-react';
import { describe, expect, it } from 'vitest';
import { getChartTypeIcon, getChartTypeIconLabel } from './chartTypeIcons';

describe('getChartTypeIcon', () => {
    it('falls back to the puzzle piece for no icon', () => {
        expect(getChartTypeIcon(null)).toBe(IconPuzzle);
    });

    it('resolves a known icon name to its component', () => {
        expect(getChartTypeIcon('chart-scatter-3d')).toBe(IconChartScatter3d);
    });
});

describe('getChartTypeIconLabel', () => {
    it('drops a leading "chart-" and capitalises the rest', () => {
        expect(getChartTypeIconLabel('chart-scatter-3d')).toBe('Scatter 3d');
    });

    it('capitalises names without a "chart-" prefix', () => {
        expect(getChartTypeIconLabel('square-number-1')).toBe(
            'Square number 1',
        );
        expect(getChartTypeIconLabel('git-branch')).toBe('Git branch');
    });

    it('leaves a single-word name capitalised', () => {
        expect(getChartTypeIconLabel('table')).toBe('Table');
    });

    it('keeps the chart prefix when stripping it would collide with another icon', () => {
        expect(getChartTypeIconLabel('chart-grid-dots')).toBe(
            'Chart grid dots',
        );
        expect(getChartTypeIconLabel('grid-dots')).toBe('Grid dots');
    });
});
