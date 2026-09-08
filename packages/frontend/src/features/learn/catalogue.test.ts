import { ProjectMemberRole } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildLearnCatalogue,
    gateFor,
    roleHolds,
    roleNote,
    sortForRole,
    type LearnModule,
} from './catalogue';
import {
    buildRoleViews,
    customRoleView,
    defaultRoleView,
    ownRoleView,
    ROLE_ORDER,
    systemRoleView,
} from './roles';

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
            systemRoleView(ProjectMemberRole.ADMIN),
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
            systemRoleView(ProjectMemberRole.ADMIN),
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

describe('what a view holds', () => {
    const catalogue = buildLearnCatalogue();
    const module = (scope: string) => {
        const found = catalogue.find((m) => m.scope === scope);
        if (!found) throw new Error(`${scope} is not in the catalogue`);
        return found;
    };
    const held = (view: ReturnType<typeof systemRoleView>) =>
        catalogue.filter((m) => roleHolds(view, m)).map((m) => m.scope);

    it('gives each system role what its scopes hold, and no more', () => {
        const viewer = held(systemRoleView(ProjectMemberRole.VIEWER));
        expect(viewer).toContain('view:Dashboard');
        expect(viewer).toContain('view:Space');
        expect(viewer).not.toContain('manage:Dashboard');

        const editor = held(systemRoleView(ProjectMemberRole.EDITOR));
        expect(editor).toContain('manage:Dashboard');
        expect(editor).toContain('manage:SavedChart');
        expect(editor).not.toContain('manage:Validation');

        expect(held(systemRoleView(ProjectMemberRole.DEVELOPER))).toContain(
            'manage:Validation',
        );
    });

    it('holds exactly what the rank comparison held, for every system role', () => {
        // What this ticket replaces: a module was held when the chosen role
        // ranked at or above the lowest role holding it. Scope membership
        // has to agree with it everywhere, or a system role's library
        // changes under the learner.
        const byRank = (role: ProjectMemberRole, m: LearnModule) =>
            m.minRole !== null &&
            ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(m.minRole);
        ROLE_ORDER.forEach((role) => {
            const view = systemRoleView(role);
            catalogue.forEach((m) => {
                expect([role, m.scope, roleHolds(view, m)]).toEqual([
                    role,
                    m.scope,
                    byRank(role, m),
                ]);
            });
        });
    });

    it('holds more at every rank, and everything at admin', () => {
        const bySets = ROLE_ORDER.map((role) => held(systemRoleView(role)));
        bySets.forEach((scopes, rank) => {
            if (rank === 0) return;
            expect(scopes).toEqual(expect.arrayContaining(bySets[rank - 1]));
        });
        expect(bySets[bySets.length - 1]).toHaveLength(catalogue.length);
    });

    it("holds a custom role's own scopes, wherever they sit on the ladder", () => {
        const analyst = customRoleView({
            roleUuid: 'role-1',
            name: 'Analyst',
            scopes: ['manage:Validation', 'view:Dashboard'],
        });
        expect(roleHolds(analyst, module('manage:Validation'))).toBe(true);
        expect(roleHolds(analyst, module('view:Dashboard'))).toBe(true);
        // An admin-level scope held does not drag the rest of the ladder in.
        expect(roleHolds(analyst, module('manage:Dashboard'))).toBe(false);
        expect(roleHolds(analyst, module('view:Space'))).toBe(false);
    });

    it('reads a scope variant the way the grant means it', () => {
        const ownOnly = customRoleView({
            roleUuid: 'role-2',
            name: 'Own content',
            scopes: ['manage:Dashboard@self'],
        });
        expect(roleHolds(ownOnly, module('manage:Dashboard'))).toBe(false);

        const inSpaces = customRoleView({
            roleUuid: 'role-3',
            name: 'Space editor',
            scopes: ['manage:Dashboard@space'],
        });
        expect(roleHolds(inSpaces, module('manage:Dashboard'))).toBe(true);
    });
});

describe('what a card says about a module the view lacks', () => {
    const catalogue = buildLearnCatalogue();
    const pinning = catalogue.find((m) => m.scope === 'manage:PinnedItems')!;

    it('names the lowest system role that holds it', () => {
        expect(
            roleNote(systemRoleView(ProjectMemberRole.VIEWER), pinning),
        ).toBe('Editor and above');
    });

    it('says nothing when the view holds the module', () => {
        expect(
            roleNote(systemRoleView(ProjectMemberRole.ADMIN), pinning),
        ).toBeNull();
    });

    it('names the custom role being viewed as, which sits on no ladder', () => {
        const analyst = customRoleView({
            roleUuid: 'role-1',
            name: 'Analyst',
            scopes: ['view:Dashboard'],
        });
        expect(roleNote(analyst, pinning)).toBe('Not in Analyst');
    });
});

describe('the view the library opens on', () => {
    const roles = [
        { roleUuid: 'role-2', name: 'Steward', scopes: ['view:Dashboard'] },
        { roleUuid: 'role-1', name: 'Analyst', scopes: ['view:Dashboard'] },
    ];
    const views = buildRoleViews(roles);

    it("lists the system roles in rank order, then the org's own by name", () => {
        expect(views.map((view) => view.label)).toEqual([
            'Viewer',
            'Interactive viewer',
            'Editor',
            'Developer',
            'Admin',
            'Analyst',
            'Steward',
        ]);
    });

    it("opens on the learner's custom role when they hold one", () => {
        expect(
            defaultRoleView(views, { role: 'member', roleUuid: 'role-1' })
                .label,
        ).toBe('Analyst');
    });

    it('opens on the matching system role, else viewer', () => {
        expect(defaultRoleView(views, { role: 'editor' }).label).toBe('Editor');
        expect(defaultRoleView(views, { role: 'member' }).label).toBe('Viewer');
        expect(defaultRoleView(views, undefined).label).toBe('Viewer');
    });

    it("knows which view is the learner's own role", () => {
        expect(
            ownRoleView(views, { role: 'member', roleUuid: 'role-1' })?.label,
        ).toBe('Analyst');
        expect(ownRoleView(views, { role: 'editor' })?.label).toBe('Editor');
        // A member with no custom role holds no view: nothing is marked as
        // theirs, though the library still opens on viewer.
        expect(ownRoleView(views, { role: 'member' })).toBeNull();
        expect(ownRoleView(views, undefined)).toBeNull();
        expect(defaultRoleView(views, { role: 'member' }).label).toBe('Viewer');
    });

    it('shows no custom roles on an org without any', () => {
        expect(buildRoleViews(undefined).every((view) => !view.custom)).toBe(
            true,
        );
    });
});
