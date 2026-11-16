import { summarizeAdoption } from './analyticsAdoptionData';

it('deduplicates mapped groups and respects individual and primary team assignments', () => {
    const row = (groups: string[], count: number, member: string) => ({
        people_membership_group_ids: JSON.stringify(groups),
        people_membership_total_members: count,
        adoption_assigned_member: member,
    });
    const summary = summarizeAdoption(
        [
            row(['product', 'engineering'], 2, 'Other'),
            row(['engineering'], 1, 'individual'),
            row(['unmapped'], 1, 'Other'),
        ],
        'people_membership',
        undefined,
        {
            revision: 1,
            teams: [
                {
                    id: 'team',
                    name: 'Product team',
                    groupIds: ['product', 'engineering'],
                    memberIds: [],
                },
                {
                    id: 'direct',
                    name: 'Direct team',
                    groupIds: [],
                    memberIds: ['individual'],
                },
            ],
            primary: { individual: 'direct' },
        },
    );
    expect(summary.overall.total).toBe(4);
    expect(summary.groups.map(({ name, total }) => [name, total])).toEqual([
        ['Product team', 2],
        ['Direct team', 1],
        ['No team', 1],
    ]);
});
