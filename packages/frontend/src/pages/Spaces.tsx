import { subject } from '@casl/ability';
import {
    LightdashMode,
    ResourceViewItemType,
    spaceToResourceViewItem,
    wrapResourceView,
} from '@lightdash/common';
import { Button, Center, Group, Stack } from '@mantine/core';
import { IconFolders, IconPlus } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';
import LoadingState from '../components/common/LoadingState';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ResourceView, {
    ResourceViewType,
} from '../components/common/ResourceView';
import SpaceActionModal, {
    ActionType,
} from '../components/common/SpaceActionModal';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useSpaces } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

const Spaces: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
    const { data: spaces = [], isLoading } = useSpaces(projectUuid);

    const { user, health } = useApp();

    const hasSpaces = spaces.length > 0;
    const isDemo = health.data?.mode === LightdashMode.DEMO;
    const userCannotViewSpace = user.data?.ability?.cannot(
        'view',
        subject('Space', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const userCanManageSpace = user.data?.ability?.can(
        'create',
        subject('Space', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const handleCreateSpace = () => {
        setIsCreateModalOpen(true);
    };

    if (userCannotViewSpace) {
        return <ForbiddenPanel />;
    }

    if (isLoading && !userCannotViewSpace) {
        return <LoadingState title="Loading spaces" />;
    }

    return (
        <Center my="md">
            <Helmet>
                <title>Spaces - Lightdash</title>
            </Helmet>
            {/* FIXME: use Mantine sizes for width */}
            <Stack spacing="xl" w={900}>
                <Group position="apart" mt="xs">
                    <PageBreadcrumbs
                        mt="xs"
                        items={[
                            { to: '/home', title: 'Home' },
                            { title: 'All Spaces', active: true },
                        ]}
                    />

                    {!isDemo && userCanManageSpace && hasSpaces && (
                        <Button
                            leftIcon={<IconPlus size={18} />}
                            onClick={handleCreateSpace}
                        >
                            Create space
                        </Button>
                    )}
                </Group>
                <ResourceView
                    view={ResourceViewType.GRID}
                    items={wrapResourceView(
                        spaces.map(spaceToResourceViewItem),
                        ResourceViewItemType.SPACE,
                    )}
                    headerProps={{
                        title: 'Spaces',
                    }}
                    emptyStateProps={{
                        icon: <IconFolders size={30} />,
                        title: 'No spaces added yet',
                        action:
                            !isDemo && userCanManageSpace ? (
                                <Button onClick={handleCreateSpace}>
                                    Create space
                                </Button>
                            ) : undefined,
                    }}
                />
            </Stack>
            {isCreateModalOpen && (
                <SpaceActionModal
                    projectUuid={projectUuid}
                    actionType={ActionType.CREATE}
                    title="Create new space"
                    confirmButtonLabel="Create"
                    icon="folder-close"
                    onClose={() => setIsCreateModalOpen(false)}
                />
            )}
        </Center>
    );
};

export default Spaces;
