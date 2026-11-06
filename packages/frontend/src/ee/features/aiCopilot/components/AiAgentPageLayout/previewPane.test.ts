import { describe, expect, it } from 'vitest';
import { PREVIEW_PANE_MAX, previewPaneOf } from './previewPane';

describe('previewPaneOf', () => {
    it('opens a composer artifact wide under its own layout key', () => {
        const pane = previewPaneOf('artifact', true);
        expect(pane.id).toBe('composer-artifact');
        expect(pane.defaultSize).toBeGreaterThan(
            previewPaneOf('artifact', false).defaultSize,
        );
        expect(pane.defaultSize).toBeLessThanOrEqual(PREVIEW_PANE_MAX);
    });

    it('keeps other artifacts and saved charts at the chart width', () => {
        expect(previewPaneOf('artifact', false)).toEqual({
            id: 'chart-artifact',
            defaultSize: 46,
        });
        expect(previewPaneOf('savedChart', false)).toEqual(
            previewPaneOf('artifact', false),
        );
    });

    it('opens data apps wider than charts', () => {
        expect(previewPaneOf('dataApp', false).defaultSize).toBeGreaterThan(
            previewPaneOf('artifact', false).defaultSize,
        );
    });

    it('opens Documents under their own layout key, wider than charts', () => {
        expect(previewPaneOf('document', false)).toEqual({
            id: 'document',
            defaultSize: 50,
        });
    });
});
