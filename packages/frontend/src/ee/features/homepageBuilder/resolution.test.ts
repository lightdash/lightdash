import { ProjectMemberRole } from '@lightdash/common';
import { reasonLabel, RESOLUTION_STEPS } from './resolution';

const groupNames = new Map([['group-1', 'Finance']]);

it('labels the last resolution tier as the project default', () => {
    expect(RESOLUTION_STEPS).toEqual([
        'Group priority',
        'Role',
        'Project default',
    ]);
    expect(reasonLabel({ type: 'default' }, groupNames)).toBe(
        'project default',
    );
});

it('keeps group and role reason labels', () => {
    expect(
        reasonLabel(
            { type: 'group', groupUuid: 'group-1', priority: 2 },
            groupNames,
        ),
    ).toBe('via group Finance (priority 2)');
    expect(
        reasonLabel(
            { type: 'role', role: ProjectMemberRole.EDITOR },
            groupNames,
        ),
    ).toBe('via role Editor');
});
