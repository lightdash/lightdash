import { ScopeGroup } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildLearnCatalogue,
    gateFor,
    GROUP_DESCRIPTIONS,
    GROUP_LABELS,
    GROUP_ORDER,
} from './catalogue';
import { GROUP_ICONS, groupVars } from './groupVisuals';

describe('learn group metadata', () => {
    it.each(Object.values(ScopeGroup))('covers the %s scope group', (group) => {
        expect(GROUP_ORDER.filter((entry) => entry === group)).toHaveLength(1);
        expect(GROUP_LABELS[group]).toBeTruthy();
        expect(GROUP_DESCRIPTIONS[group]).toBeTruthy();
        expect(GROUP_ICONS[group]).toBeDefined();
        expect(groupVars(group)).toEqual({
            '--mi-band': expect.any(String),
            '--mi-fg': expect.any(String),
        });
    });
});

describe('learn catalogue gates', () => {
    it('gates data app modules on the data apps switch, not the licence', () => {
        expect(gateFor({ name: 'create:DataApp', isEnterprise: false })).toBe(
            'dataApps',
        );
        expect(gateFor({ name: 'manage:DataApp', isEnterprise: false })).toBe(
            'dataApps',
        );
    });

    it('gates every AI module on the agents being available', () => {
        [
            'manage:AiAgent',
            'create:AiAgentThread',
            'create:AiDeepResearch',
        ].forEach((name) =>
            expect(gateFor({ name, isEnterprise: true })).toBe('aiAgents'),
        );
    });

    it('gates other Enterprise scopes on the licence and open-source ones on nothing', () => {
        expect(
            gateFor({ name: 'manage:MetricsTree', isEnterprise: true }),
        ).toBe('enterprise');
        expect(
            gateFor({ name: 'manage:ProjectHomepage', isEnterprise: true }),
        ).toBe('enterprise');
        expect(
            gateFor({ name: 'manage:SavedChart', isEnterprise: false }),
        ).toBe(null);
    });

    it('leaves the core walkthroughs open on any instance', () => {
        const open = buildLearnCatalogue().filter((m) => m.gate === null);
        [
            'manage:SavedChart',
            'manage:Dashboard',
            'manage:Space',
            'manage:SqlRunner',
        ].forEach((scope) => expect(open.map((m) => m.scope)).toContain(scope));
    });
});
