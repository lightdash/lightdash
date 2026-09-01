import { describe, expect, it } from 'vitest';
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
