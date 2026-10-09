import { describe, expect, it } from 'vitest';
import {
    dept,
    memberFixture,
    metricsFixture,
    withServerHeadcounts,
} from '../utils/adoptionFixtures';
import {
    getDepartmentBreakdown,
    getOrganizationBreakdown,
} from '../utils/peopleBreakdown';
import {
    buildPackInput,
    countPeople,
    layoutPack,
    SVG_DOT_LIMIT,
    type DotKind,
} from './geometry';
import { fitToArea } from './mapLayout';
import { LEGEND_KINDS } from './mapStyles';
import {
    buildDots,
    buildMapAriaLabel,
    countDotKinds,
    describeCircles,
    formatMemberActivity,
    formatPct,
    getFocusTrail,
    getLegendCounts,
    getRingKeys,
    getViewTotals,
    getVisibleDepartments,
    groupMembersByDepartment,
    PEOPLE_LOAD_LIMIT,
    nameLoneBucket,
    shouldLoadPeople,
    shouldListPeople,
} from './mapView';
import { deepOrganization, flatOrganization } from './organizationFixtures';

const NOW = new Date('2026-10-07T12:00:00Z');
const RECENT = '2026-10-01T12:00:00Z';

const d = (
    name: string,
    parent: string | null,
    headcount: number | null,
    members: number,
    active: number,
    directMembers: number = members,
) =>
    dept(name, parent, null, {
        headcount,
        effectiveHeadcount: Math.max(headcount ?? 0, members),
        hasHeadcount: headcount !== null,
        metrics: metricsFixture(members, null, {
            activeCount30d: active,
            activeCount12w: active,
        }),
        directMetrics: metricsFixture(directMembers, null, {
            activeCount30d: directMembers === members ? active : 0,
            activeCount12w: directMembers === members ? active : 0,
        }),
    });

const tree = withServerHeadcounts([
    d('Ops', null, 30, 9, 4, 0),
    d('Stores', 'Ops', 20, 6, 4),
    d('Depots', 'Ops', 10, 3, 0),
    d('Finance', null, 8, 3, 2),
    d('Product', null, null, 5, 5),
    d('Supply', null, 40, 0, 0),
]);
const byUuid = new Map(tree.map((each) => [each.departmentUuid, each]));
const layout = (focus: string | null, departments = tree) =>
    layoutPack(buildPackInput(departments, focus));

describe('getVisibleDepartments', () => {
    it('returns the top level when nothing is focused', () => {
        expect(
            getVisibleDepartments(tree, null).map((each) => each.name),
        ).toEqual(['Ops', 'Finance', 'Product', 'Supply']);
    });
    it('returns only the children of the focused department', () => {
        expect(
            getVisibleDepartments(tree, 'Ops').map((each) => each.name),
        ).toEqual(['Stores', 'Depots']);
    });
    it('returns nothing below a department without sub-departments', () => {
        expect(getVisibleDepartments(tree, 'Finance')).toEqual([]);
    });
    it('never returns a parent alongside its own children', () => {
        const names = getVisibleDepartments(tree, null).map(
            (each) => each.name,
        );
        expect(names).not.toContain('Stores');
    });
});

describe('getFocusTrail', () => {
    it('is empty at the top', () => {
        expect(getFocusTrail(tree, null)).toEqual([]);
    });
    it('lists ancestors from the top down, ending at the focus', () => {
        expect(getFocusTrail(tree, 'Stores').map((each) => each.name)).toEqual([
            'Ops',
            'Stores',
        ]);
    });
    it('is empty for a department that no longer exists', () => {
        expect(getFocusTrail(tree, 'Gone')).toEqual([]);
    });
});

describe('countDotKinds', () => {
    it.each(['activity', 'role'] as const)(
        'adds up to the people in view when colouring by %s',
        (colourBy) => {
            const circles = layout(null);
            const counts = countDotKinds(circles, colourBy, null);
            const total = LEGEND_KINDS[colourBy].reduce(
                (sum, kind) => sum + (counts.get(kind) ?? 0),
                0,
            );
            expect(total).toBe(countPeople(circles));
            // 30 + 8 + 5 members with no headcount + 40
            expect(total).toBe(83);
        },
    );
    it('counts healthy, at risk, lost and no account from the summary', () => {
        const counts = countDotKinds(layout(null), 'activity', null);
        expect(Object.fromEntries(counts)).toEqual({
            healthy: 11,
            atRisk: 0,
            lost: 6,
            noAccount: 66,
        });
    });
    it("counts named people by the server's bucket for them once they are loaded", () => {
        const members = groupMembersByDepartment([
            memberFixture('a', RECENT, {
                departmentUuid: 'Finance',
                isActive30d: true,
            }),
            memberFixture('b', RECENT, { departmentUuid: 'Finance' }),
            memberFixture('c', null, { departmentUuid: 'Finance' }),
        ]);
        const circles = layout('Finance');
        expect(
            Object.fromEntries(countDotKinds(circles, 'activity', members)),
        ).toEqual({ healthy: 1, atRisk: 1, lost: 1, noAccount: 5 });
    });
});

describe('getLegendCounts', () => {
    // Ops is 40: Stores 20, Depots 10, and 10 directly in Ops, of whom 2 are on Lightdash
    const parent = withServerHeadcounts([
        d('Ops', null, 40, 9, 4, 2),
        d('Stores', 'Ops', 20, 5, 3),
        d('Depots', 'Ops', 10, 2, 1),
    ]);

    it("reads the panel's numbers, and the dots drawn match them", () => {
        const circles = layout(null, parent);
        const breakdown = getOrganizationBreakdown(parent, 'activity');
        const counts = getLegendCounts(breakdown);
        expect(Object.fromEntries(counts)).toEqual({
            healthy: 4,
            atRisk: 0,
            lost: 5,
            noAccount: 31,
        });
        // Stores 15, Depots 8, and the 10 Ops keeps for its own people less the 2 on Lightdash
        expect(countDotKinds(circles, 'activity', null)).toEqual(counts);
        expect(counts.get('noAccount')).toBe(15 + 8 + 8);
    });
    it.each([
        ['6,000-headcount', deepOrganization],
        ['enterprise-shaped', flatOrganization],
    ])(
        'matches the dots drawn, bucket by bucket and role by role, at every level of the %s organization',
        (_, departments) => {
            const byId = new Map(
                departments.map((each) => [each.departmentUuid, each]),
            );
            (['activity', 'role'] as const).forEach((colourBy) =>
                [
                    null,
                    ...departments.map((each) => each.departmentUuid),
                ].forEach((focus) => {
                    const focused = focus === null ? null : byId.get(focus);
                    const circles = layout(focus, departments);
                    const legend = getLegendCounts(
                        focused
                            ? getDepartmentBreakdown(focused, colourBy)
                            : getOrganizationBreakdown(departments, colourBy),
                    );
                    const dots = countDotKinds(circles, colourBy, null);
                    expect({
                        colourBy,
                        focus,
                        counts: LEGEND_KINDS[colourBy].map(
                            (kind) => legend.get(kind) ?? 0,
                        ),
                    }).toEqual({
                        colourBy,
                        focus,
                        counts: LEGEND_KINDS[colourBy].map(
                            (kind) => dots.get(kind) ?? 0,
                        ),
                    });
                }),
            );
            // Every bucket is drawn somewhere in the organization
            const top = getOrganizationBreakdown(departments, 'activity');
            top.forEach((part) => expect(part.count).toBeGreaterThan(0));
        },
    );
    it('reads the same as the dots wherever the headcount is all in sub-departments', () => {
        const circles = layout(null);
        const counts = getLegendCounts(
            getOrganizationBreakdown(tree, 'activity'),
        );
        const dots = countDotKinds(circles, 'activity', null);
        LEGEND_KINDS.activity.forEach((kind) =>
            expect(counts.get(kind)).toBe(dots.get(kind)),
        );
    });
    it("counts roles from the panel's numbers when colouring by role", () => {
        const breakdown = getDepartmentBreakdown(parent[0], 'role');
        expect(Object.fromEntries(getLegendCounts(breakdown))).toEqual({
            admin: 0,
            editor: 0,
            interactiveViewer: 0,
            viewer: 9,
            noAccount: 31,
        });
    });
    it("reads the panel's numbers even where the people loaded for the dots differ from them", () => {
        const finance = byUuid.get('Finance');
        expect(finance).toBeDefined();
        if (!finance) return;
        // Finance's summary: 3 on Lightdash, 2 active, headcount 8
        expect(
            Object.fromEntries(
                getLegendCounts(getDepartmentBreakdown(finance, 'activity')),
            ),
        ).toEqual({ healthy: 2, atRisk: 0, lost: 1, noAccount: 5 });
    });
});

describe('getRingKeys', () => {
    // Ops keeps 10 beyond Stores and Depots with nobody of its own in it
    const ops = withServerHeadcounts([
        d('Ops', null, 40, 9, 4, 0),
        d('Stores', 'Ops', 20, 6, 4),
        d('Depots', 'Ops', 10, 3, 0),
    ]);
    it('keys an empty "Directly in" circle drawn at the top of the view, as it is drawn dashed', () => {
        expect(getRingKeys(layout('Ops', ops)).hasEmpty).toBe(true);
    });
    it('leaves out a "Directly in" circle drawn inside another, which is a plain ring', () => {
        expect(getRingKeys(layout(null, ops)).hasEmpty).toBe(false);
    });
    it('keys the circles without a headcount, a lone department opened on its own included', () => {
        const product = withServerHeadcounts([d('Product', null, null, 5, 5)]);
        expect(getRingKeys(layout('Product', product))).toEqual({
            hasEmpty: false,
            hasNoHeadcount: true,
        });
    });
});

describe('buildDots', () => {
    it('draws one dot per person, inside the circle', () => {
        const [circle] = layout('Finance');
        const dots = buildDots(circle, 'activity', null);
        expect(dots).toHaveLength(8);
        dots.forEach((dot) => {
            const distance = Math.hypot(dot.x - circle.x, dot.y - circle.y);
            expect(distance + dot.r).toBeLessThanOrEqual(circle.r);
        });
    });
    it('attaches loaded people to the account dots, healthy first', () => {
        const members = groupMembersByDepartment([
            memberFixture('idle', null, { departmentUuid: 'Finance' }),
            memberFixture('busy', RECENT, {
                departmentUuid: 'Finance',
                isActive30d: true,
            }),
        ]);
        const [circle] = layout('Finance');
        const dots = buildDots(circle, 'activity', members);
        expect(dots.map((dot) => dot.member?.userUuid ?? null)).toEqual([
            'busy',
            'idle',
            null,
            null,
            null,
            null,
            null,
            null,
        ]);
        expect(dots.map((dot): DotKind => dot.kind).slice(0, 3)).toEqual([
            'healthy',
            'lost',
            'noAccount',
        ]);
    });
    it('draws nothing for a circle that only holds sub-departments', () => {
        const ops = layout(null).find((circle) => circle.id === 'Ops');
        expect(ops && buildDots(ops, 'activity', null)).toEqual([]);
    });
});

describe('dot and name thresholds', () => {
    it('lists people by name for the keyboard only at 150 people or fewer, once people are loaded', () => {
        expect(PEOPLE_LOAD_LIMIT).toBe(150);
        expect(shouldListPeople(150, true)).toBe(true);
        expect(shouldListPeople(151, true)).toBe(false);
        expect(shouldListPeople(20, false)).toBe(false);
    });
    it('loads people only where their names can be drawn', () => {
        expect(shouldLoadPeople(150)).toBe(true);
        expect(shouldLoadPeople(151)).toBe(false);
    });
    it('draws dots for up to 20,000 people in view', () => {
        expect(SVG_DOT_LIMIT).toBe(20000);
    });
});

describe('describeCircles', () => {
    const info = describeCircles(layout(null), byUuid);
    it('names a department with its numbers', () => {
        expect(info.get('Finance')?.description).toBe(
            'Finance, 3 of 8 on Lightdash, 2 active in the last 30 days',
        );
    });
    it('uses rolled-up numbers and counts sub-departments for a parent', () => {
        expect(info.get('Ops')?.description).toBe(
            'Ops, 9 of 30 on Lightdash, 4 active in the last 30 days, 2 sub-departments',
        );
    });
    it('says when nobody is on Lightdash', () => {
        expect(info.get('Supply')?.description).toBe(
            'Supply, 40 people, nobody on Lightdash yet',
        );
    });
    it('says when there is no headcount', () => {
        expect(info.get('Product')?.description).toBe(
            'Product, 5 on Lightdash, 5 active in the last 30 days, no headcount set',
        );
    });
    it('says when a circle is not to scale', () => {
        const lopsided = [
            d('Huge', null, 4000, 10, 5),
            d('Tiny', null, 1, 1, 1),
        ];
        const circles = fitToArea(buildPackInput(lopsided, null), {
            width: 760,
            height: 560,
        });
        const described = describeCircles(
            circles,
            new Map(lopsided.map((each) => [each.departmentUuid, each])),
        );
        expect(
            circles.find((circle) => circle.id === 'Tiny')?.isAreaHonest,
        ).toBe(false);
        expect(described.get('Tiny')?.description).toMatch(/, not to scale$/);
        expect(described.get('Huge')?.description).not.toMatch(/not to scale/);
    });
    describe("a circle drawn from a department's own people", () => {
        const data = withServerHeadcounts([
            d('Data', null, 110, 191, 85, 84),
            d('Analytics', 'Data', 64, 63, 29),
            d('Engineering', 'Data', 34, 33, 10),
            d('Science', 'Data', 12, 11, 3),
            d('Governance', null, 8, 9, 9),
            d('Product', null, null, 5, 5),
        ]);
        const describeView = (focus: string | null) =>
            describeCircles(
                nameLoneBucket(layout(focus, data), focus),
                new Map(data.map((each) => [each.departmentUuid, each])),
            );

        it("gives a department without sub-departments its department's headcount, never below its people", () => {
            // A headcount of 8 for 9 people on Lightdash counts 9
            const info = describeView('Governance');
            expect(info.get('own:Governance')?.stats.headcount).toBe(9);
            expect(info.get('own:Governance')?.description).toBe(
                'Governance, 9 of 9 on Lightdash, 9 active in the last 30 days',
            );
        });
        it('counts the people directly in a department over the headcount it keeps for them', () => {
            // Data counts 194, its 191 people and its sub-departments' 3 without an account: 84 over their 110
            [describeView('Data'), describeView(null)].forEach((info) => {
                expect(info.get('own:Data')?.stats).toEqual({
                    people: 84,
                    members: 84,
                    active: 0,
                    headcount: 84,
                    isDirect: true,
                });
                expect(info.get('own:Data')?.description).toBe(
                    'Directly in Data, 84 of 84 on Lightdash, 0 active in the last 30 days',
                );
            });
        });
        it('describes headcount kept for the people directly in a department when nobody is in it yet', () => {
            const ops = withServerHeadcounts([
                d('Ops', null, 40, 6, 0, 0),
                d('Stores', 'Ops', 20, 4, 0),
                d('Depots', 'Ops', 10, 2, 0),
            ]);
            const info = describeCircles(
                layout('Ops', ops),
                new Map(ops.map((each) => [each.departmentUuid, each])),
            );
            expect(info.get('own:Ops')?.description).toBe(
                'Directly in Ops, 10 people, nobody on Lightdash yet',
            );
        });
        it('says there is no headcount when the department has none', () => {
            expect(
                describeView('Product').get('own:Product')?.description,
            ).toBe(
                'Product, 5 on Lightdash, 5 active in the last 30 days, no headcount set',
            );
        });
    });
});

describe('buildMapAriaLabel', () => {
    it('summarises the organization in words, naming the parts the dots are coloured by', () => {
        const circles = layout(null);
        const describe = (colourBy: 'activity' | 'role') =>
            buildMapAriaLabel({
                scopeName: null,
                departmentCount: 4,
                totals: getViewTotals(circles),
                areDotsHidden: false,
                colourBy,
                breakdown: getOrganizationBreakdown(tree, colourBy),
                hasHeadcount: true,
            });
        expect(describe('activity')).toBe(
            'Map of the organization: 4 departments, 83 people, 17 on Lightdash placed in a department, 11 active in the last 30 days. Each circle is a department sized by headcount and each dot is a person, coloured by activity: 11 healthy, 0 at risk, 6 lost, 66 with no account. The List view has the same numbers as a table',
        );
        expect(describe('role')).toContain(
            'each dot is a person, coloured by role: 0 admins, 0 editors, 0 interactive viewers, 17 viewers, 66 with no account.',
        );
    });
    it('names the focused department and its sub-departments', () => {
        expect(
            buildMapAriaLabel({
                scopeName: 'Ops',
                departmentCount: 2,
                totals: getViewTotals(layout('Ops')),
                areDotsHidden: false,
                colourBy: 'activity',
                breakdown: [],
                hasHeadcount: true,
            }),
        ).toMatch(
            /^Map of Ops: 2 sub-departments, 30 people, 9 on Lightdash, 4 active in the last 30 days\./,
        );
    });
    it('uses the singular and leaves out the count for a department with no sub-departments', () => {
        expect(
            buildMapAriaLabel({
                scopeName: null,
                departmentCount: 1,
                totals: { people: 1, members: 1, active: 0 },
                areDotsHidden: false,
                colourBy: 'activity',
                breakdown: [],
                hasHeadcount: true,
            }),
        ).toMatch(/^Map of the organization: 1 department, 1 person, /);
        expect(
            buildMapAriaLabel({
                scopeName: 'Finance',
                departmentCount: 0,
                totals: getViewTotals(layout('Finance')),
                areDotsHidden: false,
                colourBy: 'activity',
                breakdown: [],
                hasHeadcount: true,
            }),
        ).toMatch(/^Map of Finance: 8 people, 3 on Lightdash, /);
    });
    it('says no headcount is set, rather than nobody without an account, where none is entered in view', () => {
        const product = withServerHeadcounts([d('Product', null, null, 5, 5)]);
        const label = buildMapAriaLabel({
            scopeName: null,
            departmentCount: 1,
            totals: getViewTotals(layout(null, product)),
            areDotsHidden: false,
            colourBy: 'activity',
            breakdown: getOrganizationBreakdown(product, 'activity'),
            hasHeadcount: false,
        });
        expect(label).toContain(
            'coloured by activity: 5 healthy, 0 at risk, 0 lost, no headcount set.',
        );
        expect(label).not.toContain('with no account');
    });
    it('says when dots are hidden', () => {
        expect(
            buildMapAriaLabel({
                scopeName: null,
                departmentCount: 1,
                totals: { people: 6000, members: 10, active: 5 },
                areDotsHidden: true,
                colourBy: 'activity',
                breakdown: [],
                hasHeadcount: true,
            }),
        ).toBe(
            'Map of the organization: 1 department, 6,000 people, 10 on Lightdash placed in a department, 5 active in the last 30 days. Each circle is a department sized by headcount. The List view has the same numbers as a table',
        );
    });
});

describe('nameLoneBucket', () => {
    it('gives the single circle of a department without sub-departments its name', () => {
        const circles = nameLoneBucket(layout('Finance'), 'Finance');
        expect(circles.map((circle) => circle.name)).toEqual(['Finance']);
        expect(
            describeCircles(circles, byUuid).get('own:Finance')?.description,
        ).toBe('Finance, 3 of 8 on Lightdash, 2 active in the last 30 days');
    });
    it('leaves other layouts alone', () => {
        const top = layout(null);
        expect(nameLoneBucket(top, null)).toBe(top);
        const ops = layout('Ops');
        expect(nameLoneBucket(ops, 'Ops')).toBe(ops);
    });
});

describe('formatPct', () => {
    it('never shows 0% for a share with people in it', () => {
        expect(formatPct(0, 3)).toBe('<1%');
        expect(formatPct(0, 0)).toBe('0%');
        expect(formatPct(41, 12)).toBe('41%');
        expect(formatPct(null, 12)).toBeNull();
    });
});

describe('formatMemberActivity', () => {
    it('reads as a sentence for recent days and keeps dates as written', () => {
        expect(formatMemberActivity(null, NOW)).toBe('No activity in 90 days');
        expect(formatMemberActivity('2026-10-07T08:00:00Z', NOW)).toBe(
            'Last active today',
        );
        expect(formatMemberActivity('2026-10-06T08:00:00Z', NOW)).toBe(
            'Last active yesterday',
        );
        expect(formatMemberActivity(RECENT, NOW)).toBe(
            'Last active 6 days ago',
        );
        expect(formatMemberActivity('2026-01-05T08:00:00Z', NOW)).toMatch(
            /^Last active \d{1,2} Jan 2026$/,
        );
    });
});
