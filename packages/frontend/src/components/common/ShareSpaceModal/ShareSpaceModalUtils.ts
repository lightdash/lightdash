import { SpaceMemberRole } from '@lightdash/common';
import { UserAccessAction, type AccessOption } from './ShareSpaceSelect';

export const enum InheritanceType {
    INHERIT = 'inherit',
    OWN_ONLY = 'own_only',
}

export const RootInheritanceOptions: AccessOption[] = [
    {
        title: 'Inherited access',
        description: 'All members of this project can access this space',
        selectDescription: 'All members of this project can access this space',
        value: InheritanceType.INHERIT,
    },
    {
        title: 'Restricted access',
        description: 'Only invited users & groups can access this space',
        selectDescription: 'Only invited users & groups can access this space',
        value: InheritanceType.OWN_ONLY,
    },
];

export const NestedInheritanceOptions: AccessOption[] = [
    {
        title: 'Inherited access',
        description:
            'Users with access to the parent space also have access here',
        selectDescription:
            "Access from parent spaces is added to this space's own access",
        value: InheritanceType.INHERIT,
    },
    {
        title: 'Restricted access',
        description:
            'Only invited users & groups, as well as admins, can access this space',
        selectDescription:
            'This space ignores parent space permissions and uses only its own access list',
        value: InheritanceType.OWN_ONLY,
    },
];

export const getAccessColor = (
    role: SpaceMemberRole | UserAccessAction,
): [string, number] => {
    switch (role) {
        case SpaceMemberRole.ADMIN:
        case UserAccessAction.ADMIN:
            return ['blue', 6];
        case SpaceMemberRole.EDITOR:
        case UserAccessAction.EDITOR:
            return ['green', 6];
        case SpaceMemberRole.VIEWER:
        case UserAccessAction.VIEWER:
            return ['yellow', 8];
        case UserAccessAction.DELETE:
            return ['red', 6];
        default:
            return ['gray', 6];
    }
};
