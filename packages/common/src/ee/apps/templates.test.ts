import { describe, expect, it } from 'vitest';
import { FeatureFlags } from '../../types/featureFlags';
import { DATA_APP_TEMPLATE_DEFINITIONS } from './templates';
import { DATA_APP_TEMPLATES } from './types';

describe('data app template registry', () => {
    it('defines every template in DATA_APP_TEMPLATES', () => {
        for (const id of DATA_APP_TEMPLATES) {
            const def = DATA_APP_TEMPLATE_DEFINITIONS[id];
            expect(def).toBeDefined();
            expect(def.id).toBe(id);
            expect(def.title.length).toBeGreaterThan(0);
            expect(def.description.length).toBeGreaterThan(0);
            expect(def.category.length).toBeGreaterThan(0);
        }
    });

    it('includes forecaster, surfaced in the gallery behind the templates flag', () => {
        expect(DATA_APP_TEMPLATES).toContain('forecaster');
        const def = DATA_APP_TEMPLATE_DEFINITIONS.forecaster;
        expect(def.inPicker).toBe(false);
        expect(def.inGallery).toBe(true);
        expect(def.requiredFlag).toBe(FeatureFlags.EnableDataAppTemplates);
    });

    it('includes scorecard, gallery-surfaced behind the templates flag', () => {
        expect(DATA_APP_TEMPLATES).toContain('scorecard');
        const def = DATA_APP_TEMPLATE_DEFINITIONS.scorecard;
        expect(def.inPicker).toBe(false);
        expect(def.inGallery).toBe(true);
        expect(def.requiredFlag).toBe(FeatureFlags.EnableDataAppTemplates);
    });

    it('declares template questions for the seeded templates', () => {
        for (const id of ['forecaster', 'scorecard'] as const) {
            const questions = DATA_APP_TEMPLATE_DEFINITIONS[id].questions ?? [];
            expect(questions.length).toBeGreaterThanOrEqual(3);
            expect(new Set(questions.map((q) => q.key)).size).toBe(
                questions.length,
            );
            for (const q of questions) {
                expect(q.label.length).toBeGreaterThan(0);
            }
        }
        // The scorecard's tiles are a repeatable list, not a single value.
        expect(
            DATA_APP_TEMPLATE_DEFINITIONS.scorecard.questions?.some(
                (q) => q.kind === 'list',
            ),
        ).toBe(true);
        // Built-ins keep the freeform composer.
        expect(
            DATA_APP_TEMPLATE_DEFINITIONS.dashboard.questions,
        ).toBeUndefined();
    });

    it('keeps the original five templates ungated', () => {
        const originalIds = [
            'dashboard',
            'slideshow',
            'pdf',
            'custom',
            'data_app_viz',
        ] as const;
        for (const id of originalIds) {
            expect(
                DATA_APP_TEMPLATE_DEFINITIONS[id].requiredFlag,
            ).toBeUndefined();
        }
    });

    it('keeps data_app_viz off the create picker', () => {
        expect(DATA_APP_TEMPLATE_DEFINITIONS.data_app_viz.inPicker).toBe(false);
    });
});
