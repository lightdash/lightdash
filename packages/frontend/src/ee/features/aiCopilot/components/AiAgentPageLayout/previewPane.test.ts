import { describe, expect, it } from 'vitest';
import { PREVIEW_PANE_MAX, previewPaneOf } from './previewPane';

describe('previewPaneOf', () => {
    it('opens a composer artifact at the maximum width under its own layout key', () => {
        expect(previewPaneOf('artifact', true)).toEqual({
            id: 'composer-artifact',
            defaultSize: PREVIEW_PANE_MAX,
        });
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
        expect(previewPaneOf('dataApp', false).defaultSize).toBe(60);
    });
});
