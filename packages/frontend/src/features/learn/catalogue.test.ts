import { describe, expect, it } from 'vitest';
import { buildLearnCatalogue, gateFor } from './catalogue';

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
