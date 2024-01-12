import { subject } from '@casl/ability';
import {
    LightdashMode,
    ResourceViewItemType,
    spaceToResourceViewItem,
    wrapResourceView,
} from '@lightdash/common';
import { Button, Group, Stack } from '@mantine/core';
import { IconFolderPlus, IconFolders, IconPlus } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useParams } from 'react-router-dom';
import LoadingState from '../components/common/LoadingState';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ResourceView, {
    ResourceViewType,
} from '../components/common/ResourceView';
import SpaceActionModal, {
    ActionType,
} from '../components/common/SpaceActionModal';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useProject } from '../hooks/useProject';
import { useSpaceSummaries } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';
import { PinnedItemsProvider } from '../providers/PinnedItemsProvider';

const Spaces: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
    const { data: spaces = [], isInitialLoading: spaceIsLoading } =
        useSpaceSummaries(projectUuid, true);
    const project = useProject(projectUuid);
    const isLoading = spaceIsLoading || project.isInitialLoading;

    const { user, health } = useApp();

    const userCanManageProject = user.data?.ability?.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid: projectUuid,
        }),
    );

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
        <Page title="Spaces" withFixedContent withPaddedContent>
            <Stack spacing="xl">
                <Group position="apart">
                    <PageBreadcrumbs
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

                <PinnedItemsProvider
                    projectUuid={projectUuid}
                    organizationUuid={user.data?.organizationUuid ?? ''}
                    pinnedListUuid={project.data?.pinnedListUuid ?? ''}
                >
                    <ResourceView
                        view={ResourceViewType.GRID}
                        items={wrapResourceView(
                            spaces.map(spaceToResourceViewItem),
                            ResourceViewItemType.SPACE,
                        )}
                        tabs={
                            userCanManageProject
                                ? [
                                      {
                                          id: 'shared',
                                          name: 'Shared with me',
                                          filter: (item) =>
                                              item.type ===
                                                  ResourceViewItemType.SPACE &&
                                              (!item.data.isPrivate ||
                                                  (!!user.data &&
                                                      item.data.access.includes(
                                                          user.data.userUuid,
                                                      ))),
                                      },
                                      {
                                          id: 'all',
                                          name: 'Admin Content View',
                                          infoTooltipText:
                                              'View all public and private spaces in your organization',
                                      },
                                  ]
                                : []
                        }
                        headerProps={
                            !userCanManageProject
                                ? {
                                      title: 'Spaces',
                                  }
                                : undefined
                        }
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
                </PinnedItemsProvider>
            </Stack>

            {isCreateModalOpen && (
                <SpaceActionModal
                    projectUuid={projectUuid}
                    actionType={ActionType.CREATE}
                    title="Create new space"
                    confirmButtonLabel="Create"
                    icon={IconFolderPlus}
                    onClose={() => setIsCreateModalOpen(false)}
                />
            )}
        </Page>
    );
};

export default Spaces;
