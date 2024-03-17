import {
    type LightdashUser,
    type Space,
    type SpaceShare,
} from '@lightdash/common';
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
import { forwardRef, type FC } from 'react';
import {
    useAddSpaceShareMutation,
    useDeleteSpaceShareMutation,
} from '../../../hooks/useSpaces';
import { type AccessOption } from './ShareSpaceSelect';
import { getInitials, getUserNameOrEmail } from './Utils';

export interface ShareSpaceUserListProps {
    space: Space;
    sessionUser: LightdashUser | undefined;
    projectUuid: string;
}

const enum UserAccessAction {
    KEEP = 'keep',
    DELETE = 'delete',
    VIEWER = 'viewer',
    EDITOR = 'editor',
    ADMIN = 'admin',
}

const UserAccessOptions: AccessOption[] = [
    {
        title: 'Viewer',
        selectDescription: `View space contents.`,
        value: UserAccessAction.VIEWER,
    },
    {
        title: 'Editor',
        selectDescription: `Edit space contents.`,
        value: UserAccessAction.EDITOR,
    },
    {
        title: 'Admin',
        selectDescription: `Manage space access.`,
        value: UserAccessAction.ADMIN,
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

    const { mutate: shareSpaceMutation } = useAddSpaceShareMutation(
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
                                disabled={isYou || space.isPrivate}
                                label={
                                    <Text>
                                        {`This user has ${sharedUser.role} role for this space because they are an ${sharedUser.inheritedFrom} ${sharedUser.inheritedRole}`}
                                    </Text>
                                }
                            >
                                {isYou ? (
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
                                        onChange={(userAccessOption) => {
                                            if (
                                                userAccessOption ===
                                                UserAccessAction.DELETE
                                            ) {
                                                unshareSpaceMutation(
                                                    sharedUser.userUuid,
                                                );
                                            } else {
                                                shareSpaceMutation([
                                                    sharedUser.userUuid,
                                                    userAccessOption
                                                        ? userAccessOption
                                                        : 'viewer',
                                                ]);
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
