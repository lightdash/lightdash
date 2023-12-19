import {
    OrganizationMemberRole,
    ProjectMemberRole,
    SpaceShare,
} from '@lightdash/common';
import { Avatar, Group, Radio, Stack, Text, TextInput } from '@mantine/core';
import upperFirst from 'lodash-es/upperFirst';
import { FC, useMemo, useState } from 'react';
import { CreateSpaceModalBody } from '.';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import { useApp } from '../../../providers/AppProvider';
import {
    AccessOption,
    SpaceAccessOptions,
    SpaceAccessType,
} from '../ShareSpaceModal/ShareSpaceSelect';
import { CreateSpaceAddUser } from './CreateSpaceAddUser';
import { CreateSpaceSelectAccessType } from './CreateSpaceSelectAccessType';

export enum CreateModalStep {
    SET_NAME = 'first',
    SET_ACCESS = 'second',
}

const renderUser = (user: {
    isYou?: boolean;
    userUuid: string;
    firstName: string;
    lastName: string;
    role: string;
}) => (
    <Group spacing="sm" position="apart" noWrap>
        <Group>
            <Avatar radius="xl" tt="uppercase">
                {user.firstName.charAt(0) + user.lastName.charAt(0)}
            </Avatar>

            <Text fw={600} fz="sm">
                {user.firstName + ' ' + user.lastName}

                {user.isYou && (
                    <Text fw={400} span c="gray.6">
                        {' '}
                        (you)
                    </Text>
                )}
            </Text>
        </Group>

        <Text fw={600} fz="xs">
            {upperFirst(user.role)}
        </Text>
    </Group>
);

const CreateSpaceModalContent: FC<CreateSpaceModalBody> = ({
    modalStep,
    projectUuid,
    form,
    organizationUsers,
}) => {
    const {
        user: { data: sessionUser },
    } = useApp();
    const [selectedAccess, setSelectedAccess] = useState<AccessOption>(
        SpaceAccessOptions[0],
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
            const user = organizationUsers?.find(
                (orgUser) => orgUser.userUuid === userUuid,
            );
            if (sessionUser?.userUuid === userUuid) return acc;
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
    }, [organizationUsers, projectAccess, sessionUser?.userUuid]);

    switch (modalStep) {
        case CreateModalStep.SET_NAME:
            return (
                <Stack>
                    <TextInput
                        {...form.getInputProps('name')}
                        label="Enter a memorable name for your space"
                        placeholder="eg. KPIs"
                    />

                    <Radio.Group
                        {...form.getInputProps('isPrivate')}
                        value={
                            form.values.isPrivate
                                ? SpaceAccessType.PRIVATE
                                : SpaceAccessType.PUBLIC
                        }
                        onChange={(value) => {
                            form.setValues({
                                isPrivate: value === SpaceAccessType.PRIVATE,
                            });
                        }}
                    >
                        <Stack spacing="xs">
                            <Radio
                                label="Private"
                                description="Only you and admins can access this space."
                                value={SpaceAccessType.PRIVATE}
                            />

                            <Radio
                                label="Shared"
                                description="Choose who can access this space."
                                value={SpaceAccessType.PUBLIC}
                            />
                        </Stack>
                    </Radio.Group>
                </Stack>
            );

        default:
            return (
                <Stack>
                    {selectedAccess?.value === SpaceAccessType.PRIVATE && (
                        <CreateSpaceAddUser
                            projectUuid={projectUuid}
                            form={form}
                        />
                    )}

                    <CreateSpaceSelectAccessType
                        projectUuid={projectUuid}
                        selectedAccess={selectedAccess}
                        setSelectedAccess={(access) => {
                            form?.setValues({
                                isPrivate:
                                    access.value === SpaceAccessType.PRIVATE,
                            });
                            setSelectedAccess(access);
                        }}
                    />

                    {adminUsers?.map((user) =>
                        renderUser({ ...user, role: ProjectMemberRole.ADMIN }),
                    )}

                    {sessionUser &&
                        selectedAccess?.value === SpaceAccessType.PRIVATE &&
                        renderUser({
                            ...sessionUser,
                            role: sessionUser.role!,
                            isYou: true,
                        })}
                </Stack>
            );
    }
};

export default CreateSpaceModalContent;
