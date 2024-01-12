import { Space } from '@lightdash/common';
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
import { FC, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../MantineIcon';
import { ShareSpaceAccessType } from './ShareSpaceAccessType';
import { ShareSpaceAddUser } from './ShareSpaceAddUser';
import {
    AccessOption,
    SpaceAccessOptions,
    SpaceAccessType,
} from './ShareSpaceSelect';
import { ShareSpaceUserList } from './ShareSpaceUserList';

export interface ShareSpaceProps {
    space: Space;
    projectUuid: string;
}

const ShareSpaceModal: FC<ShareSpaceProps> = ({ space, projectUuid }) => {
    const theme = useMantineTheme();
    const { data: organizationUsers } = useOrganizationUsers();
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
                size="lg"
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
                        {selectedAccess.value === SpaceAccessType.PRIVATE ? (
                            <ShareSpaceAddUser
                                space={space}
                                projectUuid={projectUuid}
                                organizationUsers={organizationUsers}
                            />
                        ) : null}

                        <ShareSpaceAccessType
                            projectUuid={projectUuid}
                            space={space}
                            selectedAccess={selectedAccess}
                            setSelectedAccess={setSelectedAccess}
                        />

                        {selectedAccess.value === SpaceAccessType.PRIVATE && (
                            <ShareSpaceUserList
                                projectUuid={projectUuid}
                                space={space}
                                sessionUser={sessionUser.data}
                                organizationUsers={organizationUsers}
                            />
                        )}
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
