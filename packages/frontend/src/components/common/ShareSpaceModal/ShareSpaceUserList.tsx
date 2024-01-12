import {
    LightdashUser,
    OrganizationMemberProfile,
    OrganizationMemberRole,
    ProjectMemberRole,
    Space,
    SpaceShare,
} from '@lightdash/common';
import { Avatar, Group, Select, Stack, Text } from '@mantine/core';
import upperFirst from 'lodash/upperFirst';
import { FC, forwardRef, useMemo } from 'react';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import { useDeleteSpaceShareMutation } from '../../../hooks/useSpaces';
import { AccessOption } from './ShareSpaceSelect';
import { getInitials, getUserNameOrEmail } from './Utils';

export interface ShareSpaceUserListProps {
    space: Space;
    sessionUser: LightdashUser | undefined;
    projectUuid: string;
    organizationUsers: OrganizationMemberProfile[] | undefined;
}

const enum UserAccessAction {
    KEEP = 'keep',
    DELETE = 'delete',
}

const UserAccessOptions: AccessOption[] = [
    {
        title: 'viewer',
        selectDescription: `This permission has been inherited from user's project access`,
        value: UserAccessAction.KEEP,
    },
    {
        title: 'No access',
        selectDescription: `Remove user's access`,
        value: UserAccessAction.DELETE,
    },
];

const UserAccessSelectItem = forwardRef<HTMLDivElement, AccessOption>(
    (
        {
            title,
            selectDescription,
            ...others
        }: React.ComponentPropsWithoutRef<'div'> & AccessOption,
        ref,
    ) => (
        <Stack ref={ref} {...others} spacing={1}>
            <Text fz="sm">{title}</Text>
            <Text fz="xs" opacity={0.65}>
                {selectDescription}
            </Text>
        </Stack>
    ),
);

export const ShareSpaceUserList: FC<ShareSpaceUserListProps> = ({
    space,
    projectUuid,
    sessionUser,
    organizationUsers,
}) => {
    const { mutate: unshareSpaceMutation } = useDeleteSpaceShareMutation(
        projectUuid,
        space.uuid,
    );

    const { data: projectAccess } = useProjectAccess(projectUuid);

    const adminUsers = useMemo(() => {
        const projectUserUuids =
            projectAccess
                ?.filter((access) => access.role === ProjectMemberRole.ADMIN)
                .map((access) => access.userUuid) || [];
        const organizationUserUuids =
            organizationUsers
                ?.filter(
                    (access) => access.role === OrganizationMemberRole.ADMIN,
                )
                .map((access) => access.userUuid) || [];

        const userUuids = [
            ...new Set([...projectUserUuids, ...organizationUserUuids]),
        ];
        return userUuids.reduce<SpaceShare[]>((acc, userUuid) => {
            if (space.access?.find((access) => access.userUuid === userUuid))
                return acc;
            const user = organizationUsers?.find(
                (orgUser) => orgUser.userUuid === userUuid,
            );
            if (user) {
                return [
                    ...acc,
                    {
                        ...user,
                        firstName: user.firstName || user.email,
                        role: ProjectMemberRole.ADMIN,
                    },
                ];
            } else return acc;
        }, []);
    }, [organizationUsers, projectAccess, space.access]);

    const userIsYou = (spaceShare: SpaceShare) =>
        spaceShare.userUuid === sessionUser?.userUuid;

    return (
        <>
            {[...(space.access ?? []), ...adminUsers]
                .sort((a, b) => {
                    if (userIsYou(a) && !userIsYou(b)) return -1;
                    if (!userIsYou(a) && userIsYou(b)) return 1;
                    return 0;
                })
                .map((sharedUser) => {
                    const isYou = userIsYou(sharedUser);
                    const role = upperFirst(sharedUser.role?.toString() || '');

                    const userAccessTypes = UserAccessOptions.map(
                        (accessType) =>
                            accessType.value === UserAccessAction.KEEP
                                ? {
                                      ...accessType,
                                      title: role,
                                  }
                                : accessType,
                    );

                    const roleType = userAccessTypes.find(
                        (uat) => uat.title === role,
                    )?.value;

                    return (
                        <Group
                            key={sharedUser.userUuid}
                            spacing="sm"
                            position="apart"
                            noWrap
                        >
                            <Group>
                                <Avatar radius="xl" tt="uppercase" color="blue">
                                    {getInitials(
                                        sharedUser.userUuid,
                                        organizationUsers,
                                    )}
                                </Avatar>

                                <Text fw={600} fz="sm">
                                    {getUserNameOrEmail(
                                        sharedUser.userUuid,
                                        organizationUsers,
                                    )}
                                    {isYou ? (
                                        <Text fw={400} span c="gray.6">
                                            {' '}
                                            (you)
                                        </Text>
                                    ) : null}
                                </Text>
                            </Group>

                            {isYou ||
                            role === upperFirst(ProjectMemberRole.ADMIN) ? (
                                <Text fw={600} fz="xs">
                                    {role}
                                </Text>
                            ) : (
                                <Select
                                    styles={{
                                        input: {
                                            fontWeight: 500,
                                        },
                                    }}
                                    size="xs"
                                    withinPortal
                                    data={userAccessTypes.map((u) => ({
                                        label: u.title,
                                        ...u,
                                    }))}
                                    value={roleType}
                                    itemComponent={UserAccessSelectItem}
                                    onChange={(item) => {
                                        if (item === UserAccessAction.DELETE) {
                                            unshareSpaceMutation(
                                                sharedUser.userUuid,
                                            );
                                        }
                                    }}
                                />
                            )}
                        </Group>
                    );
                })}
        </>
    );
};
