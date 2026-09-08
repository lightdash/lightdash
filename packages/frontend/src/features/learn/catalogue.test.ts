import { ProjectMemberRole } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildLearnCatalogue, gateFor, sortForRole } from './catalogue';

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

describe('learn catalogue order', () => {
    const positions = (scopes: string[]) => {
        const sorted = sortForRole(
            ProjectMemberRole.ADMIN,
            buildLearnCatalogue(),
        ).map((module) => module.scope);
        return scopes.map((scope) => sorted.indexOf(scope));
    };

    it('teaches a dashboard before the conversation held on one', () => {
        const [dashboard, comments] = positions([
            'view:Dashboard',
            'view:DashboardComments',
        ]);
        expect(dashboard).toBeGreaterThanOrEqual(0);
        expect(dashboard).toBeLessThan(comments);
    });

    it('teaches making a space before sharing one, and an app likewise', () => {
        const [create, share] = positions(['create:Space', 'manage:Space']);
        expect(create).toBeLessThan(share);
        const [app, shareApp] = positions(['create:DataApp', 'manage:DataApp']);
        expect(app).toBeLessThan(shareApp);
    });

    it('puts a module with no walkthrough after every module with one', () => {
        const sorted = sortForRole(
            ProjectMemberRole.ADMIN,
            buildLearnCatalogue(),
        );
        const lastAvailable = sorted.findLastIndex(
            (module) => module.available,
        );
        expect(
            sorted.slice(0, lastAvailable + 1).every((m) => m.available),
        ).toBe(true);
    });
});
