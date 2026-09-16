import { Ability } from '@casl/ability';
import {
    ResourceViewItemType,
    SpaceMemberRole,
    type PossibleAbilities,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import SpaceSelector from './SpaceSelector';

const ability = new Ability<PossibleAbilities>([
    {
        action: 'create',
        subject: 'Document',
        conditions: {
            projectUuid: 'project',
            access: {
                $elemMatch: { userUuid: 'user', role: SpaceMemberRole.EDITOR },
            },
        },
    },
]);
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        user: { data: { organizationUuid: 'org', userUuid: 'user', ability } },
    }),
}));

describe('Document move destinations', () => {
    it('only selects Spaces with inherited Document creation rights', () => {
        const onSelectSpace = vi.fn();
        const spaces = [SpaceMemberRole.VIEWER, SpaceMemberRole.EDITOR].map(
            (role) => ({
                uuid: role,
                name: `${role} space`,
                path: role,
                access: [],
                inheritsFromOrgOrProject: false,
                userAccess: {
                    userUuid: 'user',
                    role,
                    hasDirectAccess: true,
                    inheritedRole: undefined,
                    projectRole: undefined,
                    inheritedFrom: undefined,
                },
            }),
        );
        render(
            <MantineProvider>
                <SpaceSelector
                    projectUuid="project"
                    selectedSpaceUuid={null}
                    spaces={spaces}
                    itemType={ResourceViewItemType.DOCUMENT}
                    onSelectSpace={onSelectSpace}
                />
            </MantineProvider>,
        );
        fireEvent.click(screen.getByText('viewer space'));
        expect(onSelectSpace).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('editor space'));
        expect(onSelectSpace).toHaveBeenCalledWith('editor');
    });
});
