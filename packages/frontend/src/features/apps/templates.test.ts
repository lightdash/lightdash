import { describe, expect, it } from 'vitest';
import { getPickerTemplates, getTemplate } from './templates';

describe('picker templates', () => {
    it('offers the four built-in flavours as fan cards', () => {
        const ids = getPickerTemplates().map((t) => t.id);
        expect(ids).toEqual(['dashboard', 'slideshow', 'pdf', 'custom']);
    });

    it('resolves a definition with an icon for every template', () => {
        expect(getTemplate('data_app_viz').icon).toBeDefined();
        expect(getTemplate('dashboard').icon).toBeDefined();
        expect(getTemplate('dashboard').title).toBe('Dashboard');
    });
});
