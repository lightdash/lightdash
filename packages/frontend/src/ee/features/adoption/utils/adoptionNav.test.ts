import { IconSearch } from '@tabler/icons-react';
import { describe, expect, it } from 'vitest';
import { filterSettingsNavigation } from '../../../../hooks/settings/filterSettingsNavigation';
import { type SettingsNavigationSection } from '../../../../hooks/settings/types';
import {
    ADOPTION_NAV_KEYWORDS,
    ADOPTION_PATH,
    getDepartmentPath,
    getSelectedDepartment,
    parseAdoptionView,
    withSelectedDepartment,
} from './adoptionNav';

describe('adoption nav', () => {
    const sections: SettingsNavigationSection[] = [
        {
            id: 'organization',
            title: 'Organization settings',
            subtitle: null,
            items: [
                {
                    label: 'Adoption',
                    to: ADOPTION_PATH,
                    icon: IconSearch,
                    keywords: ADOPTION_NAV_KEYWORDS,
                    children: [],
                    exact: true,
                },
            ],
        },
    ];
    it.each(['department', 'headcount', 'rollout'])(
        'is found by searching "%s"',
        (query) => {
            const result = filterSettingsNavigation(sections, query);
            expect(result.flatMap((s) => s.items.map((i) => i.label))).toEqual([
                'Adoption',
            ]);
        },
    );
    it('links to the page with the department selected, encoding whatever it is given', () => {
        expect(getDepartmentPath('abc')).toBe(
            '/generalSettings/adoption?department=abc',
        );
        expect(getDepartmentPath('../../user?x=1')).toBe(
            '/generalSettings/adoption?department=..%2F..%2Fuser%3Fx%3D1',
        );
    });
});

describe('the department selected in the link', () => {
    it('is read from the query string, and an empty one selects nothing', () => {
        expect(
            getSelectedDepartment(new URLSearchParams('view=map&department=a')),
        ).toBe('a');
        expect(getSelectedDepartment(new URLSearchParams('department='))).toBe(
            null,
        );
        expect(getSelectedDepartment(new URLSearchParams('view=map'))).toBe(
            null,
        );
    });
    it('is written beside the rest of the query string, and taken out to select nothing', () => {
        const params = new URLSearchParams('view=list');
        expect(withSelectedDepartment(params, 'a').toString()).toBe(
            'view=list&department=a',
        );
        expect(
            withSelectedDepartment(
                new URLSearchParams('view=list&department=a'),
                null,
            ).toString(),
        ).toBe('view=list');
        // The query string given is left as it was
        expect(params.toString()).toBe('view=list');
    });
});

describe('parseAdoptionView', () => {
    it('returns the requested view when it is available', () => {
        expect(parseAdoptionView('list', ['map', 'list'])).toBe('list');
    });
    it('falls back to the first available view for missing or unknown values', () => {
        expect(parseAdoptionView(null, ['map', 'list'])).toBe('map');
        expect(parseAdoptionView('grid', ['map', 'list'])).toBe('map');
    });
    it('opens on the map by default', () => {
        expect(parseAdoptionView(null)).toBe('map');
        expect(parseAdoptionView('list')).toBe('list');
        expect(parseAdoptionView('waffle')).toBe('waffle');
        expect(parseAdoptionView('grid')).toBe('map');
    });
    it('ignores a view that is not available yet', () => {
        expect(parseAdoptionView('map', ['list'])).toBe('list');
    });
});
