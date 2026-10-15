import { SpaceMemberRole } from '@lightdash/common';
import { type TFunction } from 'i18next';
import { UserAccessAction, type AccessOption } from './ShareSpaceSelect';

export const enum InheritanceType {
    INHERIT = 'inherit',
    OWN_ONLY = 'own_only',
}

export const getRootInheritanceOptions = (
    t: TFunction<'modals'>,
): AccessOption[] => [
    {
        title: t('shareSpace.inheritance.inheritedTitle'),
        description: t('shareSpace.inheritance.rootInheritedDescription'),
        selectDescription: t('shareSpace.inheritance.rootInheritedDescription'),
        value: InheritanceType.INHERIT,
    },
    {
        title: t('shareSpace.inheritance.restrictedTitle'),
        description: t('shareSpace.inheritance.rootRestrictedDescription'),
        selectDescription: t(
            'shareSpace.inheritance.rootRestrictedDescription',
        ),
        value: InheritanceType.OWN_ONLY,
    },
];

export const getNestedInheritanceOptions = (
    t: TFunction<'modals'>,
): AccessOption[] => [
    {
        title: t('shareSpace.inheritance.inheritedTitle'),
        description: t('shareSpace.inheritance.nestedInheritedDescription'),
        selectDescription: t(
            'shareSpace.inheritance.nestedInheritedSelectDescription',
        ),
        value: InheritanceType.INHERIT,
    },
    {
        title: t('shareSpace.inheritance.restrictedTitle'),
        description: t('shareSpace.inheritance.nestedRestrictedDescription'),
        selectDescription: t(
            'shareSpace.inheritance.nestedRestrictedSelectDescription',
        ),
        value: InheritanceType.OWN_ONLY,
    },
];

export const getAccessColor = (
    role: SpaceMemberRole | UserAccessAction,
): string => {
    switch (role) {
        case SpaceMemberRole.ADMIN:
        case UserAccessAction.ADMIN:
            return 'blue';
        case SpaceMemberRole.EDITOR:
        case UserAccessAction.EDITOR:
            return 'green';
        case SpaceMemberRole.VIEWER:
        case UserAccessAction.VIEWER:
            return 'gray';
        case UserAccessAction.DELETE:
            return 'red';
        default:
            return 'gray';
    }
};
