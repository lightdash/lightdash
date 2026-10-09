import { type DepartmentVennRegion } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { memberFixture } from './adoptionFixtures';
import {
    countMembersByFilter,
    describeVennRegion,
    filterMembers,
    formatAlsoIn,
    formatLastActive,
    formatMemberSource,
    formatOverlapUsage,
    formatTopContentUsage,
    formatVennCount,
    getActiveCaption,
    getCoverageCaption,
    getOverlapRowLabel,
    getOverlapSelection,
    getOverlapSelectionLabel,
    getVennSets,
    getVennTitle,
    getWeekAxisLabels,
    getWeekLabels,
    getWeeklyChartLabel,
    getWeeklyComparison,
    getTopContentPath,
    getWeekTooltipRows,
    isSameSelection,
    sortMembers,
} from './departmentDetail';

const NOW = new Date('2026-10-07T12:00:00Z');

const members = [
    memberFixture('never', null),
    memberFixture('stale', '2026-08-01T00:00:00Z'),
    memberFixture('edge', '2026-09-07T23:00:00Z', { isActive30d: true }),
    memberFixture('over', '2026-09-06T23:59:00Z'),
    memberFixture('recent', '2026-10-06T00:00:00Z', { isActive30d: true }),
];

describe('filterMembers', () => {
    it('returns everyone for all', () => {
        expect(filterMembers(members, 'all')).toHaveLength(5);
    });
    it('no activity in 90 days means no timestamp at all', () => {
        expect(
            filterMembers(members, 'noRecordedActivity').map((m) => m.userUuid),
        ).toEqual(['never']);
    });
    it('active in 30 days follows the server flag', () => {
        expect(
            filterMembers(members, 'active30d').map((m) => m.userUuid),
        ).toEqual(['edge', 'recent']);
    });
    it('inactive 30d means active once but not in the last 30 days', () => {
        expect(
            filterMembers(members, 'inactive30d').map((m) => m.userUuid),
        ).toEqual(['stale', 'over']);
    });
    it('trusts the server flag over the timestamp and this clock', () => {
        const flaggedInactive = memberFixture('x', new Date().toISOString());
        const flaggedActive = memberFixture('y', '2020-01-01T00:00:00Z', {
            isActive30d: true,
        });
        expect(
            filterMembers([flaggedInactive, flaggedActive], 'inactive30d').map(
                (m) => m.userUuid,
            ),
        ).toEqual(['x']);
    });
    it('counts each filter', () => {
        expect(countMembersByFilter(members)).toEqual({
            all: 5,
            active30d: 2,
            inactive30d: 2,
            noRecordedActivity: 1,
        });
    });
    it('splits everyone into active, not active and no activity in 90 days', () => {
        const counts = countMembersByFilter(members);
        expect(
            counts.active30d + counts.inactive30d + counts.noRecordedActivity,
        ).toBe(counts.all);
    });
});

describe('sortMembers', () => {
    it('puts no activity in 90 days first, then the least recently active', () => {
        const shuffled = [
            members[4],
            members[1],
            members[0],
            members[3],
            members[2],
        ];
        expect(sortMembers(shuffled).map((m) => m.userUuid)).toEqual([
            'never',
            'stale',
            'over',
            'edge',
            'recent',
        ]);
    });
    it('does not change the input', () => {
        const input = [members[4], members[0]];
        sortMembers(input);
        expect(input[0].userUuid).toBe('recent');
    });
});

describe('formatLastActive', () => {
    it.each([
        [null, 'No activity in 90 days'],
        ['2026-10-07T00:00:00Z', 'Today'],
        ['2026-10-07T08:00:00Z', 'Today'],
        ['2026-10-06T23:59:00Z', 'Yesterday'],
        ['2026-10-02T08:00:00Z', '5 days ago'],
        ['2026-09-07T23:00:00Z', '30 days ago'],
        ['2026-09-06T23:59:00Z', '6 Sep 2026'],
        ['2026-08-01T00:00:00Z', '1 Aug 2026'],
    ])('formats %s as %s', (value, expected) => {
        expect(formatLastActive(value, NOW)).toBe(expected);
    });
    it('counts days by UTC calendar day, not elapsed hours', () => {
        const justAfterMidnight = new Date('2026-10-07T00:01:00Z');
        expect(
            formatLastActive('2026-10-06T23:59:00Z', justAfterMidnight),
        ).toBe('Yesterday');
    });
});

describe('formatMemberSource', () => {
    const base = {
        source: 'explicit' as const,
        sourceGroupName: null,
        isDirect: true,
        departmentName: 'North',
    };
    it('says Direct for a person placed in this department', () => {
        expect(formatMemberSource(base)).toBe('Direct');
    });
    it('names the sub-department a person comes through', () => {
        expect(formatMemberSource({ ...base, isDirect: false })).toBe(
            'Via North',
        );
    });
    it('names the group when the source is a group', () => {
        const group = {
            ...base,
            source: 'group' as const,
            sourceGroupName: 'ops-all',
        };
        expect(formatMemberSource(group)).toBe('Group ops-all');
        expect(formatMemberSource({ ...group, isDirect: false })).toBe(
            'Group ops-all, via North',
        );
    });
});

describe('getWeeklyComparison', () => {
    const week = (weekStart: string, activeUsers: number) => ({
        weekStart,
        activeUsers,
    });
    const organization = {
        memberCount: 2000,
        weeklyActive: [
            week('2026-09-21', 1000),
            week('2026-09-28', 500),
            week('2026-10-05', 250),
        ],
    };
    const department = [
        week('2026-09-21', 30),
        week('2026-09-28', 40),
        week('2026-10-05', 5),
    ];

    it("is the organization's weekly rate times this department's people on Lightdash", () => {
        expect(getWeeklyComparison(department, 200, organization)).toEqual([
            { weekStart: '2026-09-21', activeUsers: 30, atOrgRate: 100 },
            { weekStart: '2026-09-28', activeUsers: 40, atOrgRate: 50 },
            { weekStart: '2026-10-05', activeUsers: 5, atOrgRate: 25 },
        ]);
    });
    it('compares rates, so a small department active at a higher rate plots above the line', () => {
        // 1,951 on Lightdash with 811 active; 67 in the department with 57 active
        const [point] = getWeeklyComparison([week('2026-10-05', 57)], 67, {
            memberCount: 1951,
            weeklyActive: [week('2026-10-05', 811)],
        });
        expect(point.atOrgRate).toBe(27.9);
        expect(point.activeUsers).toBeGreaterThan(point.atOrgRate ?? 0);
    });
    it('rounds to one decimal place', () => {
        expect(
            getWeeklyComparison(department, 191, organization).map(
                (point) => point.atOrgRate,
            ),
        ).toEqual([95.5, 47.8, 23.9]);
    });
    it('matches weeks by their start date, not their position', () => {
        const shifted = {
            memberCount: 2000,
            weeklyActive: [week('2026-09-28', 500), week('2026-10-05', 250)],
        };
        expect(
            getWeeklyComparison(department, 200, shifted).map(
                (point) => point.atOrgRate,
            ),
        ).toEqual([null, 50, 25]);
    });
    it('has no comparison until the organization numbers are loaded', () => {
        expect(
            getWeeklyComparison(department, 200, null).map(
                (point) => point.atOrgRate,
            ),
        ).toEqual([null, null, null]);
    });
    it('has no comparison for a department with nobody on Lightdash', () => {
        expect(
            getWeeklyComparison(department, 0, organization).map(
                (point) => point.atOrgRate,
            ),
        ).toEqual([null, null, null]);
        expect(
            getWeeklyComparison([week('2026-10-05', 0)], 0, {
                memberCount: 0,
                weeklyActive: [week('2026-10-05', 0)],
            }),
        ).toEqual([
            { weekStart: '2026-10-05', activeUsers: 0, atOrgRate: null },
        ]);
    });
});

describe('getWeekLabels', () => {
    it('names each week by its Monday and the last one as the week so far', () => {
        expect(
            getWeekLabels([
                { weekStart: '2026-07-20' },
                { weekStart: '2026-09-28' },
                { weekStart: '2026-10-05' },
            ]),
        ).toEqual(['20 Jul', '28 Sep', 'This week so far']);
        expect(getWeekLabels([])).toEqual([]);
    });
    it('puts the week so far on two short lines for the axis', () => {
        expect(
            getWeekAxisLabels([
                { weekStart: '2026-09-28' },
                { weekStart: '2026-10-05' },
            ]),
        ).toEqual(['28 Sep', 'This week\nso far']);
    });
});

describe('getWeekTooltipRows', () => {
    const department = (value: number | null) => ({
        seriesName: 'This department',
        value,
    });
    const atOrgRate = (value: number | null) => ({
        seriesName: "At the organization's rate",
        value,
    });
    it('names the week and gives the count of each line shown', () => {
        // The week so far is the second department series; the first has no point there
        expect(
            getWeekTooltipRows('This week so far', [
                department(null),
                department(1250),
                atOrgRate(27.9),
            ]),
        ).toEqual([
            'This week so far',
            'This department: 1,250',
            "At the organization's rate: 27.9",
        ]);
    });
    it('leaves out a line hidden through the legend', () => {
        expect(
            getWeekTooltipRows('28 Sep', [department(1250), department(1250)]),
        ).toEqual(['28 Sep', 'This department: 1,250']);
        expect(getWeekTooltipRows('28 Sep', [atOrgRate(27.9)])).toEqual([
            '28 Sep',
            "At the organization's rate: 27.9",
        ]);
    });
    it('leaves the comparison out until it is loaded', () => {
        expect(
            getWeekTooltipRows('28 Sep', [department(1250), atOrgRate(null)]),
        ).toEqual(['28 Sep', 'This department: 1,250']);
    });
    it('shows nothing when every line is hidden', () => {
        expect(getWeekTooltipRows('28 Sep', [])).toEqual([]);
    });
});

describe('getWeeklyChartLabel', () => {
    const points = [
        { weekStart: '2026-07-20', activeUsers: 1, atOrgRate: 3 },
        { weekStart: '2026-10-05', activeUsers: 1250, atOrgRate: 2.5 },
    ];
    it('describes both lines, with the last week as the week so far', () => {
        expect(getWeeklyChartLabel(points)).toBe(
            "Weekly active people over 2 weeks: this department had 1 at the start and 1,250 this week so far, against 3 and 2.5 at the organization's rate",
        );
    });
    it('describes the department alone while there is no comparison', () => {
        expect(
            getWeeklyChartLabel(
                points.map((point) => ({ ...point, atOrgRate: null })),
            ),
        ).toBe(
            'Weekly active people over 2 weeks: this department had 1 at the start and 1,250 this week so far',
        );
    });
    it('says when there is nothing to draw', () => {
        expect(getWeeklyChartLabel([])).toBe('No weekly activity data');
    });
});

describe('getCoverageCaption', () => {
    it('counts against the headcount, the same base as the percentage', () => {
        expect(getCoverageCaption(40, 3)).toBe(
            '3 of 40 people have an account',
        );
        expect(getCoverageCaption(40, 0)).toBe(
            '0 of 40 people have an account',
        );
        expect(getCoverageCaption(2350, 221)).toBe(
            '221 of 2,350 people have an account',
        );
    });
    it('gives the people on Lightdash without a headcount, as they are all that is counted', () => {
        expect(getCoverageCaption(null, 3)).toBe('3 people on Lightdash');
        expect(getCoverageCaption(null, 1)).toBe('1 person on Lightdash');
    });
});

describe('formatTopContentUsage', () => {
    it('gives the count and the people behind it', () => {
        expect(
            formatTopContentUsage(
                { count: 37405, distinctPeople: 92 },
                { one: 'view', other: 'views' },
            ),
        ).toBe('37,405 views · 92 people');
        expect(
            formatTopContentUsage(
                { count: 1, distinctPeople: 1 },
                { one: 'query', other: 'queries' },
            ),
        ).toBe('1 query · 1 person');
    });
});

describe('getTopContentPath', () => {
    const PROJECT = '3675b69e-8324-4110-bdca-059031aa8da3';
    it('opens a dashboard, an explore and an AI agent in their project', () => {
        expect(
            getTopContentPath('dashboards', {
                id: 'c2e7a2a4-0b6e-4a49-9d43-0c5b3f0e8f1a',
                name: 'Sales',
                projectUuid: PROJECT,
            }),
        ).toBe(
            `/projects/${PROJECT}/dashboards/c2e7a2a4-0b6e-4a49-9d43-0c5b3f0e8f1a/view`,
        );
        // The explore's id joins the project and the name, so the name alone opens it
        expect(
            getTopContentPath('explores', {
                id: `${PROJECT}:orders`,
                name: 'orders',
                projectUuid: PROJECT,
            }),
        ).toBe(`/projects/${PROJECT}/tables/orders`);
        expect(
            getTopContentPath('aiAgents', {
                id: '0d1f3c54-8a4e-4f7e-9c0b-2a6b9d1e7f3c',
                name: 'Analyst',
                projectUuid: PROJECT,
            }),
        ).toBe(
            `/projects/${PROJECT}/ai-agents/0d1f3c54-8a4e-4f7e-9c0b-2a6b9d1e7f3c`,
        );
    });
    it('encodes the explore name, so a name can never become a URL of its own', () => {
        expect(
            getTopContentPath('explores', {
                id: 'x',
                name: 'javascript:alert(1)',
                projectUuid: PROJECT,
            }),
        ).toBe(`/projects/${PROJECT}/tables/javascript%3Aalert(1)`);
        expect(
            getTopContentPath('explores', {
                id: 'x',
                name: '../../settings?x=1#y',
                projectUuid: PROJECT,
            }),
        ).toBe(`/projects/${PROJECT}/tables/..%2F..%2Fsettings%3Fx%3D1%23y`);
        // A dashboard or an agent is opened by its id, whatever its name
        expect(
            getTopContentPath('dashboards', {
                id: 'd1',
                name: 'javascript:alert(1)',
                projectUuid: PROJECT,
            }),
        ).toBe(`/projects/${PROJECT}/dashboards/d1/view`);
    });
});

describe('getActiveCaption', () => {
    it('leads with the headcount base and adds the account base separately', () => {
        expect(getActiveCaption(40, 2, 3)).toBe(
            '2 of 40 people were active · 2 of the 3 with an account',
        );
    });
    it('uses the account base only without a headcount', () => {
        expect(getActiveCaption(null, 2, 3)).toBe(
            '2 of the 3 with an account were active',
        );
    });
    it('handles zero members', () => {
        expect(getActiveCaption(40, 0, 0)).toBe('0 of 40 people were active');
        expect(getActiveCaption(null, 0, 0)).toBe('No one has an account yet');
    });
    it('groups thousands', () => {
        expect(getActiveCaption(2350, 1126, 1221)).toBe(
            '1,126 of 2,350 people were active · 1,126 of the 1,221 with an account',
        );
    });
    it('gives the headcount base alone when everyone in the headcount has an account', () => {
        expect(getActiveCaption(191, 85, 191)).toBe(
            '85 of 191 people were active',
        );
    });
});

const DATA = { departmentUuid: 'data', name: 'Data' };
const MARKETING = { departmentUuid: 'marketing', name: 'Marketing' };
const SALES = { departmentUuid: 'sales', name: 'Sales' };
const FINANCE = { departmentUuid: 'finance', name: 'Finance' };

describe('getOverlapSelectionLabel', () => {
    it('names the one department the people are also in', () => {
        expect(getOverlapSelectionLabel(getOverlapSelection(MARKETING))).toBe(
            'Also in Marketing',
        );
    });
    it('names two departments with and', () => {
        expect(
            getOverlapSelectionLabel({
                withDepartments: [MARKETING, SALES],
                withoutDepartments: [],
            }),
        ).toBe('Also in Marketing and Sales');
    });
    it('adds the department they are not in', () => {
        expect(
            getOverlapSelectionLabel({
                withDepartments: [MARKETING],
                withoutDepartments: [SALES],
            }),
        ).toBe('Also in Marketing, not in Sales');
    });
    it('names only the departments they are not in when they are in no other', () => {
        expect(
            getOverlapSelectionLabel({
                withDepartments: [],
                withoutDepartments: [MARKETING, SALES],
            }),
        ).toBe('Not in Marketing or Sales');
        expect(
            getOverlapSelectionLabel({
                withDepartments: [],
                withoutDepartments: [MARKETING],
            }),
        ).toBe('Not in Marketing');
    });
});

describe('isSameSelection', () => {
    it('matches the same departments in any order', () => {
        expect(
            isSameSelection(
                { withDepartments: [MARKETING, SALES], withoutDepartments: [] },
                { withDepartments: [SALES, MARKETING], withoutDepartments: [] },
            ),
        ).toBe(true);
    });
    it('tells the departments they are in from the ones they are not in', () => {
        expect(
            isSameSelection(
                { withDepartments: [MARKETING], withoutDepartments: [SALES] },
                { withDepartments: [MARKETING], withoutDepartments: [] },
            ),
        ).toBe(false);
        expect(
            isSameSelection(
                { withDepartments: [MARKETING], withoutDepartments: [] },
                { withDepartments: [], withoutDepartments: [MARKETING] },
            ),
        ).toBe(false);
    });
});

describe('overlap rows', () => {
    const overlap = {
        departmentUuid: 'marketing',
        name: 'Marketing',
        people: 1204,
        active30d: 12,
    };
    it('gives the people in both and how many of them are active', () => {
        expect(formatOverlapUsage(overlap)).toBe('1,204 people · 12 active');
        expect(formatOverlapUsage({ people: 1, active30d: 1 })).toBe(
            '1 person · 1 active',
        );
    });
    it('names a row by its department and both counts', () => {
        expect(getOverlapRowLabel(overlap)).toBe(
            'Marketing, 1,204 people, 12 active',
        );
    });
    it('selects the people also in that department, leaving no one out', () => {
        expect(getOverlapSelection(MARKETING)).toEqual({
            withDepartments: [MARKETING],
            withoutDepartments: [],
        });
    });
});

describe('getVennSets', () => {
    it('puts the department first and keeps its overlaps in order', () => {
        expect(getVennSets([MARKETING, DATA, SALES], 'data')).toEqual([
            DATA,
            MARKETING,
            SALES,
        ]);
        expect(getVennSets([DATA, MARKETING], 'data')).toEqual([
            DATA,
            MARKETING,
        ]);
    });
    it('draws nothing without the department, or with fewer than two or more than three sets', () => {
        expect(getVennSets([MARKETING, SALES], 'data')).toBeNull();
        expect(getVennSets([DATA], 'data')).toBeNull();
        expect(getVennSets([DATA, MARKETING, SALES, FINANCE], 'data')).toBe(
            null,
        );
    });
});

describe('getVennTitle', () => {
    it('names every department drawn', () => {
        expect(getVennTitle([DATA, MARKETING, SALES])).toBe(
            'Overlap of Data, Marketing and Sales',
        );
        expect(getVennTitle([DATA, MARKETING])).toBe(
            'Overlap of Data and Marketing',
        );
    });
});

describe('describeVennRegion', () => {
    const sets = [DATA, MARKETING, SALES];
    const region = (
        departmentUuids: string[],
        people: number,
    ): DepartmentVennRegion => ({
        sets: departmentUuids,
        people,
        active30d: 0,
    });
    const regions = [
        region(['data'], 1234),
        region(['marketing'], 2000),
        region(['sales'], 1),
        region(['data', 'marketing'], 42),
        region(['data', 'sales'], 7),
        region(['marketing', 'sales'], 15),
        region(['data', 'marketing', 'sales'], 5),
    ];

    it('counts the people in each region and names it by its departments', () => {
        expect(
            [[0], [2], [0, 1], [0, 1, 2]].map((positions) => {
                const { people, name } = describeVennRegion(
                    sets,
                    regions,
                    positions,
                );
                return { people, name };
            }),
        ).toEqual([
            { people: 1234, name: 'Data only, 1,234 people' },
            { people: 1, name: 'Sales only, 1 person' },
            { people: 42, name: 'Data and Marketing, 42 people' },
            { people: 5, name: 'Data, Marketing and Sales, 5 people' },
        ]);
    });
    it('lists exactly the people of a region holding the department: in its other departments and in none of the rest', () => {
        const selectionOf = (positions: number[]) =>
            describeVennRegion(sets, regions, positions).selection;
        expect(selectionOf([0])).toEqual({
            withDepartments: [],
            withoutDepartments: [MARKETING, SALES],
        });
        expect(selectionOf([0, 1])).toEqual({
            withDepartments: [MARKETING],
            withoutDepartments: [SALES],
        });
        expect(selectionOf([0, 2])).toEqual({
            withDepartments: [SALES],
            withoutDepartments: [MARKETING],
        });
        expect(selectionOf([0, 1, 2])).toEqual({
            withDepartments: [MARKETING, SALES],
            withoutDepartments: [],
        });
    });
    it('never lists a region outside the department', () => {
        [[1], [2], [1, 2]].forEach((positions) =>
            expect(
                describeVennRegion(sets, regions, positions).selection,
            ).toBeNull(),
        );
    });
    it('does not list a region with nobody in it, and counts one the server left out as empty', () => {
        const emptied = regions.map((r) =>
            r.sets.length === 3 ? { ...r, people: 0 } : r,
        );
        expect(describeVennRegion(sets, emptied, [0, 1, 2])).toEqual({
            people: 0,
            name: 'Data, Marketing and Sales, 0 people',
            selection: null,
        });
        expect(describeVennRegion(sets, regions.slice(0, 3), [0, 1])).toEqual({
            people: 0,
            name: 'Data and Marketing, 0 people',
            selection: null,
        });
    });
    it('finds a region whatever order its departments come in', () => {
        expect(
            describeVennRegion(
                sets,
                [region(['sales', 'data', 'marketing'], 9)],
                [0, 1, 2],
            ).people,
        ).toBe(9);
    });
    it('lists the department alone, not in the one other department drawn', () => {
        expect(
            describeVennRegion(
                [DATA, MARKETING],
                [region(['data'], 3), region(['data', 'marketing'], 2)],
                [0],
            ),
        ).toEqual({
            people: 3,
            name: 'Data only, 3 people',
            selection: { withDepartments: [], withoutDepartments: [MARKETING] },
        });
    });
});

describe('formatAlsoIn', () => {
    it('names the other departments a person is in, by name', () => {
        expect(formatAlsoIn([SALES, FINANCE])).toEqual({
            text: 'Also in Finance and Sales',
            title: null,
        });
        expect(formatAlsoIn([MARKETING])).toEqual({
            text: 'Also in Marketing',
            title: null,
        });
    });
    it('is nothing for someone in no other department', () => {
        expect(formatAlsoIn([])).toBeNull();
    });
    it('names three and counts the rest, with every name in the title', () => {
        expect(
            formatAlsoIn([
                SALES,
                FINANCE,
                MARKETING,
                DATA,
                { departmentUuid: 'ops', name: 'Operations' },
            ]),
        ).toEqual({
            text: 'Also in Data, Finance, Marketing and 2 more',
            title: 'Also in Data, Finance, Marketing, Operations and Sales',
        });
    });
});

describe('formatVennCount', () => {
    it('groups thousands below 10,000', () => {
        expect(formatVennCount(0)).toBe('0');
        expect(formatVennCount(1234)).toBe('1,234');
        expect(formatVennCount(9999)).toBe('9,999');
    });
    it('writes 10,000 and more in thousands, to one decimal place without a trailing .0', () => {
        expect(formatVennCount(10000)).toBe('10k');
        expect(formatVennCount(12345)).toBe('12.3k');
        expect(formatVennCount(12950)).toBe('13k');
        expect(formatVennCount(99999)).toBe('100k');
        expect(formatVennCount(1234567)).toBe('1,234.6k');
    });
});
