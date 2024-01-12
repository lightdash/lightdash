import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
    ProjectMemberRole,
    Space,
} from '@lightdash/common';
import {
    Avatar,
    Button,
    Group,
    MultiSelect,
    SelectItem,
    Stack,
    Text,
} from '@mantine/core';
import { FC, forwardRef, useMemo, useState } from 'react';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import { useAddSpaceShareMutation } from '../../../hooks/useSpaces';
import { getInitials, getUserNameOrEmail } from './Utils';

interface ShareSpaceAddUserProps {
    space: Space;
    projectUuid: string;
    organizationUsers: OrganizationMemberProfile[] | undefined;
}

export const ShareSpaceAddUser: FC<ShareSpaceAddUserProps> = ({
    space,
    projectUuid,
    organizationUsers,
}) => {
    const [usersSelected, setUsersSelected] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const { data: projectAccess } = useProjectAccess(projectUuid);

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

            return (
                <Group ref={ref} {...props}>
                    <Avatar radius="xl" color="blue">
                        {getInitials(user.userUuid, organizationUsers)}
                    </Avatar>

                    <Stack spacing="two">
                        {user.firstName || user.lastName ? (
                            <>
                                <Text fw={500}>
                                    {user.firstName} {user.lastName}
                                </Text>

                                <Text color="dimmed">{user.email}</Text>
                            </>
                        ) : (
                            <Text>{user.email}</Text>
                        )}
                    </Stack>
                </Group>
            );
        });
    }, [organizationUsers]);

    const data = useMemo(() => {
        return userUuids
            .map((userUuid): SelectItem | null => {
                const projectUser = projectAccess?.find(
                    (a) => a.userUuid === userUuid,
                );

                const user = organizationUsers?.find(
                    (a) => a.userUuid === userUuid,
                );

                if (!user) return null;

                const isAdmin =
                    user.role === OrganizationMemberRole.ADMIN ||
                    projectUser?.role === ProjectMemberRole.ADMIN;

                const hasAccess = space.access
                    ?.map((access) => access.userUuid)
                    .includes(userUuid);

                if (isAdmin || hasAccess) return null;

                return {
                    value: userUuid,
                    label: getUserNameOrEmail(userUuid, organizationUsers),
                };
            })
            .filter((item): item is SelectItem => item !== null);
    }, [organizationUsers, userUuids, projectAccess, space.access]);

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
                        if (userUuid) await shareSpaceMutation(userUuid);
                    }
                    setUsersSelected([]);
                }}
            >
                Share
            </Button>
        </Group>
    );
};
