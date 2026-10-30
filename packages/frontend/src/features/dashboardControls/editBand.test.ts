import { describe, expect, it } from 'vitest';
import { DASHBOARD_HEADER_HEIGHT } from '../../components/common/Dashboard/dashboard.constants';
import { EDIT_BAND_HEIGHT, getTabsStickyOffset } from './editBand';

describe('getTabsStickyOffset', () => {
    it('is the band height in edit mode with the flag on', () => {
        expect(getTabsStickyOffset(true, true)).toBe(EDIT_BAND_HEIGHT);
    });

    it('is the shipped header height in edit mode with the flag off', () => {
        expect(getTabsStickyOffset(true, false)).toBe(DASHBOARD_HEADER_HEIGHT);
    });

    it('is zero in view mode', () => {
        expect(getTabsStickyOffset(false, true)).toBe(0);
        expect(getTabsStickyOffset(false, false)).toBe(0);
    });
});
