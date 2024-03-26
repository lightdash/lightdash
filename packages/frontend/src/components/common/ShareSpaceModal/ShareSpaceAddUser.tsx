import { OrganizationMemberRole, type Space } from '@lightdash/common';
import {
    Avatar,
    Badge,
    Button,
    Group,
    MultiSelect,
    Stack,
    Text,
    type SelectItem,
} from '@mantine/core';
import { forwardRef, useMemo, useState, type FC } from 'react';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import { useAddSpaceShareMutation } from '../../../hooks/useSpaces';
import { UserAccessOptions } from './ShareSpaceSelect';
import { getInitials, getUserNameOrEmail } from './Utils';

interface ShareSpaceAddUserProps {
    space: Space;
    projectUuid: string;
}

export const ShareSpaceAddUser: FC<ShareSpaceAddUserProps> = ({
    space,
    projectUuid,
}) => {
    const [usersSelected, setUsersSelected] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const { data: projectAccess } = useProjectAccess(projectUuid);
    const { data: organizationUsers } = useOrganizationUsers();
    const { mutateAsync: shareSpaceMutation } = useAddSpaceShareMutation(
        projectUuid,
        space.uuid,
    );

    const userUuids: string[] = useMemo(() => {
        if (organizationUsers === undefined) return [];

        const projectUserUuids =
            projectAccess?.map((project) => project.userUuid) || [];

        const orgUserUuids = organizationUsers
            .filter((user) => user.role !== OrganizationMemberRole.MEMBER)
            .map((user) => user.userUuid);

        return [...new Set([...projectUserUuids, ...orgUserUuids])];
    }, [organizationUsers, projectAccess]);

    const UserItemComponent = useMemo(() => {
        return forwardRef<HTMLDivElement, SelectItem>((props, ref) => {
            const user = organizationUsers?.find(
                (userAccess) => userAccess.userUuid === props.value,
            );

            if (!user) return null;

            const spaceAccess = space.access.find(
                (access) => access.userUuid === user.userUuid,
            );
            const currentSpaceRoleTitle = spaceAccess
                ? UserAccessOptions.find(
                      (option) => option.value === spaceAccess.role,
                  )?.title ?? 'No access'
                : 'No access';

            return (
                <Group ref={ref} {...props} position={'apart'}>
                    <Group>
                        <Avatar size="md" radius="xl" color="blue">
                            {getInitials(
                                user.userUuid,
                                user.firstName,
                                user.lastName,
                                user.email,
                            )}
                        </Avatar>
                        <Stack spacing="two">
                            {user.firstName || user.lastName ? (
                                <>
                                    <Text fw={500}>
                                        {user.firstName} {user.lastName}
                                    </Text>

                                    <Text size={'xs'} color="dimmed">
                                        {user.email}
                                    </Text>
                                </>
                            ) : (
                                <Text fw={500}>{user.email}</Text>
                            )}
                        </Stack>
                    </Group>
                    <Badge size="xs" color="gray.6" radius="xs">
                        {currentSpaceRoleTitle}
                    </Badge>
                </Group>
            );
        });
    }, [organizationUsers, space.access]);

    const data = useMemo(() => {
        return userUuids
            .map((userUuid): SelectItem | null => {
                const user = organizationUsers?.find(
                    (a) => a.userUuid === userUuid,
                );

                if (!user) return null;

                const hasDirectAccess = !!(space.access || []).find(
                    (access) => access.userUuid === userUuid,
                )?.hasDirectAccess;

                if (hasDirectAccess) return null;

                return {
                    value: userUuid,
                    label: getUserNameOrEmail(
                        user.userUuid,
                        user.firstName,
                        user.lastName,
                        user.email,
                    ),
                };
            })
            .filter((item): item is SelectItem => item !== null);
    }, [organizationUsers, userUuids, space.access]);

    return (
        <Group>
            <MultiSelect
                style={{ flex: 1 }}
                withinPortal
                searchable
                clearable
                clearSearchOnChange
                clearSearchOnBlur
                placeholder="Select users to share this space with"
                nothingFound="No users found"
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                value={usersSelected}
                onChange={setUsersSelected}
                data={data}
                itemComponent={UserItemComponent}
            />

            <Button
                disabled={usersSelected.length === 0}
                onClick={async () => {
                    for (const userUuid of usersSelected) {
                        if (userUuid)
                            await shareSpaceMutation([userUuid, 'viewer']);
                    }
                    setUsersSelected([]);
                }}
            >
                Share
            </Button>
        </Group>
    );
};
