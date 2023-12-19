import {
    OrganizationMemberRole,
    ProjectMemberRole,
    Space,
} from '@lightdash/common';
import {
    Avatar,
    Group,
    MultiSelect,
    SelectItem,
    Stack,
    Text,
} from '@mantine/core';
import { UseFormReturnType } from '@mantine/form';
import { FC, forwardRef, useMemo } from 'react';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import { useApp } from '../../../providers/AppProvider';
import { getInitials, getUserNameOrEmail } from '../ShareSpaceModal/Utils';

interface CreateSpaceAddUserProps {
    projectUuid: string;
    form?: UseFormReturnType<Space>;
}

export const CreateSpaceAddUser: FC<CreateSpaceAddUserProps> = ({
    projectUuid,
    form,
}) => {
    const {
        user: { data: sessionUser },
    } = useApp();

    const { data: organizationUsers } = useOrganizationUsers();
    const { data: projectAccess } = useProjectAccess(projectUuid);

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
                    <Avatar radius="xl">
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
                    (pUser) => pUser.userUuid === userUuid,
                );

                const user = organizationUsers?.find(
                    (userAccess) => userAccess.userUuid === userUuid,
                );
                if (!user) return null;

                const isAdmin =
                    user.role === OrganizationMemberRole.ADMIN ||
                    projectUser?.role === ProjectMemberRole.ADMIN;

                const isYou = userUuid === sessionUser?.userUuid;

                if (isAdmin || isYou) return null;

                return {
                    value: userUuid,
                    label: getUserNameOrEmail(userUuid, organizationUsers),
                };
            })
            .filter((item): item is SelectItem => item !== null);
    }, [organizationUsers, userUuids, projectAccess, sessionUser]);

    return (
        <MultiSelect
            clearable
            clearSearchOnChange
            clearSearchOnBlur
            searchable
            placeholder="Select users to share this space with"
            nothingFound="No users found"
            data={data}
            itemComponent={UserItemComponent}
            value={form?.values.access?.map((v) => v.userUuid) ?? []}
            onChange={(newUserIds) => {
                form?.setValues({
                    access: newUserIds.map((userUuid) => ({
                        userUuid,
                        firstName: '',
                        lastName: '',
                        role: ProjectMemberRole.VIEWER,
                    })),
                });
            }}
        />
    );
};
