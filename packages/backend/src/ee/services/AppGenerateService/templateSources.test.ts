import { DATA_APP_TEMPLATES } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getTemplateBindInstructions,
    getTemplateSource,
    shouldSeedTemplateSource,
} from './templateSources';

describe('template starter sources', () => {
    it('provides seeded source for forecaster', () => {
        const source = getTemplateSource('forecaster');
        expect(source).not.toBeNull();
        const filenames = source!.map((f) => f.filename);
        expect(filenames).toContain('template.json');
        expect(filenames).toContain('src/App.jsx');
        expect(filenames).toContain('src/template.js');
        // Scaffold files stay the sandbox image's own.
        expect(filenames.some((f) => f.startsWith('src/lib/'))).toBe(false);
        expect(filenames.some((f) => f.startsWith('src/components/ui'))).toBe(
            false,
        );
    });

    it('ships a valid manifest with neutral bindings', () => {
        const source = getTemplateSource('forecaster');
        const manifest = JSON.parse(
            source!.find((f) => f.filename === 'template.json')!.contents,
        );
        expect(manifest.templateVersion).toBe(1);
        expect(manifest.bindings.history.explore).toBeTruthy();
        expect(manifest.bindings.history.timeDimension).toBeTruthy();
        expect(manifest.bindings.history.primaryMetric).toBeTruthy();
    });

    it('has no source for instruction-pack templates', () => {
        for (const id of [
            'dashboard',
            'slideshow',
            'pdf',
            'custom',
            'data_app_viz',
        ] as const) {
            expect(getTemplateSource(id)).toBeNull();
        }
    });

    it('seeds only first builds of templates that have source', () => {
        expect(
            shouldSeedTemplateSource('forecaster', {
                version: 1,
                wasResumed: false,
            }),
        ).toBe(true);
        expect(
            shouldSeedTemplateSource('forecaster', {
                version: 2,
                wasResumed: false,
            }),
        ).toBe(false);
        expect(
            shouldSeedTemplateSource('forecaster', {
                version: 1,
                wasResumed: true,
            }),
        ).toBe(false);
        expect(
            shouldSeedTemplateSource('dashboard', {
                version: 1,
                wasResumed: false,
            }),
        ).toBe(false);
        expect(
            shouldSeedTemplateSource(undefined, {
                version: 1,
                wasResumed: false,
            }),
        ).toBe(false);
    });

    it('swaps seeded templates onto bind instructions', () => {
        const instructions = getTemplateBindInstructions('forecaster');
        expect(instructions).toContain('template.json');
        expect(instructions).toContain('already contains');
        expect(instructions).toMatch(/do not rewrite|keep the/i);
        // Sourceless templates have no bind mode.
        expect(getTemplateBindInstructions('dashboard')).toBeNull();
    });

    it('covers every template id without throwing', () => {
        for (const id of DATA_APP_TEMPLATES) {
            expect(() => getTemplateSource(id)).not.toThrow();
            expect(() => getTemplateBindInstructions(id)).not.toThrow();
        }
    });
});
