import {
    OrganizationMemberRole,
    type DepartmentMembership,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    countAttentionNames,
    formatShared,
    formatUnassigned,
    getMemberName,
    getPlacement,
    getSharedRows,
    getUnassignedRows,
    parseMembershipTab,
    searchAttentionRows,
} from './attention';

const departments = [
    {
        departmentUuid: 'ops',
        name: 'Operations',
        explicitMemberUuids: ['kept'],
    },
    { departmentUuid: 'fin', name: 'Finance', explicitMemberUuids: [] },
    { departmentUuid: 'data', name: 'Data', explicitMemberUuids: [] },
];

const member = (
    userUuid: string,
    placedIn: string[] = [],
    primaryDepartmentUuid: string | null = null,
): DepartmentMembership => ({
    userUuid,
    email: `${userUuid}@example.com`,
    firstName: userUuid,
    lastName: 'L',
    role: OrganizationMemberRole.VIEWER,
    kind:
        placedIn.length === 0
            ? 'unassigned'
            : placedIn.length === 1
              ? 'assigned'
              : 'shared',
    placements: placedIn.map((departmentUuid) => ({
        departmentUuid,
        source: 'explicit',
        sourceGroupName: null,
    })),
    primaryDepartmentUuid,
    countedDepartmentUuids:
        primaryDepartmentUuid === null ? placedIn : [primaryDepartmentUuid],
});

describe('attention copy', () => {
    it('says how many people are in no department and how many in more than one', () => {
        expect(formatUnassigned(3)).toBe('3 people are in no department');
        expect(formatShared(2)).toBe(
            '2 people in more than one department count in each of them',
        );
    });
    it('uses the singular for one person', () => {
        expect(formatUnassigned(1)).toBe('1 person is in no department');
        expect(formatShared(1)).toBe(
            '1 person in more than one department counts in each of them',
        );
    });
    it('groups thousands', () => {
        expect(formatUnassigned(1200)).toBe(
            '1,200 people are in no department',
        );
        expect(formatShared(1951)).toBe(
            '1,951 people in more than one department count in each of them',
        );
    });
});

describe('parseMembershipTab', () => {
    it('reads the shared tab and falls back to the unassigned one', () => {
        expect(parseMembershipTab('shared')).toBe('shared');
        expect(parseMembershipTab('unassigned')).toBe('unassigned');
        expect(parseMembershipTab(null)).toBe('unassigned');
        expect(parseMembershipTab('anything')).toBe('unassigned');
    });
});

describe('getUnassignedRows', () => {
    it('keeps only people in no department, in the order given', () => {
        const rows = getUnassignedRows([
            member('none'),
            member('fine', ['ops']),
            member('both', ['ops', 'fin']),
            member('also-none'),
        ]);
        expect(rows.map((row) => row.member.userUuid)).toEqual([
            'none',
            'also-none',
        ]);
    });
});

describe('getSharedRows', () => {
    it('lists everyone in more than one department, by name, with their departments by name', () => {
        const rows = getSharedRows(
            [
                member('zoe', ['ops', 'fin']),
                member('fine', ['ops']),
                member('none'),
                member('amy', ['ops', 'data', 'fin']),
            ],
            departments,
        );
        expect(
            rows.map((row) => [
                row.member.userUuid,
                row.departments.map((d) => d.name),
            ]),
        ).toEqual([
            ['amy', ['Data', 'Finance', 'Operations']],
            ['zoe', ['Finance', 'Operations']],
        ]);
    });

    it('keeps people who already count in one of their departments', () => {
        const [row] = getSharedRows(
            [member('amy', ['ops', 'fin'], 'fin')],
            departments,
        );
        expect(row.member.primaryDepartmentUuid).toBe('fin');
        expect(row.departments).toEqual([
            { departmentUuid: 'fin', name: 'Finance' },
            { departmentUuid: 'ops', name: 'Operations' },
        ]);
    });

    it('skips department uuids it does not know', () => {
        const [row] = getSharedRows(
            [member('amy', ['gone', 'ops'])],
            departments,
        );
        expect(row.departments).toEqual([
            { departmentUuid: 'ops', name: 'Operations' },
        ]);
    });
});

describe('getPlacement', () => {
    it('sends the department its assigned people plus everyone placed, once each', () => {
        expect(getPlacement(departments, 'ops', ['a', 'kept', 'b'])).toEqual({
            departmentUuid: 'ops',
            userUuids: ['kept', 'a', 'b'],
        });
    });
    it('is null for a department it does not know', () => {
        expect(getPlacement(departments, 'gone', ['a'])).toBeNull();
    });
});

describe('attention row helpers', () => {
    const rows = getUnassignedRows([
        member('ann'),
        { ...member('ann2'), firstName: 'ann' },
        { ...member('nameless'), firstName: '', lastName: '' },
    ]);
    it('falls back to the email when a person has no name', () => {
        expect(rows.map((row) => getMemberName(row.member))).toEqual([
            'ann L',
            'ann L',
            'nameless@example.com',
        ]);
    });
    it('counts how many rows share each name', () => {
        const counts = countAttentionNames(rows);
        expect(counts.get('ann L')).toBe(2);
        expect(counts.get('nameless@example.com')).toBe(1);
    });
    it('searches name and email without regard to case, and returns everything for a blank search', () => {
        expect(searchAttentionRows(rows, '  ')).toBe(rows);
        expect(
            searchAttentionRows(rows, 'ANN2@').map((r) => r.member.userUuid),
        ).toEqual(['ann2']);
        expect(
            searchAttentionRows(rows, 'ann l').map((r) => r.member.userUuid),
        ).toEqual(['ann', 'ann2']);
        expect(searchAttentionRows(rows, 'nobody')).toEqual([]);
    });
    it('searches shared rows the same way', () => {
        const shared = getSharedRows(
            [member('amy', ['ops', 'fin']), member('zoe', ['ops', 'fin'])],
            departments,
        );
        expect(
            searchAttentionRows(shared, 'ZOE').map((r) => r.member.userUuid),
        ).toEqual(['zoe']);
    });
});
