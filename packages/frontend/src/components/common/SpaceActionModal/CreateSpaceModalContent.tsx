import {
    OrganizationMemberRole,
    ProjectMemberRole,
    SpaceMemberRole,
    type SpaceShare,
} from '@lightdash/common';
import {
    Alert,
    Anchor,
    Avatar,
    Group,
    Radio,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import upperFirst from 'lodash/upperFirst';
import { useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import { type CreateSpaceModalBody } from '.';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../MantineIcon';
import {
    SpaceAccessOptions,
    SpaceAccessType,
    SpacePrivateAccessType,
    type AccessOption,
} from '../ShareSpaceModal/ShareSpaceSelect';
import { CreateSpaceAddUser } from './CreateSpaceAddUser';
import { CreateSpaceSelectAccessType } from './CreateSpaceSelectAccessType';
import { CreateModalStep } from './types';

const UserListItem: FC<{
    isYou?: boolean;
    firstName: string;
    lastName: string;
    role: ProjectMemberRole | OrganizationMemberRole;
}> = ({ firstName, lastName, isYou, role }) => (
    <Group spacing="sm" position="apart" noWrap>
        <Group>
            <Avatar radius="xl" tt="uppercase" color="blue">
                {firstName.charAt(0) + lastName.charAt(0)}
            </Avatar>

            <Text fw={600} fz="sm">
                {firstName + ' ' + lastName}

                {isYou && (
                    <Text fw={400} span c="ldGray.6">
                        {' '}
                        (you)
                    </Text>
                )}
            </Text>
        </Group>

        <Text fw={600} fz="xs">
            {upperFirst(role)}
        </Text>
    </Group>
);

const CreateSpaceModalContent: FC<CreateSpaceModalBody> = ({
    modalStep,
    projectUuid,
    form,
    organizationUsers,
    privateAccessType,
    onPrivateAccessTypeChange,
    parentSpaceUuid,
    rootSpace,
    onClose,
}) => {
    const {
        user: { data: sessionUser },
    } = useApp();
    const [selectedAccess, setSelectedAccess] = useState<AccessOption>(
        SpaceAccessOptions[0],
    );

    const canSetSpaceAccess = !parentSpaceUuid;

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
                        userUuid: userUuid,
                        firstName: user.firstName || user.email,
                        lastName: user.lastName || '',
                        email: user.email,
                        role: SpaceMemberRole.EDITOR,
                        hasDirectAccess: false,
                        inheritedFrom: undefined,
                        inheritedRole: undefined,
                        projectRole: undefined,
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

                    {canSetSpaceAccess ? (
                        <Radio.Group
                            value={privateAccessType}
                            onChange={(value: SpacePrivateAccessType) => {
                                onPrivateAccessTypeChange(value);
                            }}
                        >
                            <Stack spacing="xs">
                                <Radio
                                    label="Private"
                                    description="Only you and admins can access this space."
                                    value={SpacePrivateAccessType.PRIVATE}
                                />

                                <Radio
                                    label="Shared"
                                    description="Choose who can access this space."
                                    value={SpacePrivateAccessType.SHARED}
                                />
                            </Stack>
                        </Radio.Group>
                    ) : (
                        <Alert
                            variant="light"
                            icon={<MantineIcon icon={IconInfoCircle} />}
                        >
                            This space will inherit permissions from the parent
                            space: "
                            <Anchor
                                component={Link}
                                onClick={onClose}
                                to={`/projects/${projectUuid}/spaces/${rootSpace?.uuid}?shareSpaceModal=true`}
                            >
                                {rootSpace?.name}
                            </Anchor>
                            "
                        </Alert>
                    )}
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

                    {adminUsers?.map((user) => (
                        <UserListItem
                            key={user.userUuid}
                            {...user}
                            role={ProjectMemberRole.ADMIN}
                        />
                    ))}

                    {sessionUser &&
                        selectedAccess?.value === SpaceAccessType.PRIVATE && (
                            <UserListItem
                                {...sessionUser}
                                role={sessionUser.role!}
                                isYou
                            />
                        )}
                </Stack>
            );
    }
};

export default CreateSpaceModalContent;
