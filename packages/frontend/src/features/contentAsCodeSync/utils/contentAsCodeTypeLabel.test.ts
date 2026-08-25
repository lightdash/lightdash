import { describe, expect, it } from 'vitest';
import { getContentAsCodeTypeLabel } from './contentAsCodeTypeLabel';

describe('getContentAsCodeTypeLabel', () => {
    it('labels managed content types', () => {
        expect(getContentAsCodeTypeLabel('chart')).toBe('Chart');
        expect(getContentAsCodeTypeLabel('dashboard')).toBe('Dashboard');
    });
});
