import { describe, expect, it } from 'vitest';
import {
    type AssigneeFacetUser,
    buildAssigneeFacetOptions,
    matchesAssigneeFilter,
    UNASSIGNED_FILTER_VALUE,
} from './reviewAssigneeFacet';

const users = new Map<string, AssigneeFacetUser>([
    ['u-alice', { firstName: 'Alice', lastName: 'Ack', email: 'a@x.com' }],
    ['u-bob', { firstName: 'Bob', lastName: 'Bee', email: 'b@x.com' }],
    ['u-me', { firstName: 'Me', lastName: 'Myself', email: 'me@x.com' }],
]);

const item = (assignedToUserUuid: string | null) => ({ assignedToUserUuid });

describe('buildAssigneeFacetOptions', () => {
    it('puts the current user first regardless of count', () => {
        const options = buildAssigneeFacetOptions({
            items: [
                item('u-alice'),
                item('u-alice'),
                item('u-alice'),
                item('u-me'),
            ],
            usersByUuid: users,
            currentUserUuid: 'u-me',
        });
        expect(options.map((o) => o.value)).toEqual(['u-me', 'u-alice']);
        expect(options[0].label).toBe('Me Myself (you)');
    });

    it('sorts the rest by count desc then name asc', () => {
        const options = buildAssigneeFacetOptions({
            items: [item('u-bob'), item('u-alice'), item('u-alice')],
            usersByUuid: users,
            currentUserUuid: null,
        });
        expect(options.map((o) => o.value)).toEqual(['u-alice', 'u-bob']);
        expect(options.map((o) => o.count)).toEqual([2, 1]);
    });

    it('appends an Unassigned bucket only when present', () => {
        const withUnassigned = buildAssigneeFacetOptions({
            items: [item('u-alice'), item(null), item(null)],
            usersByUuid: users,
            currentUserUuid: null,
        });
        expect(withUnassigned.at(-1)).toEqual({
            value: UNASSIGNED_FILTER_VALUE,
            label: 'Unassigned',
            count: 2,
        });

        const withoutUnassigned = buildAssigneeFacetOptions({
            items: [item('u-alice')],
            usersByUuid: users,
            currentUserUuid: null,
        });
        expect(
            withoutUnassigned.some((o) => o.value === UNASSIGNED_FILTER_VALUE),
        ).toBe(false);
    });

    it('falls back to "Unknown user" for unresolved uuids', () => {
        const options = buildAssigneeFacetOptions({
            items: [item('u-ghost')],
            usersByUuid: users,
            currentUserUuid: null,
        });
        expect(options[0].label).toBe('Unknown user');
    });
});

describe('matchesAssigneeFilter', () => {
    it('matches everything when no assignees are selected', () => {
        expect(matchesAssigneeFilter(item('u-alice'), [])).toBe(true);
        expect(matchesAssigneeFilter(item(null), [])).toBe(true);
    });

    it('matches the unassigned sentinel against null assignees', () => {
        expect(
            matchesAssigneeFilter(item(null), [UNASSIGNED_FILTER_VALUE]),
        ).toBe(true);
        expect(
            matchesAssigneeFilter(item('u-alice'), [UNASSIGNED_FILTER_VALUE]),
        ).toBe(false);
    });

    it('matches a specific assignee uuid', () => {
        expect(matchesAssigneeFilter(item('u-alice'), ['u-alice'])).toBe(true);
        expect(matchesAssigneeFilter(item('u-bob'), ['u-alice'])).toBe(false);
    });
});
