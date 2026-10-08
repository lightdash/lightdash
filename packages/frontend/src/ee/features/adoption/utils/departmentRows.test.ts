import { describe, expect, it } from 'vitest';
import { dept } from './adoptionFixtures';
import {
    buildDepartmentRows,
    formatOwners,
    formatRoleSplit,
    formatShare,
    formatTarget,
} from './departmentRows';

const tree = [
    dept('Sales', null, 80),
    dept('Ops', null, 10),
    dept('Legal', null, null),
    dept('Stores', 'Ops', 50),
    dept('Depots', 'Ops', 5),
    dept('North', 'Stores', 20),
    dept('Shop 12', 'North', 0),
];

const names = (expanded: string[]) =>
    buildDepartmentRows(tree, new Set(expanded)).map(
        (r) => `${r.depth}:${r.department.name}`,
    );

describe('buildDepartmentRows', () => {
    it('shows top level only when nothing is expanded, lowest coverage first, no headcount last', () => {
        expect(names([])).toEqual(['0:Ops', '0:Sales', '0:Legal']);
    });
    it('inserts sorted children directly under an expanded parent', () => {
        expect(names(['Ops'])).toEqual([
            '0:Ops',
            '1:Depots',
            '1:Stores',
            '0:Sales',
            '0:Legal',
        ]);
    });
    it('shows three levels and no deeper, even when the third level is marked expanded', () => {
        expect(names(['Ops', 'Stores', 'North'])).toEqual([
            '0:Ops',
            '1:Depots',
            '1:Stores',
            '2:North',
            '0:Sales',
            '0:Legal',
        ]);
    });
    it('marks which rows can expand and how many children they have', () => {
        const rows = buildDepartmentRows(tree, new Set(['Ops', 'Stores']));
        const byName = new Map(rows.map((r) => [r.department.name, r]));
        expect(byName.get('Ops')).toMatchObject({
            canExpand: true,
            isExpanded: true,
            childCount: 2,
        });
        expect(byName.get('Depots')).toMatchObject({
            canExpand: false,
            childCount: 0,
        });
        // Third level: has a child, but the table stops here
        expect(byName.get('North')).toMatchObject({
            canExpand: false,
            childCount: 1,
        });
    });
    it('treats a department whose parent is missing as top level', () => {
        const rows = buildDepartmentRows(
            [dept('Orphan', 'deleted-parent', 30)],
            new Set(),
        );
        expect(rows.map((r) => r.depth)).toEqual([0]);
    });
    it('does not mutate the input or the expanded set', () => {
        const input = [...tree];
        const expanded = new Set(['Ops']);
        buildDepartmentRows(input, expanded);
        expect(input).toEqual(tree);
        expect([...expanded]).toEqual(['Ops']);
    });
    it('breaks coverage ties by name', () => {
        const rows = buildDepartmentRows(
            [dept('B', null, 20), dept('A', null, 20)],
            new Set(),
        );
        expect(rows.map((r) => r.department.name)).toEqual(['A', 'B']);
    });
});

describe('formatShare', () => {
    it('shows the percentage with the count beside it', () => {
        expect(formatShare(42, 7)).toBe('42% (7)');
        expect(formatShare(100, 10)).toBe('100% (10)');
    });
    it('shows nobody as 0%', () => {
        expect(formatShare(0, 0)).toBe('0% (0)');
    });
    it('shows a share that rounds to zero as less than 1%, never 0%', () => {
        expect(formatShare(0, 1)).toBe('<1% (1)');
        expect(formatShare(0, 4)).toBe('<1% (4)');
    });
    it('shows only the count when there is no headcount', () => {
        expect(formatShare(null, 7)).toBe('7 people');
        expect(formatShare(null, 1)).toBe('1 person');
        expect(formatShare(null, 0)).toBe('0 people');
    });
    it('groups thousands in the count', () => {
        expect(formatShare(56, 1317)).toBe('56% (1,317)');
        expect(formatShare(null, 1951)).toBe('1,951 people');
    });
});

describe('formatters', () => {
    it('summarises the role split', () => {
        expect(
            formatRoleSplit({
                viewers: 5,
                interactiveViewers: 2,
                editors: 1,
                admins: 0,
            }),
        ).toBe('5 viewers, 2 interactive, 1 editor');
    });
    it('groups thousands in the role split', () => {
        expect(
            formatRoleSplit({
                viewers: 1317,
                interactiveViewers: 1200,
                editors: 1,
                admins: 2,
            }),
        ).toBe('1,317 viewers, 1,200 interactive, 1 editor, 2 admins');
    });
    it('shows the first owner and counts the rest', () => {
        expect(formatOwners([])).toBe('–');
        expect(formatOwners([{ type: 'user', uuid: 'u', name: 'Ada L' }])).toBe(
            'Ada L',
        );
        expect(
            formatOwners([
                { type: 'group', uuid: 'g', name: 'Ops leads' },
                { type: 'user', uuid: 'u', name: 'Ada L' },
                { type: 'user', uuid: 'v', name: 'Bo K' },
            ]),
        ).toBe('Ops leads +2');
    });
    it('formats the target with and without a date', () => {
        expect(
            formatTarget({ targetActiveUsers: null, targetDate: null }),
        ).toBe('–');
        expect(formatTarget({ targetActiveUsers: 40, targetDate: null })).toBe(
            '40 active',
        );
        expect(
            formatTarget({ targetActiveUsers: 40, targetDate: '2026-12-31' }),
        ).toBe('40 active by 31 Dec 2026');
    });
});

describe('formatRoleSplit zero cases', () => {
    it('says no one yet when every role is zero', () => {
        expect(
            formatRoleSplit({
                viewers: 0,
                interactiveViewers: 0,
                editors: 0,
                admins: 0,
            }),
        ).toBe('No one yet');
    });
    it('lists only non-zero roles separated by commas', () => {
        expect(
            formatRoleSplit({
                viewers: 1,
                interactiveViewers: 0,
                editors: 1,
                admins: 1,
            }),
        ).toBe('1 viewer, 1 editor, 1 admin');
    });
});
