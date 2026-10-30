import { describe, expect, it } from 'vitest';
import {
    DASHBOARD_EDIT_BAND_HEIGHT,
    DASHBOARD_HEADER_HEIGHT,
} from '../../components/common/Dashboard/dashboard.constants';
import { getTabsStickyOffset, isEditBandShown } from './editBand';

describe('isEditBandShown', () => {
    it('is on in edit mode with the flag on for a user who can manage', () => {
        expect(isEditBandShown(true, true, true)).toBe(true);
    });

    it('is off without manage access, with the flag off or in view mode', () => {
        expect(isEditBandShown(true, true, false)).toBe(false);
        expect(isEditBandShown(true, false, true)).toBe(false);
        expect(isEditBandShown(false, true, true)).toBe(false);
    });
});

describe('getTabsStickyOffset', () => {
    it('is the band height in edit mode with the flag on', () => {
        expect(getTabsStickyOffset(true, true, true)).toBe(
            DASHBOARD_EDIT_BAND_HEIGHT,
        );
    });

    it('is the shipped header height in edit mode without manage access', () => {
        expect(getTabsStickyOffset(true, true, false)).toBe(
            DASHBOARD_HEADER_HEIGHT,
        );
    });

    it('is the shipped header height in edit mode with the flag off', () => {
        expect(getTabsStickyOffset(true, false, true)).toBe(
            DASHBOARD_HEADER_HEIGHT,
        );
        expect(getTabsStickyOffset(true, false, false)).toBe(
            DASHBOARD_HEADER_HEIGHT,
        );
    });

    it('is zero in view mode', () => {
        expect(getTabsStickyOffset(false, true, true)).toBe(0);
        expect(getTabsStickyOffset(false, false, false)).toBe(0);
    });
});
