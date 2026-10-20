import { type DepartmentWithMetrics } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { deepOrganization } from '../map/organizationFixtures';
import { dept, metricsFixture, withServerHeadcounts } from './adoptionFixtures';
import {
    getCoverageRows,
    getDepartmentBreakdown,
    getDirectRow,
    getOrganizationBreakdown,
    getPeopleBreakdown,
    type PeopleBreakdown,
} from './peopleBreakdown';

// Each part's count by the kind of dot it is drawn with
const parts = (breakdown: PeopleBreakdown) =>
    Object.fromEntries(breakdown.map(({ kind, count }) => [kind, count]));

const d = (
    name: string,
    parent: string | null,
    headcount: number | null,
    members: number,
    active: number,
    directMembers: number = members,
    directActive: number = active,
): DepartmentWithMetrics =>
    dept(name, parent, null, {
        headcount,
        // Never below the people on Lightdash, as the server gives it
        effectiveHeadcount: Math.max(headcount ?? 0, members),
        hasHeadcount: headcount !== null,
        metrics: metricsFixture(members, null, { activeCount30d: active }),
        directMetrics: metricsFixture(directMembers, null, {
            activeCount30d: directActive,
        }),
    });

describe('getPeopleBreakdown', () => {
    const finance = metricsFixture(187, null, {
        activeCount30d: 115,
        activitySplit: { healthy: 115, atRisk: 40, lost: 32 },
        roleSplit: {
            viewers: 150,
            interactiveViewers: 20,
            editors: 15,
            admins: 2,
        },
    });
    it('splits the headcount into healthy, at risk, lost and no account when colouring by activity', () => {
        expect(getPeopleBreakdown(finance, 420, 'activity')).toEqual([
            { kind: 'healthy', count: 115 },
            { kind: 'atRisk', count: 40 },
            { kind: 'lost', count: 32 },
            { kind: 'noAccount', count: 233 },
        ]);
    });
    it('splits the people on Lightdash by role when colouring by role, the people without an account last', () => {
        expect(parts(getPeopleBreakdown(finance, 420, 'role'))).toEqual({
            admin: 2,
            editor: 15,
            interactiveViewer: 20,
            viewer: 150,
            noAccount: 233,
        });
    });
    it('never counts a negative number without an account when the headcount is below the people on Lightdash', () => {
        // The server floors the headcount at the people on Lightdash, so this cannot arrive; it still reads 0
        expect(
            parts(
                getPeopleBreakdown(
                    metricsFixture(9, null, { activeCount30d: 9 }),
                    8,
                    'activity',
                ),
            ),
        ).toEqual({ healthy: 9, atRisk: 0, lost: 0, noAccount: 0 });
    });
    it('is all zeros for nobody on Lightdash and no headcount', () => {
        expect(
            parts(getPeopleBreakdown(metricsFixture(0, null), 0, 'activity')),
        ).toEqual({ healthy: 0, atRisk: 0, lost: 0, noAccount: 0 });
    });
});

describe('getDepartmentBreakdown', () => {
    it("reads the department's rolled-up people over its effective headcount", () => {
        expect(
            parts(
                getDepartmentBreakdown(
                    d('Ops', null, 40, 13, 3, 4, 1),
                    'activity',
                ),
            ),
        ).toEqual({ healthy: 3, atRisk: 0, lost: 10, noAccount: 27 });
    });
});

describe('getDirectRow', () => {
    // Ops and its sub-departments as the server sends them, with what is entered on Ops and who is directly in it
    const ops = (
        headcount: number | null,
        directMembers: number,
        directActive: number,
        childHeadcounts: [number | null, number | null] = [20, 10],
    ) => {
        const [parent, ...children] = withServerHeadcounts([
            d(
                'Ops',
                null,
                headcount,
                9 + directMembers,
                2 + directActive,
                directMembers,
                directActive,
            ),
            d('Stores', 'Ops', childHeadcounts[0], 6, 2),
            d('Depots', 'Ops', childHeadcounts[1], 3, 0),
        ]);
        return getDirectRow(parent, children, 'activity');
    };

    it('counts the people directly in a department over what it keeps for them beside its sub-departments', () => {
        // Ops's 40 leaves 10 over Stores and Depots, for its 4 people, 1 of them active
        const row = ops(40, 4, 1);
        expect(row?.memberCount).toBe(4);
        expect(row && parts(row.breakdown)).toEqual({
            healthy: 1,
            atRisk: 0,
            lost: 3,
            noAccount: 6,
        });
        expect(row?.reading).toEqual({ kind: 'coverage', pct: 40 });
    });
    it('keeps the people directly in a department whose headcount its sub-departments take up', () => {
        // The 30 entered is all Stores and Depots, so Ops counts 32 and keeps 2 for its own 2 people
        const row = ops(30, 2, 0);
        expect(row?.memberCount).toBe(2);
        expect(row && parts(row.breakdown)).toEqual({
            healthy: 0,
            atRisk: 0,
            lost: 2,
            noAccount: 0,
        });
        expect(row?.reading).toEqual({ kind: 'coverage', pct: 100 });
    });
    it('reads as the other rows without a headcount when none is entered anywhere in the department', () => {
        const row = ops(null, 4, 1, [null, null]);
        expect(row && parts(row.breakdown)).toEqual({
            healthy: 1,
            atRisk: 0,
            lost: 3,
            noAccount: 0,
        });
        expect(row?.reading).toEqual({ kind: 'noHeadcount' });
    });
    it('gives no row without sub-departments, or where nothing is kept for the people directly in it', () => {
        expect(
            getDirectRow(d('Finance', null, 8, 3, 2), [], 'activity'),
        ).toBeNull();
        expect(ops(30, 0, 0)).toBeNull();
    });
});

describe('getOrganizationBreakdown', () => {
    it('adds up the top-level departments only, whose numbers already hold their sub-departments', () => {
        expect(
            parts(
                getOrganizationBreakdown(
                    withServerHeadcounts([
                        d('Ops', null, 30, 9, 4, 0, 0),
                        d('Stores', 'Ops', 20, 6, 4),
                        d('Depots', 'Ops', 10, 3, 0),
                        d('Finance', null, 8, 3, 2),
                    ]),
                    'activity',
                ),
            ),
        ).toEqual({ healthy: 6, atRisk: 0, lost: 6, noAccount: 26 });
    });
    it('counts headcount entered on a department beyond its sub-departments as without an account', () => {
        expect(
            parts(
                getOrganizationBreakdown(
                    withServerHeadcounts([
                        d('Ops', null, 40, 9, 4, 2, 1),
                        d('Stores', 'Ops', 20, 5, 2),
                        d('Depots', 'Ops', 10, 2, 1),
                    ]),
                    'role',
                ),
            ).noAccount,
        ).toBe(31);
    });
    it('counts a department whose parent is gone at the top level, as the map draws it', () => {
        expect(
            parts(
                getOrganizationBreakdown(
                    [
                        d('Orphan', 'Deleted', 10, 4, 1),
                        d('Finance', null, 8, 3, 2),
                    ],
                    'activity',
                ),
            ),
        ).toEqual({ healthy: 3, atRisk: 0, lost: 4, noAccount: 11 });
    });
    it('gives the people placed in the 6,000-headcount organization', () => {
        const breakdown = getOrganizationBreakdown(
            deepOrganization,
            'activity',
        );
        expect(parts(breakdown)).toEqual({
            healthy: 1076,
            atRisk: 256,
            lost: 431,
            noAccount: 3824,
        });
        // 1,763 placed of 5,587 effective headcount
        expect(breakdown.reduce((sum, part) => sum + part.count, 0)).toBe(5587);
    });
    it('is all zeros without departments, in the order the legend lists the parts', () => {
        expect(getOrganizationBreakdown([], 'activity')).toEqual([
            { kind: 'healthy', count: 0 },
            { kind: 'atRisk', count: 0 },
            { kind: 'lost', count: 0 },
            { kind: 'noAccount', count: 0 },
        ]);
        expect(
            getOrganizationBreakdown([], 'role').map((part) => part.kind),
        ).toEqual([
            'admin',
            'editor',
            'interactiveViewer',
            'viewer',
            'noAccount',
        ]);
    });
});

describe('getCoverageRows', () => {
    const names = (rows: DepartmentWithMetrics[]) =>
        getCoverageRows(rows, 'activity').map((row) => row.department.name);

    it('puts the lowest coverage first, and a department asking for a headcount with the zeros', () => {
        const departments = [
            d('Data', null, 9, 1, 1),
            d('Product', null, null, 3, 3),
            d('Finance', null, 32, 0, 0),
            d('Operations', null, 40, 1, 0),
            d('Legal', null, 0, 0, 0),
        ];
        expect(names(departments)).toEqual([
            // 0 of 32, then Product's 3 people asking for a headcount, then 0 of 0
            'Finance',
            'Product',
            'Legal',
            // 1 of 40, then 1 of 9
            'Operations',
            'Data',
        ]);
    });
    it('leads with the largest department among equal coverage, then goes by name', () => {
        expect(
            names([
                d('Beta', null, 10, 0, 0),
                d('Alpha', null, 10, 0, 0),
                d('Huge', null, 80, 0, 0),
            ]),
        ).toEqual(['Huge', 'Alpha', 'Beta']);
    });
    it('sorts by the exact share, so the lower one leads even when both read the same', () => {
        // 33.0% and 33.3% both read 33%; the larger department does not jump ahead
        expect(
            names([
                d('Larger', null, 300, 100, 0),
                d('Smaller', null, 100, 33, 0),
            ]),
        ).toEqual(['Smaller', 'Larger']);
    });
    it('asks for a headcount wherever none is entered on a department or below it, sub-departments or not', () => {
        const departments = withServerHeadcounts([
            d('Hub', null, null, 6, 2, 0, 0),
            d('Team', 'Hub', null, 6, 2),
            d('Group', null, null, 4, 1, 0, 0),
            d('Squad', 'Group', 10, 4, 1),
            d('Product', null, null, 3, 3),
            d('Data', null, 9, 1, 1),
        ]);
        const rows = getCoverageRows(
            departments.filter(
                (department) => department.parentDepartmentUuid === null,
            ),
            'activity',
        );
        expect(rows.map((row) => [row.department.name, row.reading])).toEqual([
            // Hub and Product would read 100% from their own people
            ['Hub', { kind: 'noHeadcount' }],
            ['Product', { kind: 'noHeadcount' }],
            ['Data', { kind: 'coverage', pct: 11 }],
            // Group's headcount comes from Squad, entered below it
            ['Group', { kind: 'coverage', pct: 40 }],
        ]);
    });
    it("gives each row its department's breakdown and rounded coverage", () => {
        const [row] = getCoverageRows(
            [d('Finance', null, 420, 187, 115)],
            'activity',
        );
        expect(parts(row.breakdown)).toEqual({
            healthy: 115,
            atRisk: 0,
            lost: 72,
            noAccount: 233,
        });
        expect(row.reading).toEqual({ kind: 'coverage', pct: 45 });
    });
    it('says nobody is counted where the effective headcount is 0, and still asks a department without one for a headcount', () => {
        const departments = withServerHeadcounts([
            d('Empty', null, 0, 0, 0),
            d('Hub', null, 0, 0, 0),
            d('Team', 'Hub', 0, 0, 0),
            d('Unsized', null, null, 0, 0),
        ]);
        const rows = getCoverageRows(
            departments.filter(
                (department) => department.parentDepartmentUuid === null,
            ),
            'activity',
        );
        expect(
            Object.fromEntries(
                rows.map((row) => [row.department.name, row.reading.kind]),
            ),
        ).toEqual({ Empty: 'nobody', Hub: 'nobody', Unsized: 'noHeadcount' });
    });
    it('orders the top level of the 6,000-headcount organization lowest coverage first', () => {
        const topLevel = deepOrganization.filter(
            (department) => department.parentDepartmentUuid === null,
        );
        expect(
            getCoverageRows(topLevel, 'activity').map((row) => [
                row.department.name,
                row.reading.kind === 'coverage' ? row.reading.pct : null,
            ]),
        ).toEqual([
            ['Legal & Compliance', 0],
            ['Operations', 9],
            ['Commercial', 44],
            ['Finance', 45],
            // 61 of the 125 its sub-departments add up to, above its own 120
            ['People', 49],
            ['Product & Engineering', 59],
            ['Executive Office', 67],
            ['Data & Analytics', 96],
        ]);
    });
});
