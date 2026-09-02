import { DATA_APP_TEMPLATES } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getTemplateInstructions } from './templates';

describe('getTemplateInstructions', () => {
    it('keeps the existing templates behaving identically', () => {
        expect(getTemplateInstructions('dashboard')).toContain(
            'single-page dashboard',
        );
        expect(getTemplateInstructions('slideshow')).toContain(
            'slideshow-style',
        );
        expect(getTemplateInstructions('pdf')).toContain(
            'print-optimized report',
        );
        expect(getTemplateInstructions('custom')).toBeNull();
        expect(getTemplateInstructions('data_app_viz')).toContain(
            'reusable chart component',
        );
    });

    it('covers every declared template', () => {
        for (const id of DATA_APP_TEMPLATES) {
            expect(getTemplateInstructions(id)).not.toBeUndefined();
        }
    });
});
