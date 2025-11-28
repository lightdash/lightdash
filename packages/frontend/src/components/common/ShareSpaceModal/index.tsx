import { type Space } from '@lightdash/common';
import { Alert, Anchor, Box, Button, Stack, Text } from '@mantine/core';
import {
    IconAlertCircle,
    IconFolderShare,
    IconLock,
    IconUsers,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { Link, useNavigate } from 'react-router';
import useSearchParams from '../../../hooks/useSearchParams';
import useApp from '../../../providers/App/useApp';
import MantineModal from '../MantineModal';
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
    const navigate = useNavigate();
    const shareSpaceModalSearchParam = useSearchParams('shareSpaceModal');
    const [selectedAccess, setSelectedAccess] = useState<AccessOption>(
        space.isPrivate ? SpaceAccessOptions[0] : SpaceAccessOptions[1],
    );
    const { user: sessionUser } = useApp();

    const [isOpen, setIsOpen] = useState<boolean>(false);
    const isNestedSpace = !!space.parentSpaceUuid;
    const rootSpaceBreadcrumb = space.breadcrumbs?.[0] ?? null;

    useEffect(() => {
        if (shareSpaceModalSearchParam === 'true') {
            setIsOpen(true);
            //clear the search param after opening the modal
            void navigate(`/projects/${projectUuid}/spaces/${space.uuid}`);
        }
    }, [navigate, projectUuid, shareSpaceModalSearchParam, space.uuid]);

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

            <MantineModal
                size="xl"
                icon={IconFolderShare}
                title={`Share "${space.name}" space`}
                opened={isOpen}
                onClose={() => setIsOpen(false)}
                actions={
                    !isNestedSpace ? (
                        <Box bg="ldGray.0">
                            <Text color="ldGray.7" fz="xs">
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
                    ) : null
                }
                modalActionsProps={{
                    bg: 'ldGray.0',
                }}
            >
                <>
                    <Stack>
                        {isNestedSpace && (
                            <Alert
                                color="blue"
                                icon={<IconAlertCircle size="1rem" />}
                            >
                                <Text color="blue.9">
                                    <Text span weight={600}>
                                        "{space.name}"
                                    </Text>{' '}
                                    inherits permissions from its parent space{' '}
                                    <Text span weight={600}>
                                        "
                                        <Anchor
                                            component={Link}
                                            onClick={() => {
                                                setIsOpen(false);
                                            }}
                                            to={`/projects/${projectUuid}/spaces/${rootSpaceBreadcrumb?.uuid}?shareSpaceModal=true`}
                                        >
                                            {rootSpaceBreadcrumb?.name}
                                        </Anchor>
                                        "
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
                </>
            </MantineModal>
        </>
    );
};

export default ShareSpaceModal;
