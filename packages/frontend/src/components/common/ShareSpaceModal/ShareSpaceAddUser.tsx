import {
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
import { useAddSpaceShareMutation } from '../../../hooks/useSpaces';
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

    const { mutateAsync: shareSpaceMutation } = useAddSpaceShareMutation(
        projectUuid,
        space.uuid,
    );

    const UserItemComponent = useMemo(() => {
        return forwardRef<HTMLDivElement, SelectItem>((props, ref) => {
            const user = space.access?.find(
                (userAccess) => userAccess.userUuid === props.value,
            );

            if (!user) return null;

            return (
                <Group ref={ref} {...props}>
                    <Avatar radius="xl" color="blue">
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

                                <Text color="dimmed">{user.email}</Text>
                            </>
                        ) : (
                            <Text>{user.email}</Text>
                        )}
                    </Stack>
                </Group>
            );
        });
    }, [space.access]);

    const data = useMemo(() => {
        return space.access
            .map((accessableUser): SelectItem | null => {
                if (!accessableUser) return null;

                const isAdmin =
                    accessableUser.inheritedRole ===
                        OrganizationMemberRole.ADMIN ||
                    accessableUser.inheritedRole === ProjectMemberRole.ADMIN;

                if (isAdmin || accessableUser.hasDirectAccess) return null;

                return {
                    value: accessableUser.userUuid,
                    label: getUserNameOrEmail(
                        accessableUser.userUuid,
                        accessableUser.firstName,
                        accessableUser.lastName,
                        accessableUser.email,
                    ),
                };
            })
            .filter((item): item is SelectItem => item !== null);
    }, [space.access]);

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
