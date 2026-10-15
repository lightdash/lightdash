import { ScopeGroup } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    DEVELOPER,
    FOUNDATIONS,
    getGroupDescription,
    getGroupLabel,
    GROUP_ORDER,
} from './catalogue';
import { GROUP_ICONS, groupVars } from './groupVisuals';

describe('learn group metadata', () => {
    it.each([...Object.values(ScopeGroup), FOUNDATIONS, DEVELOPER])(
        'covers the %s group',
        (group) => {
            expect(GROUP_ORDER.filter((entry) => entry === group)).toHaveLength(
                1,
            );
            expect(getGroupLabel(group)).toBeTruthy();
            expect(getGroupDescription(group)).toBeTruthy();
            expect(GROUP_ICONS[group]).toBeDefined();
            expect(groupVars(group)).toEqual({
                '--mi-band': expect.any(String),
                '--mi-fg': expect.any(String),
            });
        },
    );
});
