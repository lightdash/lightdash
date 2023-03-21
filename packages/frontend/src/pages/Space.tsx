import { Intent, NonIdealState } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { ActionIcon, Center, Group, Stack } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import React, { FC, useCallback, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { Can } from '../components/common/Authorization';
import ErrorState from '../components/common/ErrorState';
import LoadingState from '../components/common/LoadingState';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ShareSpaceModal from '../components/common/ShareSpaceModal';
import SpaceActionModal, {
    ActionType,
} from '../components/common/SpaceActionModal';
import { SpaceBrowserMenu } from '../components/Explorer/SpaceBrowser/SpaceBrowserMenu';
import ForbiddenPanel from '../components/ForbiddenPanel';
import SpacePanel from '../components/SpacePanel';
import { useSpacePinningMutation } from '../hooks/pinning/useSpaceMutation';
import { useSpace } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

const Space: FC = () => {
    const { projectUuid, spaceUuid } = useParams<{
        projectUuid: string;
        spaceUuid: string;
    }>();
    const { data: space, isLoading, error } = useSpace(projectUuid, spaceUuid);
    const { mutate: pinSpace } = useSpacePinningMutation(projectUuid);
    const { user } = useApp();

    const history = useHistory();
    const location = useLocation();

    const [updateSpace, setUpdateSpace] = useState<boolean>(false);
    const [deleteSpace, setDeleteSpace] = useState<boolean>(false);

    const handlePinToggleSpace = useCallback(
        (spaceId: string) => pinSpace(spaceId),
        [pinSpace],
    );

    if (user.data?.ability?.cannot('view', 'SavedChart')) {
        return <ForbiddenPanel />;
    }

    if (isLoading) {
        return <LoadingState title="Loading items" />;
    }

    if (error) {
        return <ErrorState error={error.error} />;
    }

    if (space === undefined) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState
                    title="Space does not exist"
                    description={`We could not find space with uuid ${spaceUuid}`}
                />
            </div>
        );
    }

    const renderSpaceBrowserMenu = () => {
        return (
            <SpaceBrowserMenu
                onRename={() => setUpdateSpace(true)}
                onDelete={() => setDeleteSpace(true)}
                onTogglePin={() => handlePinToggleSpace(space?.uuid)}
                isPinned={!!space?.pinnedListUuid}
            >
                <ActionIcon variant="default" size={36}>
                    <IconDots size={20} />
                </ActionIcon>
            </SpaceBrowserMenu>
        );
    };

    const renderUpdateSpaceModel = () => {
        return (
            updateSpace && (
                <SpaceActionModal
                    projectUuid={projectUuid}
                    spaceUuid={space?.uuid}
                    actionType={ActionType.UPDATE}
                    title="Update space"
                    confirmButtonLabel="Update"
                    icon="folder-close"
                    onClose={() => setUpdateSpace(false)}
                />
            )
        );
    };

    const renderDeleteSpaceModal = () => {
        return (
            deleteSpace && (
                <SpaceActionModal
                    projectUuid={projectUuid}
                    spaceUuid={space?.uuid}
                    actionType={ActionType.DELETE}
                    title="Delete space"
                    confirmButtonLabel="Delete"
                    confirmButtonIntent={Intent.DANGER}
                    icon="folder-close"
                    onSubmitForm={() => {
                        if (location.pathname.includes(space?.uuid)) {
                            //Redirect to home if we are on the space we are deleting
                            history.push(`/projects/${projectUuid}/home`);
                        }
                    }}
                    onClose={() => {
                        setDeleteSpace(false);
                    }}
                />
            )
        );
    };

    return (
        <Center my="md">
            <Helmet>
                <title>{space?.name} - Lightdash</title>
            </Helmet>
            <Stack spacing="xl" w={900}>
                <Group position="apart" mt="xs">
                    <PageBreadcrumbs
                        items={[
                            {
                                href: `/projects/${projectUuid}/spaces`,
                                title: 'Spaces',
                            },
                        ]}
                        mt="xs"
                    >
                        {space.name}
                    </PageBreadcrumbs>
                    <Group spacing="xs">
                        <Can
                            I="manage"
                            this={subject('Space', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid,
                            })}
                        >
                            <ShareSpaceModal
                                space={space!}
                                projectUuid={projectUuid}
                            />
                            {renderSpaceBrowserMenu()}
                            {renderUpdateSpaceModel()}
                            {renderDeleteSpaceModal()}
                        </Can>
                    </Group>
                </Group>
                <SpacePanel space={space} />
            </Stack>
        </Center>
    );
};

export default Space;
