import {
    OrganizationMemberRole,
    type DepartmentMembership,
    type MembershipResolution,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    countAttentionNames,
    describeCandidate,
    formatAttention,
    getAttentionRows,
    getMemberName,
    getPlacement,
    searchAttentionRows,
} from './attention';

const group = (name: string) => ({ groupUuid: `${name}-uuid`, name });

const departments = [
    {
        departmentUuid: 'ops',
        name: 'Operations',
        linkedGroups: [group('ops-team')],
        explicitMemberUuids: ['kept'],
    },
    {
        departmentUuid: 'fin',
        name: 'Finance',
        linkedGroups: [group('finance-leads'), group('finance-all')],
        explicitMemberUuids: [],
    },
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
    it('groups thousands', () => {
        expect(formatAttention(1951, 1200)).toBe(
            '1,951 people are in more than one department · 1,200 people are in no department',
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
        expect(rows[0].candidates).toEqual([
            {
                departmentUuid: 'ops',
                name: 'Operations',
                groupNames: ['ops-team'],
            },
        ]);
    });

    it('names the groups linked to each department in a conflict, by name', () => {
        const [row] = getAttentionRows(
            [
                member('clash', {
                    kind: 'conflict',
                    departmentUuids: ['ops', 'fin'],
                }),
            ],
            departments,
        );
        expect(row.candidates).toEqual([
            {
                departmentUuid: 'fin',
                name: 'Finance',
                groupNames: ['finance-all', 'finance-leads'],
            },
            {
                departmentUuid: 'ops',
                name: 'Operations',
                groupNames: ['ops-team'],
            },
        ]);
    });

    it('returns conflicts first with their departments, then unassigned people, and skips assigned people', () => {
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
            rows.map((r) => [
                r.member.userUuid,
                r.kind,
                r.candidates.map((c) => c.name),
            ]),
        ).toEqual([
            ['clash', 'conflict', ['Finance', 'Operations']],
            ['none', 'unassigned', []],
        ]);
    });
});

describe('describeCandidate', () => {
    const candidate = (name: string, groupNames: string[]) => ({
        departmentUuid: name.toLowerCase(),
        name,
        groupNames,
    });
    it('names the department with the group that reaches it', () => {
        expect(describeCandidate(candidate('Data', ['data-champions']))).toBe(
            'Data through data-champions',
        );
    });
    it('offers every linked group when a department has several, as any of them can be the one', () => {
        expect(
            describeCandidate(
                candidate('Finance', ['finance-all', 'finance-leads']),
            ),
        ).toBe('Finance through finance-all or finance-leads');
        expect(
            describeCandidate(
                candidate('Data', ['analysts', 'bi', 'data-team']),
            ),
        ).toBe('Data through analysts, bi or data-team');
    });
    it('names only the department when no linked group is known', () => {
        expect(describeCandidate(candidate('Sales', []))).toBe('Sales');
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
    const rows = getAttentionRows(
        [
            member('ann', { kind: 'unassigned' }),
            { ...member('ann2', { kind: 'unassigned' }), firstName: 'ann' },
            {
                ...member('nameless', { kind: 'unassigned' }),
                firstName: '',
                lastName: '',
            },
        ],
        departments,
    );
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
});
