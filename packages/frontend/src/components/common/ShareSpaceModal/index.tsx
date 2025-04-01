import { type Space } from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Group,
    Modal,
    Stack,
    Text,
    Title,
    useMantineTheme,
} from '@mantine/core';
import { IconFolderShare, IconLock, IconUsers } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../MantineIcon';
import { ShareSpaceAccessType } from './ShareSpaceAccessType';
import { ShareSpaceAddUser } from './ShareSpaceAddUser';
import {
    SpaceAccessOptions,
    SpaceAccessType,
    type AccessOption,
} from './ShareSpaceSelect';
import { ShareSpaceUserList } from './ShareSpaceUserList';

export interface ShareSpaceProps {
    space: Space;
    projectUuid: string;
}

const ShareSpaceModal: FC<ShareSpaceProps> = ({ space, projectUuid }) => {
    const theme = useMantineTheme();
    const [selectedAccess, setSelectedAccess] = useState<AccessOption>(
        space.isPrivate ? SpaceAccessOptions[0] : SpaceAccessOptions[1],
    );
    const { user: sessionUser } = useApp();

    const [isOpen, setIsOpen] = useState<boolean>(false);

    return (
        <>
            <Button
                leftIcon={
                    selectedAccess.value === SpaceAccessType.PRIVATE ? (
                        <IconLock size={18} />
                    ) : (
                        <IconUsers size={18} />
                    )
                }
                onClick={() => {
                    setIsOpen(true);
                }}
                variant="default"
            >
                Share
            </Button>

            <Modal
                size="xl"
                title={
                    <Group spacing="xs">
                        <MantineIcon size="lg" icon={IconFolderShare} />
                        <Title order={4}>Share "{space.name}" space</Title>
                    </Group>
                }
                opened={isOpen}
                onClose={() => setIsOpen(false)}
                styles={{
                    body: {
                        padding: 0,
                    },
                }}
            >
                <>
                    <Stack p="md" pt={0}>
                        <ShareSpaceAddUser
                            space={space}
                            projectUuid={projectUuid}
                        />

                        <ShareSpaceAccessType
                            projectUuid={projectUuid}
                            space={space}
                            selectedAccess={selectedAccess}
                            setSelectedAccess={setSelectedAccess}
                        />
                        <Stack sx={{ border: '1px solid red' }}>
                            <Text fw={500} fz="lg" c="blue.7">
                                Different implementation
                            </Text>

                            <Stack>
                                <Text fw={500}>Inherited access</Text>
                                {space.testing?.inheritedAccess?.map(
                                    (access, index) => (
                                        <Group key={index} position="apart">
                                            <Text>
                                                {access.first_name}{' '}
                                                {access.last_name}
                                            </Text>
                                            <Group>
                                                <Text>
                                                    ORG:{' '}
                                                    {access.organization_role}
                                                </Text>
                                                <Text>
                                                    PROJ:{access.project_role}
                                                </Text>
                                            </Group>
                                        </Group>
                                    ),
                                )}
                            </Stack>

                            <Stack>
                                <Text fw={500}>Group access</Text>
                                {space.testing?.groupAccess?.map(
                                    (access, index) => (
                                        <Group key={index} position="apart">
                                            <Text>{access.group_name}</Text>
                                            <Text>
                                                SPACE ROLE: {access.space_role}
                                            </Text>
                                        </Group>
                                    ),
                                )}
                            </Stack>

                            <Stack>
                                <Text fw={500}>User access</Text>
                                {space.testing?.userAccess?.map(
                                    (access, index) => (
                                        <Group key={index} position="apart">
                                            <Text>
                                                {access.first_name}{' '}
                                                {access.last_name}
                                            </Text>

                                            <Text>
                                                SPACE ROLE: {access.space_role}
                                            </Text>
                                        </Group>
                                    ),
                                )}
                            </Stack>
                            <ShareSpaceUserList
                                projectUuid={projectUuid}
                                space={{
                                    ...space,
                                    access:
                                        space.testing?.userAccess
                                            ?.map((access) => ({
                                                userUuid: access.user_uuid,
                                                firstName: access.first_name,
                                                lastName: access.last_name,
                                                email: access.email,
                                                role: access.space_role,
                                                hasDirectAccess: true,
                                                inheritedRole:
                                                    access.space_role,
                                                inheritedFrom: 'space',
                                                projectRole: access.space_role,
                                            }))
                                            .concat(
                                                space.testing.inheritedAccess.map(
                                                    (access) => ({
                                                        userUuid:
                                                            access.user_uuid,
                                                        firstName:
                                                            access.first_name,
                                                        lastName:
                                                            access.last_name,
                                                        email: access.email,
                                                        role: undefined,
                                                        hasDirectAccess:
                                                            access.user_uuid ===
                                                            sessionUser.data
                                                                ?.uuid
                                                                ? true
                                                                : false,
                                                        inheritedRole:
                                                            undefined,
                                                        inheritedFrom:
                                                            'organization',
                                                        projectRole: undefined,
                                                        spaceRole: undefined,
                                                    }),
                                                ),
                                            ) || [],
                                    groupsAccess:
                                        space.testing?.groupAccess?.map(
                                            (access) => ({
                                                groupUuid: access.group_uuid,
                                                spaceRole: access.space_role,
                                                groupName: access.group_name,
                                            }),
                                        ) || [],
                                }}
                                sessionUser={sessionUser.data}
                            />
                        </Stack>

                        <Box
                            p="md"
                            sx={{
                                border: '3px solid rgb(27, 20, 255)',
                            }}
                        >
                            <Text fw={500} fz="lg" c="blue.7">
                                Current implementation ⬇️
                            </Text>

                            <ShareSpaceUserList
                                projectUuid={projectUuid}
                                space={space}
                                sessionUser={sessionUser.data}
                            />
                        </Box>
                    </Stack>

                    <Box
                        bg="gray.0"
                        p="md"
                        sx={{
                            borderTop: `1px solid ${theme.colors.gray[2]}`,
                            padding: 'md',
                        }}
                    >
                        <Text color="gray.7" fz="xs">
                            {selectedAccess.value === SpaceAccessType.PRIVATE &&
                            sessionUser.data?.ability?.can(
                                'create',
                                'InviteLink',
                            ) ? (
                                <>
                                    Can't find a user? Spaces can only be shared
                                    with{' '}
                                    <Anchor
                                        component={Link}
                                        to={`/generalSettings/projectManagement/${projectUuid}/projectAccess`}
                                    >
                                        existing project members
                                    </Anchor>
                                    .
                                </>
                            ) : (
                                <>
                                    Learn more about permissions in our{' '}
                                    <Anchor
                                        href="https://docs.lightdash.com/references/roles"
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        docs
                                    </Anchor>
                                    .
                                </>
                            )}
                        </Text>
                    </Box>
                </>
            </Modal>
        </>
    );
};

export default ShareSpaceModal;
