import { describe, expect, it } from 'vitest';
import { memberFixture } from './adoptionFixtures';
import {
    countMembersByFilter,
    countWithoutAccount,
    filterMembers,
    formatLastActive,
    formatMemberSource,
    formatTargetProgress,
    getActiveCaption,
    getCoverageCaption,
    getWeeklyChartLabel,
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
    it('no recorded activity means no timestamp at all', () => {
        expect(
            filterMembers(members, 'noRecordedActivity').map((m) => m.userUuid),
        ).toEqual(['never']);
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
            noRecordedActivity: 1,
            inactive30d: 2,
        });
    });
});

describe('sortMembers', () => {
    it('puts no recorded activity first, then the least recently active', () => {
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
        [null, 'No recorded activity'],
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

describe('formatTargetProgress', () => {
    const progress = {
        targetActiveUsers: 10,
        targetDate: '2026-12-31' as string | null,
        activeUsers: 2,
        remaining: 8,
        weeksLeft: 13 as number | null,
    };
    it('prompts when there is no target', () => {
        expect(formatTargetProgress(null)).toEqual({
            value: '–',
            detail: 'No target set',
        });
    });
    it('shows progress, what is left and the time remaining', () => {
        expect(formatTargetProgress(progress)).toEqual({
            value: '2 of 10',
            detail: '8 to go · 13 weeks left',
        });
        expect(formatTargetProgress({ ...progress, weeksLeft: 1 }).detail).toBe(
            '8 to go · 1 week left',
        );
    });
    it('says due this week on the target day', () => {
        expect(formatTargetProgress({ ...progress, weeksLeft: 0 }).detail).toBe(
            '8 to go · Due this week',
        );
    });
    it('says how overdue once the date has passed', () => {
        expect(
            formatTargetProgress({ ...progress, weeksLeft: -1 }).detail,
        ).toBe('8 to go · 1 week overdue');
        expect(
            formatTargetProgress({ ...progress, weeksLeft: -2 }).detail,
        ).toBe('8 to go · 2 weeks overdue');
    });
    it('gives no time phrase without a date', () => {
        expect(
            formatTargetProgress({
                ...progress,
                targetDate: null,
                weeksLeft: null,
            }).detail,
        ).toBe('8 to go');
    });
    it('says the target is met whatever the date', () => {
        expect(
            formatTargetProgress({
                ...progress,
                activeUsers: 14,
                remaining: 0,
                weeksLeft: -3,
            }),
        ).toEqual({ value: '14 of 10', detail: 'Target met' });
    });
});

describe('getWeeklyChartLabel', () => {
    it('describes start and end of both lines', () => {
        const points = [
            { weekStart: '2026-07-20', activeUsers: 1, orgAverage: 3 },
            { weekStart: '2026-10-05', activeUsers: 2, orgAverage: 2 },
        ];
        expect(getWeeklyChartLabel(points)).toBe(
            'Weekly active people over 2 weeks: this department had 1 at the start and 2 now, the average department had 3 at the start and 2 now',
        );
        expect(getWeeklyChartLabel([])).toBe('No weekly activity data');
    });
});

describe('countWithoutAccount', () => {
    it('is the headcount not yet on Lightdash, never negative', () => {
        expect(countWithoutAccount(10, 4)).toBe(6);
        expect(countWithoutAccount(3, 5)).toBe(0);
        expect(countWithoutAccount(null, 5)).toBe(0);
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
    });
    it('prompts without a headcount', () => {
        expect(getCoverageCaption(null, 3)).toBe(
            'Add a headcount to see a percentage',
        );
    });
    it('says so when accounts outnumber the headcount', () => {
        expect(getCoverageCaption(3, 5)).toBe(
            '5 accounts, more than the headcount of 3',
        );
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
    it('handles more accounts or activity than headcount', () => {
        expect(getActiveCaption(3, 5, 5)).toBe(
            '5 people active, more than the headcount of 3 · 5 of the 5 with an account',
        );
    });
});
