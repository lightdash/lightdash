import { ProjectMemberRole } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { heldScopes, ROLE_ORDER, SYSTEM_ROLE_SCOPES } from './access';
import {
    accessNote,
    buildLearnCatalogue,
    gateFor,
    holds,
    sortForLearner,
    type LearnModule,
} from './catalogue';

/** What a system role holds, the way the library resolves it. */
const asRole = (role: ProjectMemberRole) =>
    SYSTEM_ROLE_SCOPES.find((system) => system.role === role)!.held;

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
        const sorted = sortForLearner(
            asRole(ProjectMemberRole.ADMIN),
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
        const sorted = sortForLearner(
            asRole(ProjectMemberRole.ADMIN),
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

describe('what the learner holds', () => {
    const catalogue = buildLearnCatalogue();
    const module = (scope: string) => {
        const found = catalogue.find((m) => m.scope === scope);
        if (!found) throw new Error(`${scope} is not in the catalogue`);
        return found;
    };
    const modulesIn = (held: Set<string>) =>
        catalogue.filter((m) => holds(held, m)).map((m) => m.scope);

    it('is the features their scopes cover, whatever role gave them', () => {
        const viewer = modulesIn(asRole(ProjectMemberRole.VIEWER));
        expect(viewer).toContain('view:Dashboard');
        expect(viewer).not.toContain('manage:Dashboard');

        // Scopes gathered from several roles at once, as a learner holds
        // them across projects: an editor here, a validator there.
        const across = heldScopes(
            ['view:Dashboard', 'manage:Dashboard', 'manage:Validation'],
            true,
        );
        expect(holds(across, module('manage:Dashboard'))).toBe(true);
        expect(holds(across, module('manage:Validation'))).toBe(true);
        expect(holds(across, module('view:Space'))).toBe(false);
    });

    it('holds exactly what the rank comparison held, for every system role', () => {
        // The library used to ask whether the learner's role outranked the
        // lowest role holding a module. Scope membership has to agree with
        // that everywhere, or a system role's library changes under them.
        const byRank = (role: ProjectMemberRole, m: LearnModule) =>
            m.minRole !== null &&
            ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(m.minRole);
        ROLE_ORDER.forEach((role) => {
            catalogue.forEach((m) => {
                expect([role, m.scope, holds(asRole(role), m)]).toEqual([
                    role,
                    m.scope,
                    byRank(role, m),
                ]);
            });
        });
    });

    it('holds more at every rank, and everything at admin', () => {
        const bySets = ROLE_ORDER.map((role) => modulesIn(asRole(role)));
        bySets.forEach((scopes, rank) => {
            if (rank === 0) return;
            expect(scopes).toEqual(expect.arrayContaining(bySets[rank - 1]));
        });
        expect(bySets[bySets.length - 1]).toHaveLength(catalogue.length);
    });

    it('reads a scope variant the way the grant means it', () => {
        // Own content only never makes the feature theirs; a grant in one
        // space does.
        expect(
            holds(
                heldScopes(['manage:Dashboard@self'], true),
                module('manage:Dashboard'),
            ),
        ).toBe(false);
        expect(
            holds(
                heldScopes(['manage:Dashboard@space'], true),
                module('manage:Dashboard'),
            ),
        ).toBe(true);
    });
});

describe('what a card says about a module the learner cannot practise', () => {
    const catalogue = buildLearnCatalogue();
    const pinning = catalogue.find((m) => m.scope === 'manage:PinnedItems')!;

    it('names the lowest system role that holds it', () => {
        expect(accessNote(asRole(ProjectMemberRole.VIEWER), pinning)).toBe(
            'Editor and above',
        );
    });

    it('says nothing when the learner holds it', () => {
        expect(accessNote(asRole(ProjectMemberRole.ADMIN), pinning)).toBeNull();
        expect(
            accessNote(heldScopes(['manage:PinnedItems'], true), pinning),
        ).toBeNull();
    });
});
