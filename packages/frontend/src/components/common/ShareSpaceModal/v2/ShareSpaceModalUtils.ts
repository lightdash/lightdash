import {
    SpaceMemberRole,
    type Space,
    type SpaceShare,
} from '@lightdash/common';
import { useMemo } from 'react';
import { type AccessOption } from '../ShareSpaceSelect';

export const enum InheritanceType {
    INHERIT = 'inherit',
    OWN_ONLY = 'own_only',
}

export const RootInheritanceOptions: AccessOption[] = [
    {
        title: 'Project Access',
        description:
            'All project members can access with their project permissions',
        selectDescription:
            'All project members can access with their project permissions',
        value: InheritanceType.INHERIT,
    },
    {
        title: 'Custom Access',
        description: 'Only directly invited members and admins can access',
        selectDescription:
            'Only directly invited members and admins can access this space',
        value: InheritanceType.OWN_ONLY,
    },
];

export const NestedInheritanceOptions: AccessOption[] = [
    {
        title: 'Parent Access',
        description:
            'Users with access to the parent space also have access here',
        selectDescription:
            "Access from parent spaces is added to this space's own access",
        value: InheritanceType.INHERIT,
    },
    {
        title: 'Custom Access',
        description: 'Only directly invited members and admins can access',
        selectDescription:
            'This space ignores parent space permissions and uses only its own access list',
        value: InheritanceType.OWN_ONLY,
    },
];

export type SortOrder = 'name' | 'role';

export const sortAccessList =
    (sessionUserUuid: string | undefined, sortOrder: SortOrder) =>
    (a: SpaceShare, b: SpaceShare) => {
        if (a.userUuid === sessionUserUuid) return -1;
        if (b.userUuid === sessionUserUuid) return 1;

        if (sortOrder === 'role') {
            const roleOrder = [
                SpaceMemberRole.VIEWER,
                SpaceMemberRole.EDITOR,
                SpaceMemberRole.ADMIN,
            ];
            const aRole = roleOrder.indexOf(a.role);
            const bRole = roleOrder.indexOf(b.role);
            if (aRole !== bRole) return bRole - aRole;
        }

        const aName = `${a.firstName} ${a.lastName}`.toLowerCase();
        const bName = `${b.firstName} ${b.lastName}`.toLowerCase();
        return aName.localeCompare(bName);
    };

export type SpaceAccessByType = {
    project: SpaceShare[];
    organization: SpaceShare[];
    parentSpace: SpaceShare[];
    direct: SpaceShare[];
};

export const useSpaceAccessByType = (space: Space): SpaceAccessByType => {
    return useMemo<SpaceAccessByType>(() => {
        const getDirectOrHighestAccess = (
            existing: SpaceShare,
            current: SpaceShare,
        ) => {
            const roleOrder = {
                [SpaceMemberRole.VIEWER]: 1,
                [SpaceMemberRole.EDITOR]: 2,
                [SpaceMemberRole.ADMIN]: 3,
            };

            if (existing.hasDirectAccess !== current.hasDirectAccess) {
                return existing.hasDirectAccess ? existing : current;
            }
            const existingRoleNumber = roleOrder[existing.role];
            const currentRoleNumber = roleOrder[current.role];
            return currentRoleNumber > existingRoleNumber ? current : existing;
        };

        const userAccessMap = space.access.reduce<Map<string, SpaceShare>>(
            (acc, share) => {
                const existing = acc.get(share.userUuid);
                acc.set(
                    share.userUuid,
                    existing
                        ? getDirectOrHighestAccess(existing, share)
                        : share,
                );
                return acc;
            },
            new Map(),
        );

        return Array.from(userAccessMap.values()).reduce<SpaceAccessByType>(
            (acc, share) => {
                if (share.inheritedFrom === 'parent_space') {
                    acc.parentSpace.push(share);
                } else if (
                    share.hasDirectAccess ||
                    share.inheritedFrom === 'space_group'
                ) {
                    acc.direct.push(share);
                } else if (
                    share.inheritedFrom === 'project' ||
                    share.inheritedFrom === 'group'
                ) {
                    acc.project.push(share);
                } else if (share.inheritedFrom === 'organization') {
                    acc.organization.push(share);
                }
                return acc;
            },
            { project: [], organization: [], parentSpace: [], direct: [] },
        );
    }, [space]);
};
