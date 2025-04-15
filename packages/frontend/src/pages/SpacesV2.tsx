import { subject } from '@casl/ability';
import { ContentType, FeatureFlags, LightdashMode } from '@lightdash/common';
import { Button, Group, Menu, Stack } from '@mantine/core';
import { IconFolderPlus, IconPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useParams } from 'react-router';

import ForbiddenPanel from '../components/ForbiddenPanel';
import ErrorState from '../components/common/ErrorState';
import LoadingState from '../components/common/LoadingState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { ColumnVisibility } from '../components/common/ResourceView/types';

import SpaceActionModal from '../components/common/SpaceActionModal';
import { ActionType } from '../components/common/SpaceActionModal/types';
import { useSpacePinningMutation } from '../hooks/pinning/useSpaceMutation';
import { useFeatureFlagEnabled } from '../hooks/useFeatureFlagEnabled';
import { useSpaceSummaries } from '../hooks/useSpaces';
import useApp from '../providers/App/useApp';

const SpacesV2: FC = () => {
    const { projectUuid } = useParams() as {
        projectUuid: string;
    };

    const {
        /* eslint-disable-next-line */
        data: rootSpaces,
        isInitialLoading,
        error,
    } = useSpaceSummaries(projectUuid, true, {
        select: (data) => data.filter((s) => !s.parentSpaceUuid),
    });

    /* eslint-disable-next-line */
    const { mutate: pinSpace } = useSpacePinningMutation(projectUuid);
    const { user, health } = useApp();

    /* eslint-disable-next-line */
    const areNestedSpacesEnabled = useFeatureFlagEnabled(
        FeatureFlags.NestedSpaces,
    );

    const isDemo = health.data?.mode === LightdashMode.DEMO;

    const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
    const handleCreateSpace = () => {
        setIsCreateModalOpen(true);
    };

    const userCanManageSpace = user.data?.ability?.can(
        'create',
        subject('Space', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    if (isInitialLoading) {
        return <LoadingState title="Loading space" />;
    }

    if (error) {
        return <ErrorState error={error.error} />;
    }

    if (
        user.data?.ability?.cannot(
            'view',
            subject('Space', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
                isPrivate: false,
            }),
        )
    ) {
        return <ForbiddenPanel />;
    }

    return (
        <Page
            title="Spaces"
            withCenteredRoot
            withCenteredContent
            withXLargePaddedContent
            withLargeContent
        >
            <Stack spacing="xxl" w="100%">
                <Group position="apart">
                    <PageBreadcrumbs
                        items={[
                            { to: '/home', title: 'Home' },
                            { title: 'Spaces', active: true },
                        ]}
                    />

                    <Group spacing="xs">
                        {!isDemo && userCanManageSpace && (
                            <Menu
                                position="bottom-end"
                                shadow="md"
                                closeOnItemClick
                                withArrow
                                arrowPosition="center"
                            >
                                <Menu.Target>
                                    <Button
                                        leftIcon={<IconPlus size={18} />}
                                        onClick={handleCreateSpace}
                                    >
                                        Add
                                    </Button>
                                </Menu.Target>

                                <Menu.Dropdown>
                                    {userCanManageSpace && (
                                        <>
                                            <Menu.Item
                                                icon={
                                                    <MantineIcon
                                                        icon={IconFolderPlus}
                                                    />
                                                }
                                                onClick={() => {
                                                    setIsCreateModalOpen(true);
                                                }}
                                            >
                                                Create space
                                            </Menu.Item>
                                            <Menu.Divider />
                                        </>
                                    )}
                                </Menu.Dropdown>
                            </Menu>
                        )}
                    </Group>
                </Group>
                <InfiniteResourceTable
                    filters={{
                        projectUuid,
                        spaceUuids: [],
                    }}
                    contentTypeFilter={{
                        defaultValue: ContentType.SPACE,
                        options: [],
                    }}
                    columnVisibility={{
                        [ColumnVisibility.SPACE]: false,
                        [ColumnVisibility.UPDATED_AT]: false,
                        [ColumnVisibility.ACCESS]: true,
                        [ColumnVisibility.CONTENT]: true,
                    }}
                />

                {isCreateModalOpen && (
                    <SpaceActionModal
                        projectUuid={projectUuid!}
                        actionType={ActionType.CREATE}
                        title="Create new space"
                        confirmButtonLabel="Create"
                        icon={IconFolderPlus}
                        onClose={() => setIsCreateModalOpen(false)}
                    />
                )}
            </Stack>
        </Page>
    );
};

export default SpacesV2;
