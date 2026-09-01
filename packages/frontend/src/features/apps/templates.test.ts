import { FeatureFlags } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getGalleryTemplates,
    getPickerTemplates,
    getTemplate,
} from './templates';

describe('picker templates', () => {
    it('offers the original four templates without any flags', () => {
        const ids = getPickerTemplates(new Set<FeatureFlags>()).map(
            (t) => t.id,
        );
        expect(ids).toEqual(['dashboard', 'slideshow', 'pdf', 'custom']);
    });

    it('keeps forecaster off the fan even when the templates flag is on', () => {
        const ids = getPickerTemplates(
            new Set([FeatureFlags.EnableDataAppTemplates]),
        ).map((t) => t.id);
        expect(ids).toEqual(['dashboard', 'slideshow', 'pdf', 'custom']);
    });

    it('gates the gallery on enable-data-app-templates', () => {
        expect(getGalleryTemplates(new Set<FeatureFlags>())).toEqual([]);
        const ids = getGalleryTemplates(
            new Set([FeatureFlags.EnableDataAppTemplates]),
        ).map((t) => t.id);
        expect(ids).toEqual(['forecaster']);
    });

    it('resolves a definition with an icon for every template', () => {
        expect(getTemplate('forecaster').icon).toBeDefined();
        expect(getTemplate('dashboard').icon).toBeDefined();
        expect(getTemplate('dashboard').title).toBe('Dashboard');
    });
});
