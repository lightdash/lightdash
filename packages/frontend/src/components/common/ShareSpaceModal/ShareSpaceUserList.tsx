import { LightdashUser, Space, SpaceShare } from '@lightdash/common';
import {
    Avatar,
    Badge,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import upperFirst from 'lodash/upperFirst';
import { FC, forwardRef } from 'react';
import { useDeleteSpaceShareMutation } from '../../../hooks/useSpaces';
import { AccessOption } from './ShareSpaceSelect';
import { getInitials, getUserNameOrEmail } from './Utils';

export interface ShareSpaceUserListProps {
    space: Space;
    sessionUser: LightdashUser | undefined;
    projectUuid: string;
}

const enum UserAccessAction {
    KEEP = 'keep',
    DELETE = 'delete',
}

const UserAccessOptions: AccessOption[] = [
    {
        title: 'viewer',
        selectDescription: `This permission has been inherited`,
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
}) => {
    const { mutate: unshareSpaceMutation } = useDeleteSpaceShareMutation(
        projectUuid,
        space.uuid,
    );

    const userIsYou = (spaceShare: SpaceShare) =>
        spaceShare.userUuid === sessionUser?.userUuid;

    return (
        <>
            {(space.access ?? [])
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
                                        sharedUser.firstName,
                                        sharedUser.lastName,
                                        sharedUser.email,
                                    )}
                                </Avatar>

                                <Text fw={600} fz="sm">
                                    {getUserNameOrEmail(
                                        sharedUser.userUuid,
                                        sharedUser.firstName,
                                        sharedUser.lastName,
                                        sharedUser.email,
                                    )}
                                    {isYou ? (
                                        <Text fw={400} span c="gray.6">
                                            {' '}
                                            (you)
                                        </Text>
                                    ) : null}
                                </Text>
                            </Group>
                            <Tooltip
                                disabled={isYou || sharedUser.hasDirectAccess}
                                label={
                                    <Text>
                                        {`This user has ${sharedUser.role} role for this space because they are an ${sharedUser.inheritedFrom} ${sharedUser.inheritedRole}`}
                                    </Text>
                                }
                            >
                                {isYou || !sharedUser.hasDirectAccess ? (
                                    <Badge size="md" color="gray.6" radius="xs">
                                        {sharedUser.role}
                                    </Badge>
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
                                            if (
                                                item === UserAccessAction.DELETE
                                            ) {
                                                unshareSpaceMutation(
                                                    sharedUser.userUuid,
                                                );
                                            }
                                        }}
                                    />
                                )}
                            </Tooltip>
                        </Group>
                    );
                })}
        </>
    );
};
