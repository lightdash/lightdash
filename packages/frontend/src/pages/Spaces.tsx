import { subject } from '@casl/ability';
import {
    LightdashMode,
    ResourceViewItemType,
    spaceToResourceViewItem,
    wrapResourceView,
} from '@lightdash/common';
import { Button, Group, Stack, Switch } from '@mantine/core';
import { useToggle } from '@mantine/hooks';
import { IconFolders, IconPlus } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Can } from '../components/common/Authorization';
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
    const [includePrivateSpaces, setIncludePrivateSpaces] = useToggle();
    const { data: spaces = [], isLoading: spaceIsLoading } = useSpaceSummaries(
        projectUuid,
        includePrivateSpaces,
    );
    const project = useProject(projectUuid);
    const isLoading = spaceIsLoading || project.isLoading;

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
                        headerProps={{
                            title: 'Spaces',
                            action: (
                                <Can
                                    I="manage"
                                    this={subject('Project', {
                                        organizationUuid:
                                            user.data?.organizationUuid,
                                        projectUuid: projectUuid,
                                    })}
                                >
                                    <Switch
                                        label="Include all private spaces"
                                        checked={includePrivateSpaces}
                                        onChange={() =>
                                            setIncludePrivateSpaces()
                                        }
                                    />
                                </Can>
                            ),
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
                </PinnedItemsProvider>
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
        </Page>
    );
};

export default Spaces;
