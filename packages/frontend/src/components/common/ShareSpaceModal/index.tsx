import { type Space } from '@lightdash/common';
import {
    Alert,
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
import {
    IconAlertCircle,
    IconFolderShare,
    IconLock,
    IconUsers,
} from '@tabler/icons-react';
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
    const isNestedSpace = !!space.parentSpaceUuid;
    const rootSpaceBreadcrumb = space.breadcrumbs?.[0] ?? null;

    return (
        <>
            <Box>
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
            </Box>

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
                        {isNestedSpace && (
                            <Alert
                                color="blue"
                                icon={<IconAlertCircle size="1rem" />}
                            >
                                <Text color="blue.9">
                                    <Text span weight={600}>
                                        {space.name}
                                    </Text>{' '}
                                    inherits permissions from it's root space:{' '}
                                    <Text span weight={600}>
                                        <Link
                                            onClick={() => {
                                                setIsOpen(false);
                                            }}
                                            to={`/projects/${projectUuid}/spaces/${rootSpaceBreadcrumb?.uuid}`}
                                        >
                                            {rootSpaceBreadcrumb?.name}
                                        </Link>
                                    </Text>
                                </Text>
                            </Alert>
                        )}

                        <ShareSpaceAddUser
                            space={space}
                            projectUuid={projectUuid}
                            disabled={isNestedSpace}
                        />

                        <ShareSpaceAccessType
                            projectUuid={projectUuid}
                            space={space}
                            selectedAccess={selectedAccess}
                            setSelectedAccess={setSelectedAccess}
                            disabled={isNestedSpace}
                        />

                        <ShareSpaceUserList
                            projectUuid={projectUuid}
                            space={space}
                            sessionUser={sessionUser.data}
                            disabled={isNestedSpace}
                        />
                    </Stack>

                    {!isNestedSpace ? (
                        <Box
                            bg="gray.0"
                            p="md"
                            sx={{
                                borderTop: `1px solid ${theme.colors.gray[2]}`,
                                padding: 'md',
                            }}
                        >
                            <Text color="gray.7" fz="xs">
                                {selectedAccess.value ===
                                    SpaceAccessType.PRIVATE &&
                                sessionUser.data?.ability?.can(
                                    'create',
                                    'InviteLink',
                                ) ? (
                                    <>
                                        Can't find a user? Spaces can only be
                                        shared with{' '}
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
                    ) : null}
                </>
            </Modal>
        </>
    );
};

export default ShareSpaceModal;
