import {
    OrganizationMemberRole,
    type DepartmentMembership,
    type MembershipResolution,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { formatAttention, getAttentionRows } from './attention';

const departments = [
    { departmentUuid: 'ops', parentDepartmentUuid: null, name: 'Operations' },
    { departmentUuid: 'fin', parentDepartmentUuid: null, name: 'Finance' },
];

const member = (
    userUuid: string,
    resolution: MembershipResolution,
): DepartmentMembership => ({
    userUuid,
    email: `${userUuid}@example.com`,
    firstName: userUuid,
    lastName: 'L',
    role: OrganizationMemberRole.VIEWER,
    resolution,
});

describe('formatAttention', () => {
    it('is null when there is nothing to fix', () => {
        expect(formatAttention(0, 0)).toBeNull();
    });
    it('mentions only the non-zero counts, with correct plurals', () => {
        expect(formatAttention(2, 0)).toBe(
            '2 people are in more than one department',
        );
        expect(formatAttention(0, 1)).toBe('1 person is in no department');
        expect(formatAttention(1, 3)).toBe(
            '1 person is in more than one department · 3 people are in no department',
        );
    });
});

describe('getAttentionRows', () => {
    it('skips department uuids it does not know', () => {
        const rows = getAttentionRows(
            [
                member('clash', {
                    kind: 'conflict',
                    departmentUuids: ['gone', 'ops'],
                }),
            ],
            departments,
        );
        expect(rows[0].candidateNames).toEqual(['Operations']);
    });

    it('returns conflicts first with their department names, then unassigned people, and skips assigned people', () => {
        const rows = getAttentionRows(
            [
                member('none', { kind: 'unassigned' }),
                member('fine', {
                    kind: 'assigned',
                    departmentUuid: 'ops',
                    source: 'explicit',
                    sourceGroupName: null,
                }),
                member('clash', {
                    kind: 'conflict',
                    departmentUuids: ['fin', 'ops'],
                }),
            ],
            departments,
        );
        expect(
            rows.map((r) => [r.member.userUuid, r.kind, r.candidateNames]),
        ).toEqual([
            ['clash', 'conflict', ['Finance', 'Operations']],
            ['none', 'unassigned', []],
        ]);
    });
});
