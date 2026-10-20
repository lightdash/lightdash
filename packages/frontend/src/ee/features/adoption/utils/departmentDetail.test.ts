import { describe, expect, it } from 'vitest';
import { memberFixture } from './adoptionFixtures';
import {
    countMembersByFilter,
    countWithoutAccount,
    filterMembers,
    formatLastActive,
    formatMemberSource,
    formatTargetProgress,
    getWeeklyChartLabel,
    sortMembers,
} from './departmentDetail';

const NOW = new Date('2026-10-07T12:00:00Z');

const members = [
    memberFixture('never', null),
    memberFixture('stale', '2026-08-01T00:00:00Z'),
    memberFixture('edge', '2026-09-07T12:00:00Z'), // exactly 30 days ago
    memberFixture('recent', '2026-10-06T00:00:00Z'),
];

describe('filterMembers', () => {
    it('returns everyone for all', () => {
        expect(filterMembers(members, 'all', NOW)).toHaveLength(4);
    });
    it('never active means no recorded activity at all', () => {
        expect(
            filterMembers(members, 'neverActive', NOW).map((m) => m.userUuid),
        ).toEqual(['never']);
    });
    it('inactive 30d means active once but not in the last 30 days', () => {
        expect(
            filterMembers(members, 'inactive30d', NOW).map((m) => m.userUuid),
        ).toEqual(['stale']);
    });
    it('counts each filter', () => {
        expect(countMembersByFilter(members, NOW)).toEqual({
            all: 4,
            neverActive: 1,
            inactive30d: 1,
        });
    });
});

describe('sortMembers', () => {
    it('puts never active first, then the least recently active', () => {
        const shuffled = [members[3], members[1], members[0], members[2]];
        expect(sortMembers(shuffled).map((m) => m.userUuid)).toEqual([
            'never',
            'stale',
            'edge',
            'recent',
        ]);
    });
    it('does not change the input', () => {
        const input = [members[3], members[0]];
        sortMembers(input);
        expect(input[0].userUuid).toBe('recent');
    });
});

describe('formatLastActive', () => {
    it.each([
        [null, 'Never'],
        ['2026-10-07T08:00:00Z', 'Today'],
        ['2026-10-06T08:00:00Z', 'Yesterday'],
        ['2026-10-02T08:00:00Z', '5 days ago'],
        ['2026-08-01T00:00:00Z', '1 Aug 2026'],
    ])('formats %s as %s', (value, expected) => {
        expect(formatLastActive(value, NOW)).toBe(expected);
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
