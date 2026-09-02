import { type FeatureFlags } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getPickerTemplates, getTemplate } from './templates';

describe('picker templates', () => {
    it('offers the original four templates without any flags', () => {
        const ids = getPickerTemplates(new Set<FeatureFlags>()).map(
            (t) => t.id,
        );
        expect(ids).toEqual(['dashboard', 'slideshow', 'pdf', 'custom']);
    });

    it('resolves a definition with an icon for every template', () => {
        expect(getTemplate('dashboard').icon).toBeDefined();
        expect(getTemplate('dashboard').title).toBe('Dashboard');
    });
});
