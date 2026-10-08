import { type DepartmentWithMetrics } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { deepOrganization } from '../map/organizationFixtures';
import { dept, metricsFixture } from './adoptionFixtures';
import {
    getCoverageRows,
    getDepartmentBreakdown,
    getDirectRow,
    getOrganizationBreakdown,
    getPeopleBreakdown,
} from './peopleBreakdown';

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
    it('splits the headcount into active, on Lightdash but not active, and no account', () => {
        expect(
            getPeopleBreakdown({ memberCount: 187, activeCount30d: 115 }, 420),
        ).toEqual({ active: 115, onLightdashNotActive: 72, noAccount: 233 });
    });
    it('never counts a negative number without an account when the headcount is below the people on Lightdash', () => {
        // The server floors the headcount at the people on Lightdash, so this cannot arrive; it still reads 0
        expect(
            getPeopleBreakdown({ memberCount: 9, activeCount30d: 9 }, 8),
        ).toEqual({ active: 9, onLightdashNotActive: 0, noAccount: 0 });
    });
    it('is all zeros for nobody on Lightdash and no headcount', () => {
        expect(
            getPeopleBreakdown({ memberCount: 0, activeCount30d: 0 }, 0),
        ).toEqual({ active: 0, onLightdashNotActive: 0, noAccount: 0 });
    });
});

describe('getDepartmentBreakdown', () => {
    it("reads the department's rolled-up people over its effective headcount", () => {
        expect(getDepartmentBreakdown(d('Ops', null, 40, 13, 3, 4, 1))).toEqual(
            { active: 3, onLightdashNotActive: 10, noAccount: 27 },
        );
    });
});

describe('getDirectRow', () => {
    const stores = d('Stores', 'Ops', 20, 6, 2);
    const depots = d('Depots', 'Ops', 10, 3, 0);

    it('counts the people directly in a department over what it keeps for them beside its sub-departments', () => {
        // Ops's 40 leaves 10 over Stores and Depots, for its 4 people, 1 of them active
        expect(
            getDirectRow(d('Ops', null, 40, 13, 3, 4, 1), [stores, depots]),
        ).toEqual({
            memberCount: 4,
            breakdown: { active: 1, onLightdashNotActive: 3, noAccount: 6 },
            coveragePct: 40,
        });
    });
    it('keeps at least the people directly in a department', () => {
        expect(
            getDirectRow(d('Ops', null, 30, 11, 2, 2, 0), [stores, depots]),
        ).toEqual({
            memberCount: 2,
            breakdown: { active: 0, onLightdashNotActive: 2, noAccount: 0 },
            coveragePct: 100,
        });
    });
    it('gives no row without sub-departments, or where nothing is kept for the people directly in it', () => {
        expect(getDirectRow(d('Finance', null, 8, 3, 2), [])).toBeNull();
        expect(
            getDirectRow(d('Ops', null, 30, 9, 2, 0, 0), [stores, depots]),
        ).toBeNull();
    });
});

describe('getOrganizationBreakdown', () => {
    it('adds up the top-level departments only, whose numbers already hold their sub-departments', () => {
        expect(
            getOrganizationBreakdown([
                d('Ops', null, 30, 9, 4, 0, 0),
                d('Stores', 'Ops', 20, 6, 4),
                d('Depots', 'Ops', 10, 3, 0),
                d('Finance', null, 8, 3, 2),
            ]),
        ).toEqual({ active: 6, onLightdashNotActive: 6, noAccount: 26 });
    });
    it('counts headcount entered on a department beyond its sub-departments as without an account', () => {
        expect(
            getOrganizationBreakdown([
                d('Ops', null, 40, 9, 4, 2, 1),
                d('Stores', 'Ops', 20, 5, 2),
                d('Depots', 'Ops', 10, 2, 1),
            ]).noAccount,
        ).toBe(31);
    });
    it('counts a department whose parent is gone at the top level, as the map draws it', () => {
        expect(
            getOrganizationBreakdown([
                d('Orphan', 'Deleted', 10, 4, 1),
                d('Finance', null, 8, 3, 2),
            ]),
        ).toEqual({ active: 3, onLightdashNotActive: 4, noAccount: 11 });
    });
    it('gives the people placed in the 6,000-headcount organization', () => {
        const breakdown = getOrganizationBreakdown(deepOrganization);
        expect(breakdown).toEqual({
            active: 1076,
            onLightdashNotActive: 687,
            noAccount: 3824,
        });
        // 1,763 placed of 5,587 effective headcount
        expect(
            breakdown.active +
                breakdown.onLightdashNotActive +
                breakdown.noAccount,
        ).toBe(5587);
    });
    it('is all zeros without departments', () => {
        expect(getOrganizationBreakdown([])).toEqual({
            active: 0,
            onLightdashNotActive: 0,
            noAccount: 0,
        });
    });
});

describe('getCoverageRows', () => {
    const names = (
        rows: DepartmentWithMetrics[],
        departments: DepartmentWithMetrics[] = rows,
    ) => getCoverageRows(rows, departments).map((row) => row.department.name);

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
    it('asks for a headcount only for a department with neither a headcount nor sub-departments', () => {
        const departments = [
            d('Hub', null, null, 6, 2),
            d('Team', 'Hub', null, 6, 2),
            d('Product', null, null, 3, 3),
            d('Data', null, 9, 1, 1),
        ];
        const rows = getCoverageRows(
            departments.filter(
                (department) => department.parentDepartmentUuid === null,
            ),
            departments,
        );
        expect(rows.map((row) => [row.department.name, row.reading])).toEqual([
            ['Product', { kind: 'noHeadcount' }],
            ['Data', { kind: 'coverage', pct: 11 }],
            // A parent without a headcount counts its people, so it reads 100%
            ['Hub', { kind: 'coverage', pct: 100 }],
        ]);
    });
    it("gives each row its department's breakdown and rounded coverage", () => {
        const [row] = getCoverageRows(
            [d('Finance', null, 420, 187, 115)],
            [d('Finance', null, 420, 187, 115)],
        );
        expect(row.breakdown).toEqual({
            active: 115,
            onLightdashNotActive: 72,
            noAccount: 233,
        });
        expect(row.reading).toEqual({ kind: 'coverage', pct: 45 });
    });
    it('says nobody is counted where the effective headcount is 0, and still asks a department without one for a headcount', () => {
        const departments = [
            d('Empty', null, 0, 0, 0),
            d('Hub', null, 0, 0, 0),
            d('Team', 'Hub', 0, 0, 0),
            d('Unsized', null, null, 0, 0),
        ];
        const rows = getCoverageRows(
            departments.filter(
                (department) => department.parentDepartmentUuid === null,
            ),
            departments,
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
            getCoverageRows(topLevel, deepOrganization).map((row) => [
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
