import { describe, expect, it } from 'vitest';
import {
    clampLauncherPanelSize,
    LAUNCHER_PANEL_MIN_SIZE,
    parseLauncherPanelSize,
} from './launcherPanelSize';

const available = { width: 1408, height: 820 };

describe('clampLauncherPanelSize', () => {
    it('keeps a size that fits the available space', () => {
        expect(
            clampLauncherPanelSize({ width: 520, height: 700 }, available),
        ).toEqual({ width: 520, height: 700 });
    });

    it('never shrinks below the minimum usable size', () => {
        expect(
            clampLauncherPanelSize({ width: 10, height: 10 }, available),
        ).toEqual(LAUNCHER_PANEL_MIN_SIZE);
    });

    it('never grows past the available space', () => {
        expect(
            clampLauncherPanelSize({ width: 5000, height: 5000 }, available),
        ).toEqual(available);
    });

    it('prefers the minimum size when the available space is smaller than it', () => {
        expect(
            clampLauncherPanelSize(
                { width: 800, height: 800 },
                { width: 200, height: 200 },
            ),
        ).toEqual(LAUNCHER_PANEL_MIN_SIZE);
    });
});

describe('parseLauncherPanelSize', () => {
    it('reads a stored size', () => {
        expect(parseLauncherPanelSize('{"width":500,"height":700}')).toEqual({
            width: 500,
            height: 700,
        });
    });

    it.each([
        ['nothing stored', undefined],
        ['corrupt json', '{width:'],
        ['wrong shape', '{"w":1}'],
        ['non-positive values', '{"width":0,"height":-5}'],
        ['non-numeric values', '{"width":"500","height":"700"}'],
    ])('falls back to the default size on %s', (_, raw) => {
        expect(parseLauncherPanelSize(raw)).toBeNull();
    });
});
