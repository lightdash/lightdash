import { reasonLabel } from './PreviewPane';

const groupNames = new Map([['group-1', 'Finance']]);

it('labels the last resolution tier as the project default', () => {
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
        reasonLabel({ type: 'role', role: 'editor' }, groupNames),
    ).toBe('via role Editor');
});
