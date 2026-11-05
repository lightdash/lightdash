import { describe, expect, it } from 'vitest';
import {
    BUILD_STAGES,
    getBuildStageIndex,
    getBuildStageLabel,
} from './buildStage';

describe('getBuildStageIndex', () => {
    it('stays on Preparing before the agent starts', () => {
        expect(getBuildStageIndex(null, [])).toBe(0);
        expect(getBuildStageIndex('catalog', [])).toBe(0);
    });

    it('moves from exploring to writing once the agent edits a file', () => {
        expect(getBuildStageIndex('generating', ['Reading orders.yml'])).toBe(
            1,
        );
        expect(
            getBuildStageIndex('generating', [
                'Reading orders.yml',
                'Editing App.tsx',
            ]),
        ).toBe(2);
    });

    it('reports bundling as the last stage and ready as done', () => {
        expect(getBuildStageIndex('packaging', [])).toBe(3);
        expect(getBuildStageIndex('ready', [])).toBe(BUILD_STAGES.length);
    });
});

describe('getBuildStageLabel', () => {
    it('names the exploring stage by whether the app already exists', () => {
        expect(getBuildStageLabel(1, false)).toBe('Exploring your data');
        expect(getBuildStageLabel(1, true)).toBe('Reading your app and data');
    });
});
