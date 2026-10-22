import { DEFAULT_UI_STRINGS, type UiStringResolver } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getLockSummary,
    getRequiredSummary,
    getTilesSummary,
} from './railSummaries';

const english: UiStringResolver = (key) => DEFAULT_UI_STRINGS[key];

describe('railSummaries', () => {
    it('counts the tiles and fields of a filter', () => {
        expect(getTilesSummary(3, 2, english)).toBe('3 tiles · 2 fields');
        expect(getTilesSummary(1, 1, english)).toBe('1 tile · 1 field');
        expect(getTilesSummary(0, 1, english)).toBe('0 tiles · 1 field');
    });

    it('names the tabs a filter is locked on', () => {
        const tabs = (lockedTabNames: string[]) => ({
            hasTabs: true as const,
            lockedTabNames,
            tabCount: 3,
        });
        expect(getLockSummary(tabs([]))).toBeNull();
        expect(getLockSummary(tabs(['Overview']))).toBe('Locked on Overview');
        expect(getLockSummary(tabs(['Overview', 'Details']))).toBe(
            'Locked on 2 tabs',
        );
        expect(getLockSummary(tabs(['Overview', 'Details', 'Finance']))).toBe(
            'Locked',
        );
    });

    it('says only "Locked" on a dashboard without tabs', () => {
        expect(getLockSummary({ hasTabs: false, isLocked: true })).toBe(
            'Locked',
        );
        expect(getLockSummary({ hasTabs: false, isLocked: false })).toBeNull();
    });

    it('names the alternatives of a required filter', () => {
        expect(getRequiredSummary(false, ['Region'])).toBeNull();
        expect(getRequiredSummary(true, [])).toBe('Required');
        expect(getRequiredSummary(true, ['Region', 'Country'])).toBe(
            'Required, or Region or Country',
        );
    });
});
