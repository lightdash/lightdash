import {
    OrganizationMemberRole,
    ProjectMemberRole,
    SpaceMemberRole,
    type Space,
} from '@lightdash/common';
import {
    Avatar,
    Group,
    MultiSelect,
    Stack,
    Text,
    type SelectItem,
} from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import { forwardRef, useMemo, type FC } from 'react';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import { useApp } from '../../../providers/AppProvider';
import {
    getOrgUserInitials,
    getOrgUserNameOrEmail,
} from '../ShareSpaceModal/Utils';

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
                    <Avatar radius="xl" color="blue">
                        {getOrgUserInitials(user.userUuid, organizationUsers)}
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

                const isYou = userUuid === sessionUser?.userUuid;

                if (isAdmin || isYou) return null;

                return {
                    value: userUuid,
                    label: getOrgUserNameOrEmail(userUuid, organizationUsers),
                };
            })
            .filter((item): item is SelectItem => item !== null);
    }, [organizationUsers, userUuids, projectAccess, sessionUser]);

    return (
        <MultiSelect
            style={{ flex: 1 }}
            withinPortal
            searchable
            clearable
            clearSearchOnChange
            clearSearchOnBlur
            placeholder="Select users to share this space with"
            nothingFound="No users found"
            itemComponent={UserItemComponent}
            data={data}
            value={form?.values.access?.map((v) => v.userUuid) ?? []}
            onChange={(newUserIds) => {
                form?.setValues({
                    access: newUserIds.map((userUuid) => ({
                        userUuid: userUuid,
                        firstName: '',
                        lastName: '',
                        email: '',
                        role: SpaceMemberRole.VIEWER,
                        hasDirectAccess: true,
                        inheritedRole: undefined,
                        inheritedFrom: undefined,
                        projectRole: undefined,
                    })),
                });
            }}
        />
    );
};
