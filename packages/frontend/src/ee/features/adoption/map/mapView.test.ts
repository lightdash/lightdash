import { type DepartmentWithMetrics } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { dept, memberFixture, metricsFixture } from '../utils/adoptionFixtures';
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
    describeOrganizationOverview,
    formatMemberActivity,
    formatPct,
    getFocusTrail,
    getOrganizationOverview,
    getViewTotals,
    getVisibleDepartments,
    groupMembersByDepartment,
    NAME_LABEL_LIMIT,
    nameLoneBucket,
    shouldLoadPeople,
    shouldShowNames,
    sortForInspector,
} from './mapView';

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
        effectiveHeadcount: headcount,
        metrics: metricsFixture(members, null, {
            activeCount30d: active,
            activeCount12w: active,
        }),
        directMetrics: metricsFixture(directMembers, null, {
            activeCount30d: directMembers === members ? active : 0,
            activeCount12w: directMembers === members ? active : 0,
        }),
    });

const tree = [
    d('Ops', null, 30, 9, 4, 0),
    d('Stores', 'Ops', 20, 6, 4),
    d('Depots', 'Ops', 10, 3, 0),
    d('Finance', null, 8, 3, 2),
    d('Product', null, null, 5, 5),
    d('Supply', null, 40, 0, 0),
];
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
    it.each(['active', 'role', 'lastActive'] as const)(
        'adds up to the people in view when colouring by %s',
        (colourBy) => {
            const circles = layout(null);
            const counts = countDotKinds(circles, colourBy, null, NOW);
            const total = LEGEND_KINDS[colourBy].reduce(
                (sum, kind) => sum + (counts.get(kind) ?? 0),
                0,
            );
            expect(total).toBe(countPeople(circles));
            // 30 + 8 + 5 members with no headcount + 40
            expect(total).toBe(83);
        },
    );
    it('counts active, idle and no account from the summary', () => {
        const counts = countDotKinds(layout(null), 'active', null, NOW);
        expect(counts.get('active')).toBe(11);
        expect(counts.get('idle')).toBe(6);
        expect(counts.get('noAccount')).toBe(66);
    });
    it('counts named people by their own activity once they are loaded', () => {
        const members = groupMembersByDepartment([
            memberFixture('a', RECENT, {
                departmentUuid: 'Finance',
                isActive30d: true,
            }),
            memberFixture('b', null, { departmentUuid: 'Finance' }),
            memberFixture('c', null, { departmentUuid: 'Finance' }),
        ]);
        const circles = layout('Finance');
        const counts = countDotKinds(circles, 'active', members, NOW);
        expect(counts.get('active')).toBe(1);
        expect(counts.get('idle')).toBe(2);
        expect(counts.get('noAccount')).toBe(5);
    });
});

describe('buildDots', () => {
    it('draws one dot per person, inside the circle', () => {
        const [circle] = layout('Finance');
        const dots = buildDots(circle, 'active', null, NOW);
        expect(dots).toHaveLength(8);
        dots.forEach((dot) => {
            const distance = Math.hypot(dot.x - circle.x, dot.y - circle.y);
            expect(distance + dot.r).toBeLessThanOrEqual(circle.r);
        });
    });
    it('attaches loaded people to the account dots, most active first', () => {
        const members = groupMembersByDepartment([
            memberFixture('idle', null, { departmentUuid: 'Finance' }),
            memberFixture('busy', RECENT, {
                departmentUuid: 'Finance',
                isActive30d: true,
            }),
        ]);
        const [circle] = layout('Finance');
        const dots = buildDots(circle, 'active', members, NOW);
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
            'active',
            'idle',
            'noAccount',
        ]);
    });
    it('draws nothing for a circle that only holds sub-departments', () => {
        const ops = layout(null).find((circle) => circle.id === 'Ops');
        expect(ops && buildDots(ops, 'active', null, NOW)).toEqual([]);
    });
});

describe('dot and name thresholds', () => {
    it('shows first names only at 150 people or fewer, once people are loaded', () => {
        expect(NAME_LABEL_LIMIT).toBe(150);
        expect(shouldShowNames(150, true)).toBe(true);
        expect(shouldShowNames(151, true)).toBe(false);
        expect(shouldShowNames(20, false)).toBe(false);
    });
    it('loads people only where their names can be drawn', () => {
        expect(shouldLoadPeople(150)).toBe(true);
        expect(shouldLoadPeople(151)).toBe(false);
    });
    it('keeps the dot limit at 5,000', () => {
        expect(SVG_DOT_LIMIT).toBe(5000);
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
});

describe('getOrganizationOverview', () => {
    const overview = (
        departments: DepartmentWithMetrics[],
        organization = metricsFixture(1951, null, { activeCount30d: 1181 }),
    ) =>
        getOrganizationOverview(
            organization,
            departments,
            getViewTotals(layout(null, departments)),
        );
    // Placed = headcount - without an account + the two remainders the captions name
    const expectLinesAddUp = (departments: DepartmentWithMetrics[]) => {
        const {
            placed,
            headcount,
            withoutAccount,
            aboveHeadcount,
            withoutHeadcount,
        } = overview(departments);
        expect(placed).toBe(
            (headcount ?? 0) -
                withoutAccount +
                aboveHeadcount +
                withoutHeadcount,
        );
    };

    it('repeats the organization numbers from the page header', () => {
        expect(overview(tree)).toMatchObject({
            onLightdash: 1951,
            active30d: 1181,
        });
    });
    it('counts people without an account exactly as the legend does', () => {
        const circles = layout(null, tree);
        const legend = countDotKinds(circles, 'active', null, NOW);
        expect(overview(tree).withoutAccount).toBe(legend.get('noAccount'));
    });
    it('counts the people placed in a department and the headcount without an account', () => {
        // Placed: Ops 9, Finance 3, Product 5. Headcount: Ops 30, Finance 8, Supply 40
        expect(overview(tree)).toEqual({
            onLightdash: 1951,
            active30d: 1181,
            placed: 17,
            withoutAccount: 66,
            headcount: 78,
            aboveHeadcount: 0,
            withoutHeadcount: 5,
        });
        expectLinesAddUp(tree);
    });
    it('carries the accounts above headcount, at any depth, so the lines add up', () => {
        const over = [d('Data', null, 10, 14, 6), d('Finance', null, 8, 3, 2)];
        expect(overview(over)).toMatchObject({
            placed: 17,
            withoutAccount: 5,
            headcount: 18,
            aboveHeadcount: 4,
        });
        // A sub-department over its headcount inside a department under its own
        const crowded = [
            d('Ops', null, 30, 25, 4, 0),
            d('Stores', 'Ops', 20, 25, 4),
            d('Depots', 'Ops', 10, 0, 0),
        ];
        expect(overview(crowded)).toMatchObject({
            placed: 25,
            withoutAccount: 10,
            headcount: 30,
            aboveHeadcount: 5,
        });
        // A headcount entered below the sub-departments' total, and people placed directly in a parent
        const uneven = [
            d('People', null, 120, 61, 36, 0),
            d('Partners', 'People', 40, 18, 10),
            d('Learning', 'People', 20, 9, 6),
            d('Operations', 'People', 30, 15, 9),
            d('Talent', 'People', 35, 19, 11),
            d('Engineering', null, 100, 112, 40, 12),
            d('Platform', 'Engineering', 60, 60, 20),
            d('Apps', 'Engineering', 40, 40, 10),
        ];
        expect(overview(uneven)).toMatchObject({
            placed: 173,
            withoutAccount: 64,
            headcount: 220,
            aboveHeadcount: 17,
        });
        [tree, over, crowded, uneven].forEach(expectLinesAddUp);
    });
    it('counts the people in top-level departments without a headcount on their own', () => {
        const mixed = [
            d('Data', null, 10, 14, 6),
            d('Product', null, null, 5, 5),
        ];
        expect(overview(mixed)).toMatchObject({
            placed: 19,
            withoutAccount: 0,
            headcount: 10,
            aboveHeadcount: 4,
            withoutHeadcount: 5,
        });
        expectLinesAddUp(mixed);
    });
    it('has no headcount when no department has one', () => {
        expect(overview([d('Product', null, null, 5, 5)])).toMatchObject({
            placed: 5,
            withoutAccount: 0,
            headcount: null,
            withoutHeadcount: 5,
        });
    });
});

describe('describeOrganizationOverview', () => {
    const base = {
        onLightdash: 1951,
        active30d: 1181,
        placed: 1763,
        withoutAccount: 3837,
        headcount: 5582,
        aboveHeadcount: 0,
        withoutHeadcount: 0,
    };
    it('says how many are placed and how many in headcount have no account', () => {
        expect(describeOrganizationOverview(base)).toEqual({
            placed: 'Placed in a department: 1,763 of 1,951 on Lightdash',
            withoutAccount: 'Without an account: 3,837 of 5,582 headcount',
            captions: [],
        });
    });
    it('says how many accounts the headcount leaves out', () => {
        expect(
            describeOrganizationOverview({ ...base, aboveHeadcount: 18 })
                .captions,
        ).toEqual(["Excludes 18 accounts above their department's headcount"]);
        expect(
            describeOrganizationOverview({ ...base, aboveHeadcount: 1 })
                .captions,
        ).toEqual(["Excludes 1 account above their department's headcount"]);
    });
    it('names the people in departments without a headcount only when there are some', () => {
        expect(
            describeOrganizationOverview({
                ...base,
                aboveHeadcount: 18,
                withoutHeadcount: 14,
            }).captions,
        ).toEqual([
            "Excludes 18 accounts above their department's headcount",
            '14 people are in departments without a headcount',
        ]);
        expect(
            describeOrganizationOverview({ ...base, withoutHeadcount: 1 })
                .captions,
        ).toEqual(['1 person is in a department without a headcount']);
    });
    it('leaves out the headcount line when nobody has entered a headcount', () => {
        expect(
            describeOrganizationOverview({
                ...base,
                headcount: null,
                withoutAccount: 0,
                withoutHeadcount: 1763,
            }),
        ).toEqual({
            placed: 'Placed in a department: 1,763 of 1,951 on Lightdash',
            withoutAccount: null,
            captions: [],
        });
    });
});

describe('buildMapAriaLabel', () => {
    it('summarises the organization in words', () => {
        const circles = layout(null);
        expect(
            buildMapAriaLabel({
                scopeName: null,
                departmentCount: 4,
                totals: getViewTotals(circles),
                areDotsHidden: false,
            }),
        ).toBe(
            'Map of the organization: 4 departments, 83 people, 17 on Lightdash, 11 active in the last 30 days. Each circle is a department sized by headcount and each dot is a person. The List view has the same numbers as a table',
        );
    });
    it('names the focused department and its sub-departments', () => {
        expect(
            buildMapAriaLabel({
                scopeName: 'Ops',
                departmentCount: 2,
                totals: getViewTotals(layout('Ops')),
                areDotsHidden: false,
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
            }),
        ).toMatch(/^Map of the organization: 1 department, 1 person, /);
        expect(
            buildMapAriaLabel({
                scopeName: 'Finance',
                departmentCount: 0,
                totals: getViewTotals(layout('Finance')),
                areDotsHidden: false,
            }),
        ).toMatch(/^Map of Finance: 8 people, 3 on Lightdash, /);
    });
    it('says when dots are hidden', () => {
        expect(
            buildMapAriaLabel({
                scopeName: null,
                departmentCount: 1,
                totals: { people: 6000, members: 10, active: 5 },
                areDotsHidden: true,
            }),
        ).toBe(
            'Map of the organization: 1 department, 6,000 people, 10 on Lightdash, 5 active in the last 30 days. Each circle is a department sized by headcount. The List view has the same numbers as a table',
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
        expect(formatMemberActivity(null, NOW)).toBe('No recorded activity');
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

describe('sortForInspector', () => {
    const c = (name: string, headcount: number | null, members: number) =>
        dept(name, null, null, {
            headcount,
            effectiveHeadcount: headcount,
            metrics: metricsFixture(
                members,
                headcount === null
                    ? null
                    : Math.round((100 * members) / headcount),
            ),
        });
    it('puts the biggest untouched department first and departments without a headcount last', () => {
        expect(
            sortForInspector([
                c('Product', null, 3),
                c('Data', 9, 1),
                c('Finance', 32, 0),
                c('Supply chain', 80, 0),
                c('Marketing', 40, 0),
                c('Legal', null, 0),
            ]).map((each) => each.name),
        ).toEqual([
            'Supply chain',
            'Marketing',
            'Finance',
            'Data',
            'Legal',
            'Product',
        ]);
    });
    it('falls back to the name when coverage and headcount are equal', () => {
        expect(
            sortForInspector([c('Beta', 10, 0), c('Alpha', 10, 0)]).map(
                (each) => each.name,
            ),
        ).toEqual(['Alpha', 'Beta']);
    });
});
